import assert from "node:assert/strict";
import test from "node:test";

import { MockLanguageModelV4 } from "ai/test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { AgentActionService } from "@/modules/agent-actions/agent-action-service";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { resolvePaceContextEnvelope } from "@/modules/pace-agents/context";
import type { PaceContextEnvelope, PaceSubAgentResult } from "@/modules/pace-agents/domain";
import {
  createAgentActionDomainServices,
  type PaceDomainServices,
} from "@/modules/pace-agents/domain-services";
import { invokePaceCapability, resolvePaceApproval } from "@/modules/pace-agents/gateway";
import { createPaceOrchestrator } from "@/modules/pace-agents/orchestrator";
import { paceSubAgentRegistry } from "@/modules/pace-agents/registry";
import { routePaceRequest } from "@/modules/pace-agents/routing";
import { createInMemoryPaceTraceSink } from "@/modules/pace-agents/trace";
import { createTransactionsAgent } from "@/modules/transactions/agent/transactions-agent";
import { transactionsSubAgent } from "@/modules/transactions/agent/transactions-sub-agent";
import {
  getAgentTransactionDetail,
  resolveAgentTransactionRange,
  searchAgentTransactions,
} from "@/modules/transactions/queries/agent-transaction-reads";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryAgentActionRepository } from "../../support/in-memory-agent-action-repository";
import {
  InMemoryLedgerRepository,
  SYSTEM_OTHER_EXPENSE_ID,
  SYSTEM_SALARY_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";
import { createAccountWithOpeningBalance } from "../../support/opening-balance";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const outsider: AuthenticatedActor = { userId: "outsider-1", email: "outsider@pace.test", name: "Outsider" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";
// A Monday in Africa/Douala, so "this week" is 5–11 October and "yesterday" is the 4th.
const fixedNow = () => new Date("2026-10-05T09:00:00.000Z");

type Money = { minorUnits: string; currency: string };
type SearchData = {
  period: { from: string; to: string } | null;
  transactions: { id: string; amount: Money }[];
  totals: { spending: Money; income: Money } | null;
};
type DetailData = { id: string; amount: { currency: string; minor: string }; capabilities: { canDelete: boolean } };
type ToolOutput = {
  status: string;
  data: SearchData & { isReadyForApproval: boolean };
  actionId: string | null;
  error: { code: string; message: string } | null;
};
type Step = (outputs: Record<string, ToolOutput>) => { readonly call: readonly [string, unknown] } | { readonly text: string };

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** A deterministic stand-in for the model: each step sees the tool outputs so far and picks the next call. */
function scriptedModel(steps: readonly Step[]) {
  let index = 0;
  return new MockLanguageModelV4({
    doGenerate: async (options) => {
      const step = steps[index];
      index += 1;
      if (!step) throw new Error("The model was called more often than scripted.");
      const outputs: Record<string, ToolOutput> = {};
      for (const message of options.prompt) {
        if (message.role !== "tool") continue;
        for (const part of message.content) {
          if (part.type === "tool-result" && part.output.type === "json") {
            outputs[part.toolName] = part.output.value as ToolOutput;
          }
        }
      }
      const next = step(outputs);
      return "text" in next
        ? { content: [{ type: "text", text: next.text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }
        : {
            content: [{ type: "tool-call", toolCallId: `call-${index}`, toolName: next.call[0], input: JSON.stringify(next.call[1]) }],
            finishReason: { unified: "tool-calls", raw: undefined },
            usage,
            warnings: [],
          };
    },
  });
}

async function createFixture() {
  const actions = new InMemoryAgentActionRepository();
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const actionService = new AgentActionService(actions, ledger, ledgerRecords, workspaces);

  for (const id of [workspaceOne, workspaceTwo]) {
    const now = new Date("2026-09-14T00:00:00.000Z");
    const workspace: WorkspaceRecord = {
      id, name: id, slug: id, type: "PERSONAL", createdByUserId: owner.userId, createdAt: now, updatedAt: now,
    };
    await workspaces.createWorkspaceWithOwner({
      workspace,
      preferences: { currency: "XAF", locale: "fr-CM", timezone: "Africa/Douala", weekStartsOn: 1 },
      owner: { workspaceId: id, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now },
      initialAccount: { id: `${id}-main`, workspaceId: id, name: "Main account", type: "CHECKING", currency: "XAF", createdByUserId: owner.userId },
    });
  }
  workspaces.addMembership({
    workspaceId: workspaceOne, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: new Date(),
  });

  const main = await createAccountWithOpeningBalance(ledger, owner, workspaceOne, {
    name: "Main Account", type: "CHECKING", currency: "XAF", openingBalanceMinor: 100_000n,
  });
  const savings = await createAccountWithOpeningBalance(ledger, owner, workspaceOne, {
    name: "Savings", type: "SAVINGS", currency: "XAF",
  });
  const foreignAccount = await createAccountWithOpeningBalance(ledger, owner, workspaceTwo, {
    name: "Main Account", type: "CHECKING", currency: "XAF", openingBalanceMinor: 100_000n,
  });
  const food = await ledger.createCategory(owner, workspaceOne, { name: "Food", kind: "EXPENSE" });

  const expense = (workspaceId: string, accountId: string, amountMinor: string, occurredAt: string, note: string) =>
    ledger.createTransaction(owner, workspaceId, {
      kind: "EXPENSE", accountId, categoryId: SYSTEM_OTHER_EXPENSE_ID, amountMinor, currency: "XAF", occurredAt, note,
    });
  const lastWeek = await expense(workspaceOne, main.id, "5000", "2026-09-30T12:00:00.000Z", "Pharmacy");
  const restaurant = await expense(workspaceOne, main.id, "8000", "2026-10-04T12:00:00.000Z", "Restaurant Chez Wou");
  const shoes = await expense(workspaceOne, main.id, "20000", "2026-10-05T08:00:00.000Z", "Shoes");
  const foreign = await expense(workspaceTwo, foreignAccount.id, "7000", "2026-10-05T08:00:00.000Z", "Foreign groceries");

  const reads = { ledger: ledgerRecords, workspaces };
  const unused = async () => {
    throw new Error("This domain service does not belong to the Transactions sub-agent.");
  };
  const services: PaceDomainServices = {
    ...createAgentActionDomainServices(actionService),
    searchTransactions: (scope, query) => searchAgentTransactions({ ...scope, query, now: fixedNow() }, reads),
    getTransactionDetail: (scope, transactionId) => getAgentTransactionDetail({ ...scope, transactionId }, reads),
    getRecentTransactions: unused,
    getExpenses: unused,
    getOverviewSummary: unused,
    getAccounts: unused,
    getAccount: unused,
    getAccountMovements: unused,
    compareAccountMovements: unused,
    checkAccountSpendability: unused,
    getRecurringPayments: unused,
    getRecurringPayment: unused,
    getRecurringSpending: unused,
    getUpcomingRecurring: unused,
    getInboxItems: unused,
    getInboxItem: unused,
    getBudgets: unused,
    getBudget: unused,
    getSavingsGoals: unused,
    getSavingsGoal: unused,
    getForecast: unused,
    getRules: unused,
    getRule: unused,
    getInsightContext: unused,
    getInsightsAnalytics: unused,
    getCategoryInsights: unused,
    getAccountInsights: unused,
    getInsightsTrends: unused,
    getRecurringInsights: unused,
    createInsightChart: unused,
    generateFinancialReport: unused,
  };

  const trace = createInMemoryPaceTraceSink();
  const deps = { registry: paceSubAgentRegistry, services, trace, now: fixedNow };
  const envelopeFor = (actor: AuthenticatedActor, workspaceId: string, sessionId = "session-1") =>
    resolvePaceContextEnvelope(workspaces, { actor, workspaceId, language: "en", session: { runtime: "local", id: sessionId } });

  let turn = 0;
  /** One member turn through the orchestrator with the real TransactionsAgent and a scripted model. */
  const ask = async (request: string, steps: readonly Step[], envelope?: PaceContextEnvelope) => {
    turn += 1;
    const model = scriptedModel(steps);
    const result = await createPaceOrchestrator({
      ...deps,
      executors: { transactions: createTransactionsAgent({ model }) },
    }).handle({ request, envelope: envelope ?? (await envelopeFor(owner, workspaceOne, `session-${turn}`)) });
    const transactions = result.results.find((entry) => entry.agentId === "transactions");
    assert.ok(transactions, `"${request}" reaches the Transactions sub-agent`);
    return { result, transactions, model };
  };

  const submitCall = (actionId: string, envelope: PaceContextEnvelope, callId: string) =>
    ({ agentId: "transactions", tool: "submit_transaction_draft", input: { actionId }, envelope, callId }) as const;
  /** APPROVAL → EXECUTE → VERIFY, as the member's confirmation drives it. */
  const approveAndExecute = async (actionId: string, envelope: PaceContextEnvelope) => {
    const approval = await resolvePaceApproval(deps, submitCall(actionId, envelope, `approve-${actionId}`), "approve");
    assert.equal(approval.result.status, "ok");
    return (await invokePaceCapability(deps, submitCall(actionId, envelope, `execute-${actionId}`))).result;
  };

  return {
    actions, approveAndExecute, ask, deps, envelopeFor, food, foreign, ledgerRecords, main, restaurant, savings, shoes,
    lastWeek, submitCall, trace,
  };
}

const outputsOf = (result: PaceSubAgentResult) => result.toolResults.map((toolResult) => `${toolResult.tool}:${toolResult.status}`);
const draftOf = (result: PaceSubAgentResult, tool: string) =>
  (result.toolResults.find((toolResult) => toolResult.tool === tool)?.data as { draft: Record<string, unknown> & { current: { amountMinor: string } } }).draft;

const recordExpense = (accountHint: string | undefined, sourceText: string, amountText: string): Step[] => [
  () => ({ call: ["get_transaction_context", {}] }),
  () => ({ call: ["create_transaction_draft", { kind: "EXPENSE", amountText, sourceText, ...(accountHint ? { accountHint } : {}) }] }),
  (outputs) =>
    outputs.create_transaction_draft!.data.isReadyForApproval
      ? { call: ["submit_transaction_draft", { actionId: outputs.create_transaction_draft!.actionId }] }
      : { text: "Which account did you pay from?" },
];

test("the registered transactions sub-agent owns every capability the TransactionsAgent offers the model", async () => {
  const { ask } = await createFixture();
  const { model } = await ask("Show my last 10 transactions", [() => ({ text: "Nothing to add." })]);

  const call = model.doGenerateCalls[0]!;
  assert.deepEqual(
    (call.tools ?? []).map((tool) => tool.name).sort(),
    transactionsSubAgent.capabilities.map((capability) => capability.tool).sort(),
  );
  const system = JSON.stringify(call.prompt.filter((message) => message.role === "system"));
  assert.match(system, /never add up rows yourself/);
  assert.match(system, /Workspace currency: XAF/);

  const tools = transactionsSubAgent.capabilities.map((capability) => capability.tool);
  assert.equal(tools.some((tool) => /delete|remove|reverse/.test(tool)), false);
  assert.deepEqual(
    transactionsSubAgent.capabilities.filter((capability) => capability.access === "commit").map((capability) => capability.tool),
    ["submit_transaction_draft"],
  );
});

test("the seven example requests all route to the Transactions sub-agent", () => {
  const examples = [
    ["How much did I spend this week?", "read"],
    ["Show my last 10 transactions", "read"],
    ["I spent 12,500 XAF on lunch", "write"],
    ["I received 300,000 XAF salary", "write"],
    ["Transfer 50,000 XAF from Main Account to Savings", "write"],
    ["Change yesterday's restaurant category to Food", "write"],
    ["That 20,000 expense was actually 25,000", "write"],
  ] as const;
  for (const [request, intent] of examples) {
    const plan = routePaceRequest(paceSubAgentRegistry, request);
    assert.equal(plan.routes[0]?.agentId, "transactions", request);
    assert.equal(plan.intent, intent, request);
  }
});

test("read queries execute without approval and return server-computed totals and rows", async () => {
  const { actions, ask, ledgerRecords, restaurant, shoes, lastWeek, trace } = await createFixture();
  const before = ledgerRecords.transactions.size;

  const spending = await ask("How much did I spend this week?", [
    () => ({ call: ["search_transactions", { period: "THIS_WEEK", kind: "EXPENSE" }] }),
    (outputs) => ({ text: `You spent ${outputs.search_transactions!.data.totals!.spending.minorUnits} XAF this week.` }),
  ]);
  assert.equal(spending.transactions.status, "completed");
  assert.deepEqual(outputsOf(spending.transactions), ["search_transactions:ok"]);
  const week = spending.transactions.toolResults[0]!.data as SearchData;
  assert.deepEqual(week.period, { from: "2026-10-05", to: "2026-10-11" });
  assert.deepEqual(week.totals?.spending, { minorUnits: "20000", currency: "XAF" });
  assert.deepEqual(week.transactions.map((row) => row.id), [shoes.id]);
  assert.equal(spending.transactions.summary, "You spent 20000 XAF this week.");

  const recent = await ask("Show my last 10 transactions", [
    () => ({ call: ["search_transactions", { limit: 10 }] }),
    () => ({ text: "Here are your latest transactions." }),
  ]);
  assert.equal(recent.result.status, "completed");
  assert.deepEqual(recent.result.pendingApprovals, []);
  const rows = (recent.transactions.toolResults[0]!.data as SearchData).transactions;
  assert.deepEqual(rows.map((row) => row.id), [shoes.id, restaurant.id, lastWeek.id]);
  assert.deepEqual(rows[0].amount, { minorUnits: "20000", currency: "XAF" });

  const inspected = await ask("Show me that shoes transaction", [
    () => ({ call: ["get_transaction", { transactionId: shoes.id }] }),
    () => ({ text: "That was 20000 XAF for shoes." }),
  ]);
  const detail = inspected.transactions.toolResults[0]!.data as DetailData;
  assert.equal(detail.id, shoes.id);
  assert.deepEqual(detail.amount, { currency: "XAF", minor: "20000" });
  assert.equal(detail.capabilities.canDelete, false);

  assert.equal(ledgerRecords.transactions.size, before);
  assert.equal(actions.actions.size, 0);
  assert.equal(trace.events.some((event) => event.type.startsWith("approval.")), false);
});

test("named periods resolve in the workspace timezone and week start, not in the model", () => {
  const preferences = { timezone: "Africa/Douala", weekStartsOn: 1 };
  const range = (period: Parameters<typeof resolveAgentTransactionRange>[0]["period"], now = fixedNow()) =>
    resolveAgentTransactionRange({ period }, preferences, now);

  assert.deepEqual(range("TODAY"), { from: "2026-10-05", to: "2026-10-05" });
  assert.deepEqual(range("YESTERDAY"), { from: "2026-10-04", to: "2026-10-04" });
  assert.deepEqual(range("LAST_WEEK"), { from: "2026-09-28", to: "2026-10-04" });
  assert.deepEqual(range("THIS_MONTH"), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(range("LAST_MONTH"), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(range("TODAY", new Date("2026-10-04T23:30:00.000Z")), { from: "2026-10-05", to: "2026-10-05" });
  assert.deepEqual(
    resolveAgentTransactionRange({ period: "THIS_WEEK" }, { timezone: "Africa/Douala", weekStartsOn: 0 }, fixedNow()),
    { from: "2026-10-04", to: "2026-10-10" },
  );
  assert.equal(resolveAgentTransactionRange({}, preferences, fixedNow()), null);
});

test("an expense is prepared as a draft with exact minor units and parked for approval", async () => {
  const { actions, ask, ledgerRecords, main } = await createFixture();
  const before = ledgerRecords.transactions.size;

  const { result, transactions } = await ask(
    "I spent 12,500 XAF on lunch",
    recordExpense("Main Account", "I spent 12,500 XAF on lunch", "12,500"),
  );

  assert.equal(result.status, "approval_required");
  assert.deepEqual(outputsOf(transactions), [
    "get_transaction_context:ok",
    "create_transaction_draft:ok",
    "submit_transaction_draft:approval_required",
  ]);
  const draft = draftOf(transactions, "create_transaction_draft");
  assert.equal(draft.kind, "EXPENSE");
  assert.equal(draft.amountMinor, "12500");
  assert.equal(draft.currency, "XAF");
  assert.equal(draft.accountId, main.id);
  assert.equal(draft.categoryId, SYSTEM_OTHER_EXPENSE_ID);
  assert.deepEqual(draft.missingFields, []);

  const actionId = transactions.pendingApprovals[0]!.actionId;
  assert.deepEqual(result.pendingApprovals, [{ agentId: "transactions", tool: "submit_transaction_draft", actionId }]);
  assert.equal((await actions.findAction(workspaceOne, actionId))?.status, "WAITING_APPROVAL");
  assert.equal(ledgerRecords.transactions.size, before);
});

test("income is prepared against the income category and never as spending", async () => {
  const { ask, ledgerRecords, main } = await createFixture();
  const before = ledgerRecords.transactions.size;

  const { result, transactions } = await ask("I received 300,000 XAF salary", [
    () => ({ call: ["get_transaction_context", {}] }),
    () => ({
      call: ["create_transaction_draft", {
        kind: "INCOME", amountText: "300,000", accountHint: "Main Account", sourceText: "I received 300,000 XAF salary",
      }],
    }),
    (outputs) => ({ call: ["submit_transaction_draft", { actionId: outputs.create_transaction_draft!.actionId }] }),
  ]);

  assert.equal(result.status, "approval_required");
  const draft = draftOf(transactions, "create_transaction_draft");
  assert.equal(draft.kind, "INCOME");
  assert.equal(draft.amountMinor, "300000");
  assert.equal(draft.accountId, main.id);
  assert.equal(draft.categoryId, SYSTEM_SALARY_ID);
  assert.equal(ledgerRecords.transactions.size, before);
});

test("a transfer is prepared between two accounts and stays a movement, not spending", async () => {
  const { approveAndExecute, ask, envelopeFor, ledgerRecords, main, savings } = await createFixture();
  const request = "Transfer 50,000 XAF from Main Account to Savings";

  const { result, transactions } = await ask(request, [
    () => ({ call: ["get_transaction_context", {}] }),
    () => ({
      call: ["create_transaction_draft", {
        kind: "TRANSFER", amountText: "50,000", accountHint: "Main Account", transferAccountHint: "Savings", sourceText: request,
      }],
    }),
    (outputs) => ({ call: ["submit_transaction_draft", { actionId: outputs.create_transaction_draft!.actionId }] }),
  ]);

  assert.equal(result.status, "approval_required");
  const draft = draftOf(transactions, "create_transaction_draft");
  assert.equal(draft.kind, "TRANSFER");
  assert.equal(draft.amountMinor, "50000");
  assert.equal(draft.accountId, main.id);
  assert.equal(draft.transferAccountId, savings.id);
  assert.equal(draft.categoryId, null);

  const executed = await approveAndExecute(transactions.pendingApprovals[0]!.actionId, await envelopeFor(owner, workspaceOne));
  assert.equal(executed.status, "ok");
  const transfer = ledgerRecords.transactions.get((executed.data as { transactionId: string }).transactionId)!;
  assert.equal(transfer.kind, "TRANSFER");
  assert.equal(transfer.accountId, main.id);
  assert.equal(transfer.transferAccountId, savings.id);
  assert.equal(transfer.categoryId, null);
  assert.notEqual(transfer.transferGroupId, null);

  const week = await ask("How much did I spend this week?", [
    () => ({ call: ["search_transactions", { period: "THIS_WEEK" }] }),
    () => ({ text: "Done." }),
  ]);
  const totals = (week.transactions.toolResults[0]!.data as SearchData).totals!;
  assert.deepEqual(totals.spending, { minorUnits: "20000", currency: "XAF" });
  assert.deepEqual(totals.income, { minorUnits: "0", currency: "XAF" });
});

test("a missing account, category, or destination is asked for, never guessed", async () => {
  const { actions, ask, ledgerRecords } = await createFixture();
  const before = ledgerRecords.transactions.size;

  const noAccount = await ask(
    "I spent 12,500 XAF on lunch",
    recordExpense(undefined, "I spent 12,500 XAF on lunch", "12,500"),
  );
  assert.equal(noAccount.transactions.status, "needs_input");
  assert.deepEqual(draftOf(noAccount.transactions, "create_transaction_draft").missingFields, ["account"]);
  assert.equal(draftOf(noAccount.transactions, "create_transaction_draft").accountId, null);
  assert.equal(noAccount.transactions.summary, "Which account did you pay from?");
  assert.deepEqual(noAccount.result.pendingApprovals, []);

  const noCategory = await ask("spent 4000", recordExpense("Main Account", "spent 4000", "4000"));
  assert.equal(noCategory.transactions.status, "needs_input");
  assert.deepEqual(draftOf(noCategory.transactions, "create_transaction_draft").missingFields, ["category"]);

  const unknownDestination = await ask("Transfer 50,000 XAF from Main Account to Vacation", [
    () => ({ call: ["get_transaction_context", {}] }),
    () => ({
      call: ["create_transaction_draft", {
        kind: "TRANSFER", amountText: "50,000", accountHint: "Main Account", transferAccountHint: "Vacation",
        sourceText: "Transfer 50,000 XAF from Main Account to Vacation",
      }],
    }),
    (outputs) => ({ call: ["submit_transaction_draft", { actionId: outputs.create_transaction_draft!.actionId }] }),
  ]);
  assert.deepEqual(draftOf(unknownDestination.transactions, "create_transaction_draft").missingFields, ["destinationAccount"]);
  assert.deepEqual(outputsOf(unknownDestination.transactions).at(-1), "submit_transaction_draft:refused");
  assert.equal(unknownDestination.transactions.toolResults.at(-1)?.error?.code, "DOMAIN_REJECTED");
  assert.equal(unknownDestination.transactions.status, "needs_input");
  assert.deepEqual(unknownDestination.result.pendingApprovals, []);

  assert.equal([...actions.actions.values()].every((action) => action.status === "DRAFT"), true);
  assert.equal(ledgerRecords.transactions.size, before);
});

test("a category change is prepared as a safe metadata edit that never touches the amount", async () => {
  const { actions, approveAndExecute, ask, envelopeFor, food, ledgerRecords, restaurant } = await createFixture();
  const request = "Change yesterday's restaurant category to Food";
  const before = ledgerRecords.transactions.size;

  const { result, transactions } = await ask(request, [
    () => ({ call: ["search_transactions", { period: "YESTERDAY", search: "restaurant" }] }),
    (outputs) => ({
      call: ["create_transaction_change_draft", {
        transactionId: outputs.search_transactions!.data.transactions[0].id, categoryHint: "Food", sourceText: request,
      }],
    }),
    (outputs) => ({ call: ["submit_transaction_draft", { actionId: outputs.create_transaction_change_draft!.actionId }] }),
  ]);

  assert.equal(result.status, "approval_required");
  const found = (transactions.toolResults[0]!.data as SearchData).transactions;
  assert.deepEqual(found.map((row) => row.id), [restaurant.id]);
  const draft = draftOf(transactions, "create_transaction_change_draft");
  assert.equal(draft.changeType, "DETAILS");
  assert.equal(draft.transactionId, restaurant.id);
  assert.deepEqual(draft.changes, { categoryId: food.id });
  const actionId = transactions.pendingApprovals[0]!.actionId;
  assert.equal((await actions.findAction(workspaceOne, actionId))?.type, "TRANSACTION_UPDATE");
  assert.equal(ledgerRecords.transactions.get(restaurant.id)?.categoryId, SYSTEM_OTHER_EXPENSE_ID);

  const executed = await approveAndExecute(actionId, await envelopeFor(owner, workspaceOne));
  assert.equal(executed.status, "ok");
  assert.deepEqual(
    { ...(executed.data as object), verifiedAt: null },
    { changeType: "DETAILS", transactionId: restaurant.id, originalTransactionId: restaurant.id, verifiedAt: null },
  );
  const updated = ledgerRecords.transactions.get(restaurant.id)!;
  assert.equal(updated.categoryId, food.id);
  assert.equal(updated.amountMinor, 8_000n);
  assert.equal(updated.accountId, restaurant.accountId);
  assert.equal(ledgerRecords.transactions.size, before);
  assert.deepEqual(
    (await ledgerRecords.listTransactionAudit(workspaceOne, restaurant.id)).map((audit) => audit.action),
    ["UPDATE"],
  );

  const unknownCategory = await ask(request, [
    () => ({
      call: ["create_transaction_change_draft", { transactionId: restaurant.id, categoryHint: "Entertainment", sourceText: request }],
    }),
    () => ({ text: "I could not find an Entertainment category. Which category should I use?" }),
  ]);
  assert.equal(unknownCategory.transactions.status, "needs_input");
  assert.deepEqual(draftOf(unknownCategory.transactions, "create_transaction_change_draft").missingFields, ["category"]);
});

test("an amount change is prepared as a ledger correction that keeps the posted original", async () => {
  const { actions, approveAndExecute, ask, deps, envelopeFor, ledgerRecords, shoes, submitCall } = await createFixture();
  const request = "That 20,000 expense was actually 25,000";
  const before = ledgerRecords.transactions.size;

  const { result, transactions } = await ask(request, [
    () => ({ call: ["search_transactions", { kind: "EXPENSE", amountText: "20,000" }] }),
    (outputs) => ({
      call: ["create_transaction_change_draft", {
        transactionId: outputs.search_transactions!.data.transactions[0].id, amountText: "25,000", sourceText: request,
      }],
    }),
    (outputs) => ({ call: ["submit_transaction_draft", { actionId: outputs.create_transaction_change_draft!.actionId }] }),
  ]);

  assert.equal(result.status, "approval_required");
  const search = transactions.toolResults[0]!.data as SearchData;
  assert.deepEqual(search.transactions.map((row) => row.id), [shoes.id]);
  assert.equal(search.totals, null);
  const draft = draftOf(transactions, "create_transaction_change_draft");
  assert.equal(draft.changeType, "FINANCIAL");
  assert.deepEqual(draft.changes, { amountMinor: "25000" });
  assert.equal(draft.current.amountMinor, "20000");
  const actionId = transactions.pendingApprovals[0]!.actionId;
  assert.equal((await actions.findAction(workspaceOne, actionId))?.type, "TRANSACTION_CORRECT");
  assert.equal(ledgerRecords.transactions.size, before);

  const envelope = await envelopeFor(owner, workspaceOne);
  const executed = await approveAndExecute(actionId, envelope);
  assert.equal(executed.status, "ok");
  const correction = executed.data as { changeType: string; transactionId: string; originalTransactionId: string };
  assert.equal(correction.changeType, "FINANCIAL");
  assert.equal(correction.originalTransactionId, shoes.id);
  assert.notEqual(correction.transactionId, shoes.id);

  const original = ledgerRecords.transactions.get(shoes.id)!;
  const replacement = ledgerRecords.transactions.get(correction.transactionId)!;
  const reversal = [...ledgerRecords.transactions.values()].find((entry) => entry.reversalOfTransactionId === shoes.id)!;
  assert.equal(original.amountMinor, 20_000n);
  assert.equal(reversal.amountMinor, 20_000n);
  assert.equal(replacement.amountMinor, 25_000n);
  assert.equal(replacement.kind, "EXPENSE");
  assert.equal(replacement.accountId, shoes.accountId);
  assert.equal(replacement.categoryId, shoes.categoryId);
  assert.equal(ledgerRecords.transactions.size, before + 2);

  const replayed = await invokePaceCapability(deps, submitCall(actionId, envelope, "replay"));
  assert.deepEqual(replayed.result.data, executed.data);
  assert.equal(ledgerRecords.transactions.size, before + 2);

  const week = await ask("How much did I spend this week?", [
    () => ({ call: ["search_transactions", { period: "THIS_WEEK", kind: "EXPENSE" }] }),
    () => ({ text: "Done." }),
  ]);
  const data = week.transactions.toolResults[0]!.data as SearchData;
  assert.deepEqual(data.totals?.spending, { minorUnits: "25000", currency: "XAF" });
  assert.deepEqual(data.transactions.map((row) => row.id), [replacement.id]);

  const stale = await ask(request, [
    () => ({ call: ["create_transaction_change_draft", { transactionId: shoes.id, amountText: "30,000", sourceText: request }] }),
    () => ({ text: "Ready." }),
  ]);
  assert.equal(draftOf(stale.transactions, "create_transaction_change_draft").transactionId, replacement.id);
});

test("every AI-initiated write is held for approval and cannot be skipped, repeated, or revived", async () => {
  const { actions, ask, deps, envelopeFor, ledgerRecords, restaurant, submitCall } = await createFixture();
  const before = ledgerRecords.transactions.size;
  const snapshot = () => JSON.stringify([...ledgerRecords.transactions.values()], (_key, value) => (typeof value === "bigint" ? value.toString() : value));
  const ledgerBefore = snapshot();

  for (const capability of transactionsSubAgent.capabilities) {
    if (capability.access === "read") continue;
    assert.equal(capability.requiredPermission, "manage_ledger", capability.tool);
    assert.equal(capability.approval, capability.access === "commit" ? "required" : "none", capability.tool);
  }

  const pushy = await ask("I spent 12,500 XAF on lunch", [
    ...recordExpense("Main Account", "I spent 12,500 XAF on lunch", "12,500"),
    (outputs) => ({ call: ["submit_transaction_draft", { actionId: outputs.create_transaction_draft!.actionId }] }),
    () => ({ text: "Your expense is recorded." }),
  ]);
  assert.equal(pushy.model.doGenerateCalls.length, 3);
  assert.equal(pushy.transactions.status, "approval_required");
  assert.equal(pushy.transactions.summary, null);
  const actionId = pushy.transactions.pendingApprovals[0]!.actionId;

  const envelope = await envelopeFor(owner, workspaceOne);
  const unapproved = await invokePaceCapability(deps, submitCall(actionId, envelope, "unapproved"));
  assert.equal(unapproved.result.status, "approval_required");
  assert.equal(unapproved.result.data, null);
  assert.equal(snapshot(), ledgerBefore);

  const viewerEnvelope = await envelopeFor(viewer, workspaceOne);
  const viewerApproval = await resolvePaceApproval(deps, submitCall(actionId, viewerEnvelope, "viewer-approve"), "approve");
  assert.equal(viewerApproval.result.error?.code, "PERMISSION_DENIED");
  const viewerWrites = [
    ["create_transaction_draft", { kind: "EXPENSE", amountText: "100", sourceText: "taxi 100" }],
    ["create_transaction_change_draft", { transactionId: restaurant.id, categoryHint: "Food", sourceText: "food" }],
    ["submit_transaction_draft", { actionId }],
  ] as const;
  for (const [tool, input] of viewerWrites) {
    const outcome = await invokePaceCapability(deps, { agentId: "transactions", tool, input, envelope: viewerEnvelope, callId: `viewer-${tool}` });
    assert.equal(outcome.result.error?.code, "PERMISSION_DENIED", tool);
  }
  const viewerRead = await invokePaceCapability(deps, {
    agentId: "transactions", tool: "search_transactions", input: {}, envelope: viewerEnvelope, callId: "viewer-read",
  });
  assert.equal(viewerRead.result.status, "ok");

  await resolvePaceApproval(deps, submitCall(actionId, envelope, "reject"), "reject");
  const rejected = await invokePaceCapability(deps, submitCall(actionId, envelope, "after-reject"));
  assert.equal(rejected.result.status, "refused");
  assert.equal(rejected.result.error?.code, "DOMAIN_REJECTED");

  const change = await invokePaceCapability(deps, {
    agentId: "transactions",
    tool: "create_transaction_change_draft",
    input: { transactionId: restaurant.id, amountText: "9,000", sourceText: "it was 9,000" },
    envelope,
    callId: "change",
  });
  const parked = await invokePaceCapability(deps, submitCall(change.result.actionId!, envelope, "change-submit"));
  assert.equal(parked.result.status, "approval_required");
  await resolvePaceApproval(deps, submitCall(change.result.actionId!, envelope, "change-reject"), "reject");
  assert.equal((await invokePaceCapability(deps, submitCall(change.result.actionId!, envelope, "change-run"))).result.status, "refused");

  assert.equal(ledgerRecords.transactions.size, before);
  assert.equal(snapshot(), ledgerBefore);
  assert.equal([...actions.actions.values()].some((action) => action.status === "COMPLETED"), false);
});

test("insufficient funds reach the member as the ledger's refusal and nothing is written", async () => {
  const { actions, approveAndExecute, ask, envelopeFor, ledgerRecords } = await createFixture();
  const before = ledgerRecords.transactions.size;

  const prepared = await ask(
    "I spent 500,000 XAF on a laptop",
    recordExpense("Main Account", "I spent 500,000 XAF on a laptop", "500,000"),
  );
  assert.equal(prepared.result.status, "approval_required");
  const actionId = prepared.transactions.pendingApprovals[0]!.actionId;

  const executed = await approveAndExecute(actionId, await envelopeFor(owner, workspaceOne));
  assert.equal(executed.status, "refused");
  assert.equal(executed.error?.code, "DOMAIN_REJECTED");
  assert.match(executed.error?.message ?? "", /enough available funds/);
  assert.equal(executed.data, null);
  assert.equal(ledgerRecords.transactions.size, before);
  const failed = await actions.findAction(workspaceOne, actionId);
  assert.equal(failed?.status, "FAILED");
  assert.match(failed?.failureMessage ?? "", /enough available funds/);

  const retried = await ask("Did my laptop expense go through?", [
    () => ({ call: ["submit_transaction_draft", { actionId }] }),
  ]);
  assert.equal(retried.transactions.status, "refused");
  assert.equal(retried.transactions.error?.code, "DOMAIN_REJECTED");
  assert.equal(ledgerRecords.transactions.size, before);

  const overCorrection = await ask("That 20,000 expense was actually 900,000", [
    () => ({ call: ["search_transactions", { kind: "EXPENSE", amountText: "20,000" }] }),
    (outputs) => ({
      call: ["create_transaction_change_draft", {
        transactionId: outputs.search_transactions!.data.transactions[0].id, amountText: "900,000", sourceText: "actually 900,000",
      }],
    }),
    (outputs) => ({ call: ["submit_transaction_draft", { actionId: outputs.create_transaction_change_draft!.actionId }] }),
  ]);
  const correction = await approveAndExecute(
    overCorrection.transactions.pendingApprovals[0]!.actionId,
    await envelopeFor(owner, workspaceOne),
  );
  assert.equal(correction.status, "refused");
  assert.match(correction.error?.message ?? "", /enough available funds/);
  assert.equal(ledgerRecords.transactions.size, before);
});

test("the agent cannot read, change, or submit across workspaces", async () => {
  const { ask, deps, envelopeFor, food, foreign, ledgerRecords, main, shoes, submitCall } = await createFixture();
  await assert.rejects(envelopeFor(outsider, workspaceOne), AuthorizationError);
  await assert.rejects(envelopeFor(viewer, workspaceTwo), AuthorizationError);

  const elsewhere = await envelopeFor(owner, workspaceTwo, "session-two");
  const listed = await ask("Show my last 10 transactions", [
    () => ({ call: ["search_transactions", { limit: 10 }] }),
    () => ({ text: "Done." }),
  ], elsewhere);
  const rows = (listed.transactions.toolResults[0]!.data as SearchData).transactions;
  assert.deepEqual(rows.map((row) => row.id), [foreign.id]);
  assert.equal(JSON.stringify(listed.result).includes(shoes.id), false);

  const attempts = [
    ["get_transaction", { transactionId: shoes.id }],
    ["search_transactions", { accountId: main.id }],
    ["search_transactions", { categoryId: food.id }],
    ["create_transaction_change_draft", { transactionId: shoes.id, amountText: "1", sourceText: "make it 1" }],
  ] as const;
  for (const [tool, input] of attempts) {
    const outcome = await invokePaceCapability(deps, { agentId: "transactions", tool, input, envelope: elsewhere, callId: `cross-${tool}` });
    assert.equal(outcome.result.status, "refused", tool);
    assert.equal(outcome.result.error?.code, "DOMAIN_REJECTED", tool);
    assert.equal(outcome.result.data, null, tool);
  }
  const smuggled = await invokePaceCapability(deps, {
    agentId: "transactions", tool: "search_transactions", input: { workspaceId: workspaceOne }, envelope: elsewhere, callId: "smuggle",
  });
  assert.equal(smuggled.result.error?.code, "INVALID_INPUT");

  const home = await envelopeFor(owner, workspaceOne);
  const change = await invokePaceCapability(deps, {
    agentId: "transactions",
    tool: "create_transaction_change_draft",
    input: { transactionId: shoes.id, amountText: "25,000", sourceText: "actually 25,000" },
    envelope: home,
    callId: "home-change",
  });
  assert.equal(change.result.status, "ok");
  const leaked = await invokePaceCapability(deps, submitCall(change.result.actionId!, elsewhere, "leak"));
  assert.equal(leaked.result.status, "refused");
  assert.equal(leaked.result.error?.code, "DOMAIN_REJECTED");
  assert.equal(ledgerRecords.transactions.get(shoes.id)?.amountMinor, 20_000n);
});

test("an approved write is verified against the ledger, audited, and idempotent on replay", async () => {
  const { actions, approveAndExecute, ask, deps, envelopeFor, ledgerRecords, main, submitCall, trace } = await createFixture();
  const before = ledgerRecords.transactions.size;

  const { transactions } = await ask(
    "I spent 12,500 XAF on lunch",
    recordExpense("Main Account", "I spent 12,500 XAF on lunch", "12,500"),
  );
  const actionId = transactions.pendingApprovals[0]!.actionId;
  const envelope = await envelopeFor(owner, workspaceOne);

  const executed = await approveAndExecute(actionId, envelope);
  assert.equal(executed.status, "ok");
  assert.equal(executed.actionId, actionId);
  const verified = executed.data as { transactionId: string; kind: string; verifiedAt: string };
  assert.equal(verified.kind, "EXPENSE");
  assert.ok(!Number.isNaN(Date.parse(verified.verifiedAt)));

  const posted = ledgerRecords.transactions.get(verified.transactionId)!;
  assert.equal(posted.workspaceId, workspaceOne);
  assert.equal(posted.amountMinor, 12_500n);
  assert.equal(posted.currency, "XAF");
  assert.equal(posted.accountId, main.id);
  assert.equal(posted.status, "POSTED");
  assert.equal(posted.source.agentActionId, actionId);
  assert.equal(posted.deduplicationFingerprint, `agent-action:${actionId}`);
  assert.equal(ledgerRecords.transactions.size, before + 1);

  const completed = await actions.findAction(workspaceOne, actionId);
  assert.equal(completed?.status, "COMPLETED");
  assert.deepEqual(completed?.result, verified);
  assert.deepEqual(
    (await actions.listAudit(workspaceOne, actionId)).map((event) => event.event),
    ["DRAFT_CREATED", "APPROVAL_REQUESTED", "APPROVED", "EXECUTION_STARTED", "PERSISTENCE_VERIFIED"],
  );

  const replay = await invokePaceCapability(deps, submitCall(actionId, envelope, "replay"));
  assert.deepEqual(replay.result.data, verified);
  assert.equal(ledgerRecords.transactions.size, before + 1);

  const confirmed = await ask("Show my last 10 transactions", [
    () => ({ call: ["get_transaction", { transactionId: verified.transactionId }] }),
    () => ({ text: "It is recorded." }),
  ]);
  assert.deepEqual((confirmed.transactions.toolResults[0]!.data as DetailData).amount, { currency: "XAF", minor: "12500" });

  const lifecycle = trace.events.flatMap((event) =>
    (event.type === "tool.completed" || event.type.startsWith("approval.")) && "actionId" in event && event.actionId === actionId
      ? [`${event.type}:${"status" in event ? event.status : ""}`]
      : [],
  );
  assert.deepEqual(lifecycle, [
    "tool.completed:ok",
    "tool.completed:approval_required",
    "approval.granted:",
    "tool.completed:ok",
    "tool.completed:ok",
  ]);
  for (const event of trace.events) assert.equal(JSON.stringify(event).includes("12500"), false);
});
