import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { MockLanguageModelV4 } from "ai/test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { toCurrencyCode } from "@/money/currency";
import { createAccountsAgent } from "@/modules/accounts/agent/accounts-agent";
import { accountsSubAgent } from "@/modules/accounts/agent/accounts-sub-agent";
import { buildAccountsOverview } from "@/modules/accounts/domain/accounts-overview";
import {
  checkAgentAccountSpendability,
  compareAgentAccountMovements,
  getAgentAccount,
  getAgentAccountMovements,
} from "@/modules/accounts/queries/agent-account-reads";
import { AgentActionService } from "@/modules/agent-actions/agent-action-service";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { getAccountSpendability, InsufficientFundsError } from "@/modules/ledger/spendability-policy";
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
const fixedNow = () => new Date("2026-10-05T09:00:00.000Z");
const thisMonth = { from: "2026-10-01", to: "2026-10-31" };

type Money = { minorUnits: string; currency: string };
type AccountView = { id: string; name: string; type: string; currency: string; status: "ACTIVE" | "ARCHIVED" };
type Unresolved = { resolved: false; reason: "AMBIGUOUS" | "NOT_FOUND"; candidates: AccountView[] };
type Overview = {
  counts: Record<string, number>;
  summary: { currency: string; currentBalanceMinor: string; accountCount: number }[];
  accounts: (AccountView & { currentBalanceMinor: string; availableBalanceMinor: string })[];
};
type Summary = {
  period: { from: string; to: string };
  inflows: Money;
  outflows: Money;
  netMovement: Money;
  netTransfers: Money;
  movementCount: number;
};
type Detail = {
  resolved: true;
  account: AccountView;
  balance: { current: Money; available: Money; spendabilityMode: string };
  openingBalance: { amount: Money; effectiveAt: string } | null;
  allowedActions: { canRename: boolean; canChangeType: boolean; canDelete: boolean; reasons: Record<string, string> };
  thisMonth: Summary;
};
type Movements = Summary & {
  resolved: true;
  account: AccountView;
  currentBalance: Money;
  listedCount: number;
  movements: { id: string; kind: string; direction: string; movement: Money; transferCounterpartyName: string | null }[];
  openingBalance: { amount: Money; withinPeriod: boolean; countedInInflowsOrOutflows: boolean } | null;
};
type Comparison = {
  period: { from: string; to: string };
  currencies: {
    currency: string;
    highestOutflows: { amount: Money; accounts: { id: string; name: string }[] } | null;
    highestInflows: { amount: Money; accounts: { id: string; name: string }[] } | null;
    accounts: (Summary & { account: AccountView })[];
  }[];
};
type Spendability = {
  resolved: true;
  canDebit: boolean;
  reason: string | null;
  requested: Money;
  available: Money;
  balanceAfter: Money;
  shortfall: Money | null;
};
type Draft = {
  accountOperation: string;
  accountId: string | null;
  current: AccountView | null;
  name: string | null;
  type: string | null;
  currency: string | null;
  candidates: AccountView[];
  missingFields: string[];
};
type Verified = { accountOperation: string; accountId: string; name: string; type: string; currency: string; status: string; verifiedAt: string };
type ToolOutput = {
  status: string;
  data: { isReadyForApproval?: boolean; draft?: Draft } & Record<string, unknown>;
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

  const open = (workspaceId: string, name: string, type: "CHECKING" | "SAVINGS" | "CASH" | "CREDIT_CARD", openingBalanceMinor?: bigint) =>
    createAccountWithOpeningBalance(ledger, owner, workspaceId, { name, type, currency: "XAF", openingBalanceMinor });
  const main = await open(workspaceOne, "Main Account", "CHECKING", 100_000n);
  const savings = await open(workspaceOne, "Savings", "SAVINGS", 50_000n);
  const cash = await open(workspaceOne, "Cash", "CASH");
  const oldCash = await open(workspaceOne, "Cash", "CASH");
  const card = await open(workspaceOne, "Visa", "CREDIT_CARD");
  await ledger.manageAccount(owner, {
    workspaceId: workspaceOne, accountId: oldCash.id, idempotencyKey: randomUUID(), expectedUpdatedAt: undefined, action: "ARCHIVE",
  });
  const foreignAccount = await open(workspaceTwo, "Main Account", "CHECKING", 70_000n);

  const post = (workspaceId: string, input: Record<string, unknown>) =>
    ledger.createTransaction(owner, workspaceId, { currency: "XAF", ...input });
  const expense = (workspaceId: string, accountId: string, amountMinor: string, occurredAt: string, note: string) =>
    post(workspaceId, { kind: "EXPENSE", accountId, categoryId: SYSTEM_OTHER_EXPENSE_ID, amountMinor, occurredAt, note });
  await expense(workspaceOne, main.id, "5000", "2026-09-30T12:00:00.000Z", "Pharmacy");
  await post(workspaceOne, {
    kind: "INCOME", accountId: main.id, categoryId: SYSTEM_SALARY_ID, amountMinor: "30000", occurredAt: "2026-10-02T12:00:00.000Z", note: "Salary",
  });
  const transfer = await post(workspaceOne, {
    kind: "TRANSFER", accountId: savings.id, transferAccountId: main.id, amountMinor: "15000", occurredAt: "2026-10-03T12:00:00.000Z",
  });
  await expense(workspaceOne, main.id, "8000", "2026-10-04T12:00:00.000Z", "Restaurant");
  await expense(workspaceOne, main.id, "20000", "2026-10-05T08:00:00.000Z", "Shoes");
  await expense(workspaceTwo, foreignAccount.id, "7000", "2026-10-05T08:00:00.000Z", "Foreign groceries");

  const reads = { ledger, records: ledgerRecords, workspaces };
  const unused = async () => {
    throw new Error("This domain service does not belong to the Accounts sub-agent.");
  };
  const services: PaceDomainServices = {
    ...createAgentActionDomainServices(actionService),
    async getAccounts(scope) {
      const [accounts, balances] = await Promise.all([
        ledger.listAccounts(scope.actor, scope.workspaceId),
        ledger.getWorkspaceAccountBalances(scope.actor, { workspaceId: scope.workspaceId }),
      ]);
      return buildAccountsOverview({ accounts, balances, filter: "ALL" });
    },
    getAccount: (scope, reference) => getAgentAccount({ ...scope, reference, now: fixedNow() }, reads),
    getAccountMovements: (scope, query) => getAgentAccountMovements({ ...scope, query, now: fixedNow() }, reads),
    compareAccountMovements: (scope, query) => compareAgentAccountMovements({ ...scope, query, now: fixedNow() }, reads),
    checkAccountSpendability: (scope, query) => checkAgentAccountSpendability({ ...scope, query }, reads),
    getRecentTransactions: unused,
    getExpenses: unused,
    searchTransactions: unused,
    getTransactionDetail: unused,
    getOverviewSummary: unused,
    getRecurringPayments: unused,
    getRecurringPayment: unused,
    getRecurringSpending: unused,
    getUpcomingRecurring: unused,
    getInboxItems: unused,
    getInsightContext: unused,
  };

  const trace = createInMemoryPaceTraceSink();
  const deps = { registry: paceSubAgentRegistry, services, trace, now: fixedNow };
  const envelopeFor = (actor: AuthenticatedActor, workspaceId: string, sessionId = "session-1") =>
    resolvePaceContextEnvelope(workspaces, { actor, workspaceId, language: "en", session: { runtime: "local", id: sessionId } });

  let turn = 0;
  /** One member turn through the orchestrator with the real AccountsAgent and a scripted model. */
  const ask = async (request: string, steps: readonly Step[], envelope?: PaceContextEnvelope) => {
    turn += 1;
    const model = scriptedModel(steps);
    const result = await createPaceOrchestrator({
      ...deps,
      executors: { accounts: createAccountsAgent({ model }) },
    }).handle({ request, envelope: envelope ?? (await envelopeFor(owner, workspaceOne, `session-${turn}`)) });
    const accounts = result.results.find((entry) => entry.agentId === "accounts");
    assert.ok(accounts, `"${request}" reaches the Accounts sub-agent`);
    return { result, accounts, model };
  };

  let calls = 0;
  const invoke = async (tool: string, input: unknown, envelope: PaceContextEnvelope) => {
    calls += 1;
    return (await invokePaceCapability(deps, { agentId: "accounts", tool, input, envelope, callId: `direct-${calls}` })).result;
  };
  const submitCall = (actionId: string, envelope: PaceContextEnvelope, callId: string) =>
    ({ agentId: "accounts", tool: "submit_account_draft", input: { actionId }, envelope, callId }) as const;
  /** APPROVAL → EXECUTE → VERIFY, as the member's confirmation drives it. */
  const approveAndExecute = async (actionId: string, envelope: PaceContextEnvelope) => {
    const approval = await resolvePaceApproval(deps, submitCall(actionId, envelope, `approve-${actionId}`), "approve");
    assert.equal(approval.result.status, "ok");
    return (await invokePaceCapability(deps, submitCall(actionId, envelope, `execute-${actionId}`))).result;
  };
  const balanceOf = async (workspaceId: string, accountId: string) =>
    (await ledgerRecords.getAccountBalance(workspaceId, accountId))!.currentBalanceMinor.toString();

  return {
    actions, approveAndExecute, ask, balanceOf, card, cash, deps, envelopeFor, foreignAccount, invoke, ledger, ledgerRecords,
    main, oldCash, savings, submitCall, trace, transfer,
  };
}

const outputsOf = (result: PaceSubAgentResult) => result.toolResults.map((toolResult) => `${toolResult.tool}:${toolResult.status}`);
const dataOf = <T>(result: PaceSubAgentResult, tool: string) =>
  result.toolResults.find((toolResult) => toolResult.tool === tool)?.data as T;
const draftOf = (result: PaceSubAgentResult, tool: string) => dataOf<{ draft: Draft }>(result, tool).draft;
const xaf = (minorUnits: string): Money => ({ minorUnits, currency: "XAF" });

const prepareAndSubmit = (tool: string, input: Record<string, unknown>, question = "Which account do you mean?"): Step[] => [
  () => ({ call: [tool, input] }),
  (outputs) =>
    outputs[tool]!.data?.isReadyForApproval
      ? { call: ["submit_account_draft", { actionId: outputs[tool]!.actionId }] }
      : { text: question },
];
const change = (operation: string, input: Record<string, unknown>, sourceText: string) =>
  prepareAndSubmit("create_account_change_draft", { operation, ...input, sourceText });

test("the registered accounts sub-agent owns every capability the AccountsAgent offers the model", async () => {
  const { ask } = await createFixture();
  const { model } = await ask("Show all my accounts", [() => ({ text: "Nothing to add." })]);

  const call = model.doGenerateCalls[0]!;
  assert.deepEqual(
    (call.tools ?? []).map((tool) => tool.name).sort(),
    accountsSubAgent.capabilities.map((capability) => capability.tool).sort(),
  );
  const system = JSON.stringify(call.prompt.filter((message) => message.role === "system"));
  assert.match(system, /Never add, subtract, net, or derive a balance or total yourself/);
  assert.match(system, /Never invent or guess an account id/);
  assert.match(system, /Workspace currency: XAF/);

  const tools = accountsSubAgent.capabilities.map((capability) => capability.tool);
  assert.equal(tools.some((tool) => /delete|remove|balance_|set_/.test(tool)), false);
  assert.deepEqual(
    accountsSubAgent.capabilities.filter((capability) => capability.access === "commit").map((capability) => capability.tool),
    ["submit_account_draft"],
  );
});

test("the example requests all route to the Accounts sub-agent first", () => {
  const examples = [
    ["How much do I have in Main Account?", "read"],
    ["Why did my Savings balance decrease?", "read"],
    ["Show all my accounts", "read"],
    ["Which account had the most outflows this month?", "read"],
    ["Create a savings account called Canada", "write"],
    ["Rename Main Account to Daily", "write"],
    ["Archive my old Cash account", "write"],
    ["Restore my Cash account", "write"],
    ["Archive Savings", "write"],
  ] as const;
  for (const [request, intent] of examples) {
    const plan = routePaceRequest(paceSubAgentRegistry, request);
    assert.equal(plan.routes[0]?.agentId, "accounts", request);
    assert.equal(plan.intent, intent, request);
  }
});

test("accounts are listed with their canonical ledger balances and no approval", async () => {
  const { actions, ask, balanceOf, card, cash, main, oldCash, savings, trace } = await createFixture();

  const { result, accounts } = await ask("Show all my accounts", [
    () => ({ call: ["get_accounts", {}] }),
    () => ({ text: "Here are your accounts." }),
  ]);

  assert.equal(result.status, "completed");
  assert.deepEqual(outputsOf(accounts), ["get_accounts:ok"]);
  const overview = dataOf<Overview>(accounts, "get_accounts");
  assert.deepEqual(overview.counts, { ALL: 5, ACTIVE: 4, ARCHIVED: 1 });
  assert.deepEqual(overview.summary, [{ currency: "XAF", currentBalanceMinor: "147000", accountCount: 4 }]);
  const listed = new Map(overview.accounts.map((account) => [account.id, account]));
  assert.deepEqual([...listed.keys()].sort(), [main.id, savings.id, cash.id, oldCash.id, card.id].sort());
  for (const account of overview.accounts) {
    assert.equal(account.currentBalanceMinor, await balanceOf(workspaceOne, account.id), account.name);
  }
  assert.equal(listed.get(main.id)?.currentBalanceMinor, "112000");
  assert.equal(listed.get(savings.id)?.currentBalanceMinor, "35000");
  assert.equal(listed.get(oldCash.id)?.status, "ARCHIVED");

  assert.deepEqual(result.pendingApprovals, []);
  assert.equal(actions.actions.size, 0);
  assert.equal(trace.events.some((event) => event.type.startsWith("approval.")), false);
});

test("one account's current and available balance come from the ledger balance service", async () => {
  const { ask, ledgerRecords, main } = await createFixture();
  const readsBefore = ledgerRecords.accountBalanceReadCount;

  const { result, accounts } = await ask("How much do I have in Main Account?", [
    () => ({ call: ["get_account", { accountName: "Main Account" }] }),
    (outputs) => ({ text: `You have ${(outputs.get_account!.data as unknown as Detail).balance.available.minorUnits} XAF available.` }),
  ]);

  assert.equal(accounts.status, "completed");
  const detail = dataOf<Detail>(accounts, "get_account");
  assert.equal(detail.account.id, main.id);
  assert.deepEqual(detail.balance, { current: xaf("112000"), available: xaf("112000"), spendabilityMode: "ZERO_FLOOR" });
  assert.deepEqual(detail.openingBalance?.amount, xaf("100000"));
  assert.equal(detail.allowedActions.canDelete, false);
  assert.equal(detail.allowedActions.canChangeType, false);
  assert.equal(detail.allowedActions.reasons.changeType, "ACCOUNT_HAS_FINANCIAL_ACTIVITY");
  assert.equal(accounts.summary, "You have 112000 XAF available.");
  assert.equal(ledgerRecords.accountBalanceReadCount, readsBefore + 1);
  assert.deepEqual(result.pendingApprovals, []);
});

test("a balance change is explained from server-computed inflows, outflows, and movement rows", async () => {
  const { ask, savings, transfer } = await createFixture();

  const { result, accounts } = await ask("Why did my Savings balance decrease?", [
    () => ({ call: ["get_account_movements", { accountName: "Savings", period: "THIS_MONTH" }] }),
    (outputs) => ({ text: `${(outputs.get_account_movements!.data as unknown as Movements).outflows.minorUnits} XAF left Savings this month.` }),
  ]);

  assert.equal(accounts.status, "completed");
  assert.deepEqual(result.pendingApprovals, []);
  const movements = dataOf<Movements>(accounts, "get_account_movements");
  assert.equal(movements.account.id, savings.id);
  assert.deepEqual(movements.period, thisMonth);
  assert.deepEqual(movements.currentBalance, xaf("35000"));
  assert.deepEqual(movements.inflows, xaf("0"));
  assert.deepEqual(movements.outflows, xaf("15000"));
  assert.deepEqual(movements.netMovement, xaf("-15000"));
  assert.equal(movements.movementCount, 1);
  assert.equal(movements.listedCount, 1);
  assert.deepEqual(movements.movements, [{
    id: transfer.id, kind: "TRANSFER", occurredAt: "2026-10-03T12:00:00.000Z", direction: "OUTFLOW", movement: xaf("-15000"),
    merchantName: null, note: null, categoryName: null, transferCounterpartyName: "Main Account",
  }]);
  assert.equal(accounts.summary, "15000 XAF left Savings this month.");

  const lastMonth = await ask("What moved my Main Account balance last month?", [
    () => ({ call: ["get_account_movements", { accountName: "Main Account", period: "LAST_MONTH" }] }),
    () => ({ text: "Done." }),
  ]);
  const previous = dataOf<Movements>(lastMonth.accounts, "get_account_movements");
  assert.deepEqual(previous.period, { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(previous.outflows, xaf("5000"));
  assert.equal(previous.movementCount, 1);

  const limited = await ask("What moved my Main Account balance?", [
    () => ({ call: ["get_account_movements", { accountName: "Main Account", limit: 2 }] }),
    () => ({ text: "Done." }),
  ]);
  const latest = dataOf<Movements>(limited.accounts, "get_account_movements");
  assert.equal(latest.movementCount, 4);
  assert.equal(latest.listedCount, 2);
  assert.deepEqual(latest.movements.map((movement) => movement.movement.minorUnits), ["-20000", "-8000"]);
});

test("a transfer moves both accounts and stays zero workspace income and spending", async () => {
  const { ask, ledgerRecords, transfer } = await createFixture();

  const { accounts } = await ask("What came into my Main Account this month?", [
    () => ({ call: ["get_account_movements", { accountName: "Main Account" }] }),
    () => ({ text: "Done." }),
  ]);
  const main = dataOf<Movements>(accounts, "get_account_movements");
  assert.deepEqual(main.inflows, xaf("45000"));
  assert.deepEqual(main.outflows, xaf("28000"));
  assert.deepEqual(main.netTransfers, xaf("15000"));
  const incoming = main.movements.find((movement) => movement.id === transfer.id)!;
  assert.equal(incoming.kind, "TRANSFER");
  assert.equal(incoming.direction, "INFLOW");
  assert.deepEqual(incoming.movement, xaf("15000"));
  assert.equal(incoming.transferCounterpartyName, "Savings");

  const other = await ask("What left my Savings balance?", [
    () => ({ call: ["get_account_movements", { accountName: "Savings" }] }),
    () => ({ text: "Done." }),
  ]);
  assert.deepEqual(dataOf<Movements>(other.accounts, "get_account_movements").netTransfers, xaf("-15000"));

  assert.deepEqual(await ledgerRecords.summarizeTransactionList(workspaceOne, {}), [
    { currency: "XAF", incomeMinor: 30_000n, spendingMinor: 33_000n },
  ]);
});

test("an opening balance sets the starting balance and is never an inflow or income", async () => {
  const { ask, ledger, ledgerRecords } = await createFixture();
  const vault = await ledger.createAccount(owner, workspaceOne, { name: "Vault", type: "SAVINGS", currency: "XAF" });
  await ledger.setOpeningBalance(owner, {
    workspaceId: workspaceOne,
    accountId: vault.id,
    amountMinor: 40_000n,
    currency: toCurrencyCode("XAF"),
    effectiveAt: new Date("2026-10-03T12:00:00.000Z"),
    idempotencyKey: randomUUID(),
  });

  const { accounts } = await ask("Why does my Vault account balance show 40,000?", [
    () => ({ call: ["get_account_movements", { accountName: "Vault", period: "THIS_MONTH" }] }),
    () => ({ text: "It started with an opening balance." }),
  ]);
  const movements = dataOf<Movements>(accounts, "get_account_movements");
  assert.deepEqual(movements.currentBalance, xaf("40000"));
  assert.deepEqual(movements.inflows, xaf("0"));
  assert.deepEqual(movements.outflows, xaf("0"));
  assert.deepEqual(movements.netMovement, xaf("0"));
  assert.equal(movements.movementCount, 0);
  assert.deepEqual(movements.movements, []);
  assert.deepEqual(movements.openingBalance, {
    amount: xaf("40000"), effectiveAt: "2026-10-03T12:00:00.000Z", withinPeriod: true, countedInInflowsOrOutflows: false,
  });

  const savings = await ask("Why did my Savings balance decrease?", [
    () => ({ call: ["get_account_movements", { accountName: "Savings" }] }),
    () => ({ text: "Done." }),
  ]);
  const seeded = dataOf<Movements>(savings.accounts, "get_account_movements");
  assert.deepEqual(seeded.inflows, xaf("0"));
  assert.deepEqual(seeded.openingBalance?.amount, xaf("50000"));
  assert.equal(seeded.openingBalance?.withinPeriod, false);

  assert.deepEqual(await ledgerRecords.summarizeTransactionList(workspaceOne, {}), [
    { currency: "XAF", incomeMinor: 30_000n, spendingMinor: 33_000n },
  ]);
});

test("account movements are compared and ranked by the server, per currency", async () => {
  const { ask, main, oldCash, savings } = await createFixture();

  const { result, accounts } = await ask("Which account had the most outflows this month?", [
    () => ({ call: ["compare_account_movements", { period: "THIS_MONTH" }] }),
    (outputs) => ({
      text: `${(outputs.compare_account_movements!.data as unknown as Comparison).currencies[0]!.highestOutflows!.accounts[0]!.name} had the most outflows.`,
    }),
  ]);

  assert.equal(accounts.status, "completed");
  assert.deepEqual(result.pendingApprovals, []);
  const comparison = dataOf<Comparison>(accounts, "compare_account_movements");
  assert.deepEqual(comparison.period, thisMonth);
  assert.equal(comparison.currencies.length, 1);
  const group = comparison.currencies[0]!;
  assert.equal(group.currency, "XAF");
  assert.deepEqual(group.highestOutflows, { amount: xaf("28000"), accounts: [{ id: main.id, name: "Main Account" }] });
  assert.deepEqual(group.highestInflows, { amount: xaf("45000"), accounts: [{ id: main.id, name: "Main Account" }] });
  assert.deepEqual(group.accounts.map((entry) => entry.account.name), ["Main Account", "Savings", "Cash", "Visa"]);
  assert.deepEqual(group.accounts[1]!.outflows, xaf("15000"));
  assert.equal(group.accounts[1]!.account.id, savings.id);
  assert.equal(group.accounts.some((entry) => entry.account.id === oldCash.id), false);
  assert.equal(accounts.summary, "Main Account had the most outflows.");
});

test("a new account is prepared as a draft and only exists after approval", async () => {
  const { actions, approveAndExecute, ask, balanceOf, deps, envelopeFor, ledgerRecords, submitCall } = await createFixture();
  const request = "Create a savings account called Canada";
  const before = ledgerRecords.accounts.size;
  const transactionsBefore = ledgerRecords.transactions.size;

  const { result, accounts } = await ask(
    request,
    prepareAndSubmit("create_account_draft", { name: "Canada", type: "SAVINGS", sourceText: request }),
  );

  assert.equal(result.pendingApprovals.length, 1);
  assert.equal(accounts.status, "approval_required");
  assert.deepEqual(outputsOf(accounts), ["create_account_draft:ok", "submit_account_draft:approval_required"]);
  const draft = draftOf(accounts, "create_account_draft");
  assert.deepEqual(
    { operation: draft.accountOperation, name: draft.name, type: draft.type, currency: draft.currency, accountId: draft.accountId },
    { operation: "CREATE", name: "Canada", type: "SAVINGS", currency: "XAF", accountId: null },
  );
  assert.deepEqual(draft.missingFields, []);
  const actionId = accounts.pendingApprovals[0]!.actionId;
  const parked = await actions.findAction(workspaceOne, actionId);
  assert.equal(parked?.type, "ACCOUNT_CREATE");
  assert.equal(parked?.status, "WAITING_APPROVAL");
  assert.equal(ledgerRecords.accounts.size, before);

  const envelope = await envelopeFor(owner, workspaceOne);
  const executed = await approveAndExecute(actionId, envelope);
  assert.equal(executed.status, "ok");
  const verified = executed.data as Verified;
  assert.deepEqual(
    { ...verified, accountId: null, verifiedAt: null },
    { accountOperation: "CREATE", accountId: null, name: "Canada", type: "SAVINGS", currency: "XAF", status: "ACTIVE", verifiedAt: null },
  );
  const created = ledgerRecords.accounts.get(verified.accountId)!;
  assert.equal(created.workspaceId, workspaceOne);
  assert.equal(created.name, "Canada");
  assert.equal(created.archivedAt, null);
  assert.equal(await balanceOf(workspaceOne, created.id), "0");
  assert.equal(ledgerRecords.accounts.size, before + 1);
  assert.equal(ledgerRecords.transactions.size, transactionsBefore);

  const replayed = await invokePaceCapability(deps, submitCall(actionId, envelope, "replay"));
  assert.deepEqual(replayed.result.data, verified);
  assert.equal(ledgerRecords.accounts.size, before + 1);

  const noType = await ask(
    "Create an account called Holiday",
    prepareAndSubmit("create_account_draft", { name: "Holiday", sourceText: "Create an account called Holiday" }, "What type of account is it?"),
  );
  assert.equal(noType.accounts.status, "needs_input");
  assert.deepEqual(draftOf(noType.accounts, "create_account_draft").missingFields, ["type"]);
  assert.equal(noType.accounts.summary, "What type of account is it?");
  assert.deepEqual(noType.result.pendingApprovals, []);
  assert.equal(ledgerRecords.accounts.size, before + 1);
});

test("a rename changes only the name; a type change follows the canonical account policy", async () => {
  const { approveAndExecute, ask, balanceOf, cash, envelopeFor, ledgerRecords, main } = await createFixture();
  const request = "Rename Main Account to Daily";
  const transactionsBefore = ledgerRecords.transactions.size;

  const { accounts } = await ask(request, change("RENAME", { accountName: "Main Account", newName: "Daily" }, request));
  assert.equal(accounts.status, "approval_required");
  const draft = draftOf(accounts, "create_account_change_draft");
  assert.equal(draft.accountOperation, "RENAME");
  assert.equal(draft.accountId, main.id);
  assert.equal(draft.current?.name, "Main Account");
  assert.equal(draft.name, "Daily");
  assert.equal(ledgerRecords.accounts.get(main.id)?.name, "Main Account");

  const envelope = await envelopeFor(owner, workspaceOne);
  const executed = await approveAndExecute(accounts.pendingApprovals[0]!.actionId, envelope);
  assert.equal(executed.status, "ok");
  assert.equal((executed.data as Verified).name, "Daily");
  const renamed = ledgerRecords.accounts.get(main.id)!;
  assert.equal(renamed.name, "Daily");
  assert.equal(renamed.type, "CHECKING");
  assert.equal(renamed.archivedAt, null);
  assert.equal(await balanceOf(workspaceOne, main.id), "112000");
  assert.equal(ledgerRecords.transactions.size, transactionsBefore);
  assert.deepEqual((await ledgerRecords.listAccountAudit(workspaceOne, main.id)).map((audit) => audit.action), ["RENAMED"]);

  const locked = await ask("Make Daily a savings account", change("CHANGE_TYPE", { accountName: "Daily", newType: "SAVINGS" }, "Make Daily a savings account"));
  assert.deepEqual(outputsOf(locked.accounts), ["create_account_change_draft:refused"]);
  assert.match(locked.accounts.error?.message ?? "", /locked after the account has financial activity/);

  const unsupported = await ask("Make Visa a checking account", change("CHANGE_TYPE", { accountName: "Visa", newType: "CHECKING" }, "Make Visa a checking account"));
  assert.match(unsupported.accounts.error?.message ?? "", /spendability semantics/);

  const allowed = await ask("Make that Cash account mobile money", change("CHANGE_TYPE", { accountId: cash.id, newType: "MOBILE_MONEY" }, "Make it mobile money"));
  assert.equal(allowed.accounts.status, "approval_required");
  const retyped = await approveAndExecute(allowed.accounts.pendingApprovals[0]!.actionId, envelope);
  assert.equal((retyped.data as Verified).type, "MOBILE_MONEY");
  assert.equal(ledgerRecords.accounts.get(cash.id)?.type, "MOBILE_MONEY");
  assert.equal(ledgerRecords.accounts.get(cash.id)?.name, "Cash");
});

test("archive and restore keep the account and its history; nothing is ever deleted", async () => {
  const { approveAndExecute, ask, balanceOf, cash, envelopeFor, ledgerRecords, oldCash, savings } = await createFixture();
  const accountsBefore = ledgerRecords.accounts.size;
  const transactionsBefore = ledgerRecords.transactions.size;
  const envelope = await envelopeFor(owner, workspaceOne);

  const archive = await ask("Archive my old Cash account", change("ARCHIVE", { accountName: "Cash" }, "Archive my old Cash account"));
  assert.equal(archive.accounts.status, "approval_required");
  assert.equal(draftOf(archive.accounts, "create_account_change_draft").accountId, cash.id);
  assert.equal(ledgerRecords.accounts.get(cash.id)?.archivedAt, null);
  const archived = await approveAndExecute(archive.accounts.pendingApprovals[0]!.actionId, envelope);
  assert.equal((archived.data as Verified).status, "ARCHIVED");
  assert.notEqual(ledgerRecords.accounts.get(cash.id)?.archivedAt, null);

  const again = await ask("Archive that Cash account", change("ARCHIVE", { accountId: cash.id }, "Archive it"));
  assert.deepEqual(outputsOf(again.accounts), ["create_account_change_draft:refused"]);
  assert.match(again.accounts.error?.message ?? "", /already archived/);

  const savingsArchive = await ask("Archive my Savings account", change("ARCHIVE", { accountName: "Savings" }, "Archive my Savings account"));
  await approveAndExecute(savingsArchive.accounts.pendingApprovals[0]!.actionId, envelope);
  assert.notEqual(ledgerRecords.accounts.get(savings.id)?.archivedAt, null);
  assert.equal(await balanceOf(workspaceOne, savings.id), "35000");

  const whichCash = await ask("Restore my Cash account", change("RESTORE", { accountName: "Cash" }, "Restore my Cash account"));
  assert.equal(whichCash.accounts.status, "needs_input");
  const ambiguous = draftOf(whichCash.accounts, "create_account_change_draft");
  assert.deepEqual(ambiguous.missingFields, ["account"]);
  assert.deepEqual(ambiguous.candidates.map((candidate) => candidate.id).sort(), [cash.id, oldCash.id].sort());

  const restore = await ask("Restore that one", change("RESTORE", { accountId: cash.id }, "Restore that one"));
  const restored = await approveAndExecute(restore.accounts.pendingApprovals[0]!.actionId, envelope);
  assert.equal((restored.data as Verified).status, "ACTIVE");
  assert.equal(ledgerRecords.accounts.get(cash.id)?.archivedAt, null);
  assert.deepEqual(
    (await ledgerRecords.listAccountAudit(workspaceOne, cash.id)).map((audit) => audit.action),
    ["ARCHIVED", "RESTORED"],
  );

  const notArchived = await ask("Restore Main Account", change("RESTORE", { accountName: "Main Account" }, "Restore Main Account"));
  assert.match(notArchived.accounts.error?.message ?? "", /not archived/);

  assert.equal(ledgerRecords.accounts.size, accountsBefore);
  assert.equal(ledgerRecords.transactions.size, transactionsBefore);
});

test("every AI-initiated account write is held for approval and cannot be skipped or revived", async () => {
  const { actions, ask, deps, envelopeFor, invoke, ledgerRecords, main, submitCall } = await createFixture();
  const snapshot = () => JSON.stringify([...ledgerRecords.accounts.values()]);
  const accountsBefore = snapshot();

  for (const capability of accountsSubAgent.capabilities) {
    if (capability.access === "read") {
      assert.equal(capability.approval, "none", capability.tool);
      continue;
    }
    assert.equal(capability.requiredPermission, "manage_ledger", capability.tool);
    assert.equal(capability.approval, capability.access === "commit" ? "required" : "none", capability.tool);
  }

  const request = "Rename Main Account to Daily";
  const pushy = await ask(request, [
    ...change("RENAME", { accountName: "Main Account", newName: "Daily" }, request),
    (outputs) => ({ call: ["submit_account_draft", { actionId: outputs.create_account_change_draft!.actionId }] }),
    () => ({ text: "Your account is renamed." }),
  ]);
  assert.equal(pushy.model.doGenerateCalls.length, 2);
  assert.equal(pushy.accounts.status, "approval_required");
  assert.equal(pushy.accounts.summary, null);
  const actionId = pushy.accounts.pendingApprovals[0]!.actionId;

  const envelope = await envelopeFor(owner, workspaceOne);
  const unapproved = await invokePaceCapability(deps, submitCall(actionId, envelope, "unapproved"));
  assert.equal(unapproved.result.status, "approval_required");
  assert.equal(unapproved.result.data, null);
  assert.equal(snapshot(), accountsBefore);

  const viewerEnvelope = await envelopeFor(viewer, workspaceOne);
  const viewerApproval = await resolvePaceApproval(deps, submitCall(actionId, viewerEnvelope, "viewer-approve"), "approve");
  assert.equal(viewerApproval.result.error?.code, "PERMISSION_DENIED");
  const viewerWrites = [
    ["create_account_draft", { name: "Sneaky", type: "CASH", sourceText: "create Sneaky" }],
    ["create_account_change_draft", { operation: "ARCHIVE", accountId: main.id, sourceText: "archive it" }],
    ["submit_account_draft", { actionId }],
  ] as const;
  for (const [tool, input] of viewerWrites) {
    assert.equal((await invoke(tool, input, viewerEnvelope)).error?.code, "PERMISSION_DENIED", tool);
  }
  assert.equal((await invoke("get_accounts", {}, viewerEnvelope)).status, "ok");
  const viewerDetail = await invoke("get_account", { accountName: "Main Account" }, viewerEnvelope);
  assert.equal(viewerDetail.status, "ok");
  assert.equal((viewerDetail.data as Detail).allowedActions.canRename, false);

  await resolvePaceApproval(deps, submitCall(actionId, envelope, "reject"), "reject");
  const rejected = await invokePaceCapability(deps, submitCall(actionId, envelope, "after-reject"));
  assert.equal(rejected.result.status, "refused");
  assert.equal(rejected.result.error?.code, "DOMAIN_REJECTED");

  assert.equal(snapshot(), accountsBefore);
  assert.equal([...actions.actions.values()].some((action) => action.status === "COMPLETED"), false);
});

test("an ambiguous or unknown account name returns candidates and is never guessed", async () => {
  const { actions, ask, cash, envelopeFor, invoke, ledgerRecords, oldCash } = await createFixture();
  const before = JSON.stringify([...ledgerRecords.accounts.values()]);

  const which = await ask("How much is in my Cash account?", [
    () => ({ call: ["get_account", { accountName: "Cash" }] }),
    () => ({ text: "You have two Cash accounts. Which one do you mean?" }),
  ]);
  assert.equal(which.accounts.status, "needs_input");
  const unresolved = dataOf<Unresolved>(which.accounts, "get_account");
  assert.equal(unresolved.resolved, false);
  assert.equal(unresolved.reason, "AMBIGUOUS");
  assert.deepEqual(
    unresolved.candidates.map((candidate) => [candidate.id, candidate.status]).sort(),
    [[cash.id, "ACTIVE"], [oldCash.id, "ARCHIVED"]].sort(),
  );
  assert.equal("balance" in unresolved, false);

  const chosen = await ask("The active Cash account", [
    () => ({ call: ["get_account", { accountName: "Cash" }] }),
    (outputs) => ({
      call: ["get_account", {
        accountId: (outputs.get_account!.data as unknown as Unresolved).candidates.find((candidate) => candidate.status === "ACTIVE")!.id,
      }],
    }),
    () => ({ text: "It holds 0 XAF." }),
  ]);
  assert.equal(chosen.accounts.status, "completed");
  assert.equal((chosen.accounts.toolResults.at(-1)!.data as Detail).account.id, cash.id);

  const unknown = await ask("How much is in my Vacation account?", [
    () => ({ call: ["get_account_movements", { accountName: "Vacation" }] }),
    () => ({ text: "I could not find a Vacation account." }),
  ]);
  const missing = dataOf<Unresolved>(unknown.accounts, "get_account_movements");
  assert.equal(missing.reason, "NOT_FOUND");
  assert.equal(missing.candidates.length, 5);
  assert.equal(unknown.accounts.status, "needs_input");

  const rename = await ask("Rename my Cash account to Wallet", [
    () => ({ call: ["create_account_change_draft", { operation: "RENAME", accountName: "Cash", newName: "Wallet", sourceText: "Rename Cash to Wallet" }] }),
    (outputs) => ({ call: ["submit_account_draft", { actionId: outputs.create_account_change_draft!.actionId }] }),
  ]);
  const draft = draftOf(rename.accounts, "create_account_change_draft");
  assert.equal(draft.accountId, null);
  assert.deepEqual(draft.missingFields, ["account"]);
  assert.equal(draft.candidates.length, 2);
  assert.deepEqual(outputsOf(rename.accounts).at(-1), "submit_account_draft:refused");
  assert.equal(rename.accounts.status, "needs_input");
  assert.deepEqual(rename.result.pendingApprovals, []);

  const envelope = await envelopeFor(owner, workspaceOne);
  const guessed = await invoke("get_account", { accountId: randomUUID() }, envelope);
  assert.equal(guessed.status, "refused");
  assert.equal(guessed.error?.code, "DOMAIN_REJECTED");
  const both = await invoke("get_account", { accountId: cash.id, accountName: "Cash" }, envelope);
  assert.equal(both.error?.code, "INVALID_INPUT");

  assert.equal(JSON.stringify([...ledgerRecords.accounts.values()]), before);
  assert.equal([...actions.actions.values()].every((action) => action.status === "DRAFT"), true);
});

test("insufficient funds are explained with the ledger's own spendability rules", async () => {
  const { ask, card, envelopeFor, invoke, ledger, ledgerRecords, savings } = await createFixture();
  const before = ledgerRecords.transactions.size;

  const { result, accounts } = await ask("Why can't I pay 50,000 XAF from my Savings account?", [
    () => ({ call: ["check_account_spendability", { accountName: "Savings", amountText: "50,000" }] }),
    (outputs) => ({ text: `You are ${(outputs.check_account_spendability!.data as unknown as Spendability).shortfall!.minorUnits} XAF short.` }),
  ]);

  assert.equal(accounts.status, "completed");
  assert.deepEqual(result.pendingApprovals, []);
  const check = dataOf<Spendability>(accounts, "check_account_spendability");
  assert.equal(check.canDebit, false);
  assert.equal(check.reason, "INSUFFICIENT_FUNDS");
  assert.deepEqual(check.requested, xaf("50000"));
  assert.deepEqual(check.available, xaf("35000"));
  assert.deepEqual(check.balanceAfter, xaf("-15000"));
  assert.deepEqual(check.shortfall, xaf("15000"));
  assert.equal(accounts.summary, "You are 15000 XAF short.");

  const canonical = getAccountSpendability({
    accountId: savings.id, accountType: "SAVINGS", currency: toCurrencyCode("XAF"), currentBalanceMinor: 35_000n, requestedDebitMinor: 50_000n,
  });
  assert.equal(check.reason, canonical.reason);
  assert.equal(check.available.minorUnits, canonical.availableBalanceMinor.toString());

  await assert.rejects(
    ledger.createTransactionIdempotently(owner, workspaceOne, {
      kind: "EXPENSE", accountId: savings.id, categoryId: SYSTEM_OTHER_EXPENSE_ID, amountMinor: "50000", currency: "XAF",
      occurredAt: "2026-10-05T08:30:00.000Z", deduplicationFingerprint: "accounts-agent-test:overdraw",
    }),
    (error: unknown) =>
      error instanceof InsufficientFundsError &&
      error.details?.availableBalanceMinor === check.available.minorUnits &&
      error.details?.requiredAmountMinor === check.requested.minorUnits,
  );

  const envelope = await envelopeFor(owner, workspaceOne);
  const exact = (await invoke("check_account_spendability", { accountId: savings.id, amountText: "35,000" }, envelope)).data as Spendability;
  assert.equal(exact.canDebit, true);
  assert.equal(exact.reason, null);
  assert.equal(exact.shortfall, null);
  assert.deepEqual(exact.balanceAfter, xaf("0"));

  const credit = (await invoke("check_account_spendability", { accountId: card.id, amountText: "100" }, envelope)).data as Spendability;
  assert.equal(credit.canDebit, false);
  assert.equal(credit.reason, "ACCOUNT_SPENDABILITY_UNSUPPORTED");
  assert.equal(credit.shortfall, null);

  const unreadable = await invoke("check_account_spendability", { accountId: savings.id, amountText: "a lot" }, envelope);
  assert.equal(unreadable.status, "refused");
  assert.equal(unreadable.error?.code, "DOMAIN_REJECTED");
  assert.equal(ledgerRecords.transactions.size, before);
});

test("the agent cannot read, change, or submit accounts across workspaces", async () => {
  const { ask, envelopeFor, foreignAccount, invoke, ledgerRecords, main, submitCall, deps } = await createFixture();
  await assert.rejects(envelopeFor(outsider, workspaceOne), AuthorizationError);
  await assert.rejects(envelopeFor(viewer, workspaceTwo), AuthorizationError);

  const elsewhere = await envelopeFor(owner, workspaceTwo, "session-two");
  const listed = await ask("Show all my accounts", [
    () => ({ call: ["get_accounts", {}] }),
    () => ({ text: "Done." }),
  ], elsewhere);
  const overview = dataOf<Overview>(listed.accounts, "get_accounts");
  assert.deepEqual(overview.accounts.map((account) => account.id), [foreignAccount.id]);
  assert.equal(overview.accounts[0]!.currentBalanceMinor, "63000");
  assert.equal(JSON.stringify(listed.result).includes(main.id), false);

  const attempts = [
    ["get_account", { accountId: main.id }],
    ["get_account_movements", { accountId: main.id }],
    ["check_account_spendability", { accountId: main.id, amountText: "1" }],
    ["create_account_change_draft", { operation: "ARCHIVE", accountId: main.id, sourceText: "archive it" }],
  ] as const;
  for (const [tool, input] of attempts) {
    const outcome = await invoke(tool, input, elsewhere);
    assert.equal(outcome.status, "refused", tool);
    assert.equal(outcome.error?.code, "DOMAIN_REJECTED", tool);
    assert.equal(outcome.data, null, tool);
  }

  const byName = (await invoke("get_account", { accountName: "Savings" }, elsewhere)).data as Unresolved;
  assert.equal(byName.resolved, false);
  assert.deepEqual(byName.candidates.map((candidate) => candidate.id), [foreignAccount.id]);
  const compared = (await invoke("compare_account_movements", {}, elsewhere)).data as Comparison;
  assert.deepEqual(compared.currencies[0]!.accounts.map((entry) => entry.account.id), [foreignAccount.id]);
  assert.deepEqual(compared.currencies[0]!.highestOutflows?.amount, xaf("7000"));
  const smuggled = await invoke("get_accounts", { workspaceId: workspaceOne }, elsewhere);
  assert.equal(smuggled.error?.code, "INVALID_INPUT");

  const home = await envelopeFor(owner, workspaceOne);
  const draft = await invoke(
    "create_account_change_draft",
    { operation: "RENAME", accountId: main.id, newName: "Hijacked", sourceText: "rename it" },
    home,
  );
  assert.equal(draft.status, "ok");
  const leaked = await invokePaceCapability(deps, submitCall(draft.actionId!, elsewhere, "leak"));
  assert.equal(leaked.result.status, "refused");
  assert.equal(leaked.result.error?.code, "DOMAIN_REJECTED");
  assert.equal(ledgerRecords.accounts.get(main.id)?.name, "Main Account");
});

test("an approved account change is verified against the stored account, audited, and idempotent", async () => {
  const { actions, approveAndExecute, ask, deps, envelopeFor, ledger, ledgerRecords, main, savings, submitCall, trace } = await createFixture();
  const request = "Rename Main Account to Daily";

  const { accounts } = await ask(request, change("RENAME", { accountName: "Main Account", newName: "Daily" }, request));
  const actionId = accounts.pendingApprovals[0]!.actionId;
  const envelope = await envelopeFor(owner, workspaceOne);

  const executed = await approveAndExecute(actionId, envelope);
  assert.equal(executed.status, "ok");
  assert.equal(executed.actionId, actionId);
  const verified = executed.data as Verified;
  assert.ok(!Number.isNaN(Date.parse(verified.verifiedAt)));
  const stored = ledgerRecords.accounts.get(main.id)!;
  assert.deepEqual(
    { accountId: verified.accountId, name: verified.name, type: verified.type, currency: verified.currency, status: verified.status },
    { accountId: stored.id, name: stored.name, type: stored.type, currency: stored.currency, status: "ACTIVE" },
  );

  const completed = await actions.findAction(workspaceOne, actionId);
  assert.equal(completed?.type, "ACCOUNT_MANAGE");
  assert.equal(completed?.status, "COMPLETED");
  assert.deepEqual(completed?.result, verified);
  assert.deepEqual(
    (await actions.listAudit(workspaceOne, actionId)).map((event) => event.event),
    ["DRAFT_CREATED", "APPROVAL_REQUESTED", "APPROVED", "EXECUTION_STARTED", "PERSISTENCE_VERIFIED"],
  );

  const replay = await invokePaceCapability(deps, submitCall(actionId, envelope, "replay"));
  assert.deepEqual(replay.result.data, verified);
  assert.equal((await ledgerRecords.listAccountAudit(workspaceOne, main.id)).length, 1);

  const confirmed = await ask("How much do I have in my Daily account?", [
    () => ({ call: ["get_account", { accountName: "Daily" }] }),
    () => ({ text: "Daily holds 112000 XAF." }),
  ]);
  const detail = dataOf<Detail>(confirmed.accounts, "get_account");
  assert.equal(detail.account.id, main.id);
  assert.deepEqual(detail.balance.current, xaf("112000"));

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

  const stale = await ask("Archive my Savings account", change("ARCHIVE", { accountName: "Savings" }, "Archive my Savings account"));
  const staleActionId = stale.accounts.pendingApprovals[0]!.actionId;
  await ledger.manageAccount(owner, {
    workspaceId: workspaceOne, accountId: savings.id, idempotencyKey: randomUUID(), expectedUpdatedAt: undefined, action: "RENAME", name: "Rainy day",
  });
  const refused = await approveAndExecute(staleActionId, envelope);
  assert.equal(refused.status, "refused");
  assert.equal(refused.error?.code, "DOMAIN_REJECTED");
  assert.match(refused.error?.message ?? "", /changed since it was loaded/);
  assert.equal(ledgerRecords.accounts.get(savings.id)?.archivedAt, null);
  assert.equal((await actions.findAction(workspaceOne, staleActionId))?.status, "FAILED");
});
