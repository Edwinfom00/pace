import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { MockLanguageModelV4 } from "ai/test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { AgentActionService } from "@/modules/agent-actions/agent-action-service";
import { createInboxAgent } from "@/modules/financial-inbox/agent/inbox-agent";
import { inboxSubAgent } from "@/modules/financial-inbox/agent/inbox-sub-agent";
import type { InboxAction, InboxReason } from "@/modules/financial-inbox/domain";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import {
  createAgentInboxStateReader,
  getAgentInboxItem,
  listAgentInbox,
} from "@/modules/financial-inbox/queries/agent-inbox-reads";
import type { LedgerTransactionRecord } from "@/modules/ledger/domain";
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
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryAgentActionRepository } from "../../support/in-memory-agent-action-repository";
import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_OTHER_EXPENSE_ID,
  SYSTEM_TRANSPORT_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";
import { createAccountWithOpeningBalance } from "../../support/opening-balance";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const outsider: AuthenticatedActor = { userId: "outsider-1", email: "outsider@pace.test", name: "Outsider" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";
const fixedNow = () => new Date("2026-10-05T09:00:00.000Z");

type Money = { minorUnits: string; currency: string };
type Candidate = { id: string; reason: InboxReason; issue: string; merchantName: string | null; amount: Money };
type Item = Candidate & {
  status: string;
  why: string;
  transaction: { id: string; category: { id: string; name: string } | null; isCurrent: boolean };
  suggestion: { category: { id: string; name: string }; confidence: string } | null;
  recurring: { id: string; status: string; typicalAmount: Money; cadenceDays: number; frequency: string | null } | null;
  otherOpenReasons: InboxReason[];
  resolution: { supported: boolean; availableOperations: string[]; note: string; unavailableReason: string | null };
};
type Listing = {
  unresolvedCount: number;
  summary: { reason: InboxReason; issue: string; count: number; resolutionSupported: boolean }[];
  filter: string;
  matchingCount: number;
  listedCount: number;
  items: Item[];
};
type Located = { resolved: true; item: Item };
type Unresolved = { resolved: false; reason: "AMBIGUOUS" | "NOT_FOUND"; candidates: Candidate[] };
type Draft = {
  inboxOperation: string;
  inboxItemId: string | null;
  currentCategory: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  recurringId: string | null;
  candidates: { id: string }[];
  categoryCandidates: { id: string; name: string }[];
  approvalSummary: { title: string; transaction: string; issue: string; change: string; effects: string[]; text: string } | null;
  missingFields: string[];
};
type Prepared = { prepared: true; actionId: string; status: string; draft: Draft; isReadyForApproval: boolean };
type NotPrepared = { prepared: false; supported: false; explanation: string; item: Item };
type Verified = {
  inboxOperation: string;
  inboxItemId: string;
  reason: InboxReason;
  itemStatus: string;
  transactionId: string;
  category: { id: string; name: string } | null;
  recurring: { id: string; status: string } | null;
  resolvedInboxItemIds: string[];
  remainingReasons: InboxReason[];
  verifiedAt: string;
};
type ToolOutput = {
  status: string;
  data: { isReadyForApproval?: boolean } & Record<string, unknown>;
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
  const financial = new InMemoryFinancialInboxRepository();
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const inboxService = new FinancialInboxService(financial, ledgerRecords, workspaces, ledger);

  /** Lets a test make the canonical resolution service fail, or claim success without resolving anything. */
  const canonical: { fail: Error | null; skip: boolean; calls: string[] } = { fail: null, skip: false, calls: [] };
  const guarded = <TArgs extends unknown[], TResult>(name: string, run: (...args: TArgs) => Promise<TResult>) =>
    async (...args: TArgs): Promise<TResult> => {
      canonical.calls.push(name);
      if (canonical.fail) throw canonical.fail;
      if (canonical.skip) return { resolvedInboxItemIds: [], unresolvedReasons: [] } as TResult;
      return run(...args);
    };
  const resolutions = {
    acceptInboxCategorySuggestion: guarded("accept", inboxService.acceptInboxCategorySuggestion.bind(inboxService)),
    chooseInboxCategory: guarded("choose", inboxService.chooseInboxCategory.bind(inboxService)),
    confirmInboxRecurring: guarded("confirm", inboxService.confirmInboxRecurring.bind(inboxService)),
    ignoreInboxRecurring: guarded("ignore", inboxService.ignoreInboxRecurring.bind(inboxService)),
  };
  const reads = { inbox: financial, ledger: ledgerRecords, workspaces };
  const actionService = new AgentActionService(
    actions, ledger, ledgerRecords, workspaces, undefined, undefined, inboxService,
    { reader: createAgentInboxStateReader(reads), resolutions },
  );

  const accounts: Record<string, string> = {};
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
    accounts[id] = (
      await createAccountWithOpeningBalance(ledger, owner, id, {
        name: "Daily", type: "CHECKING", currency: "XAF", openingBalanceMinor: 500_000n,
      })
    ).id;
  }
  workspaces.addMembership({
    workspaceId: workspaceOne, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: new Date(),
  });

  const spend = (workspaceId: string, merchantName: string, amountMinor: string, categoryId?: string) =>
    ledger.createTransaction(owner, workspaceId, {
      kind: "EXPENSE", status: "POSTED", accountId: accounts[workspaceId], amountMinor, currency: "XAF",
      occurredAt: "2026-10-03T09:00:00.000Z", merchantName, source: { provider: "manual", origin: "MANUAL" },
      ...(categoryId ? { categoryId } : {}),
    });
  const classify = (transaction: LedgerTransactionRecord, merchantName: string, suggestedCategoryId: string | null) =>
    financial.createClassification({
      id: randomUUID(), workspaceId: transaction.workspaceId, transactionId: transaction.id, merchantName,
      normalizedMerchant: merchantName.toLowerCase(), suggestedCategoryId, appliedCategoryId: null,
      source: suggestedCategoryId ? "DETERMINISTIC" : "UNCLASSIFIED", confidence: suggestedCategoryId ? 0.6 : 0,
      status: "NEEDS_REVIEW", explanation: {}, resolvedByUserId: null, resolvedAt: null,
    });
  const flag = (
    transaction: LedgerTransactionRecord,
    reason: InboxReason,
    actionsAllowed: InboxAction[],
    links: { classificationId?: string; recurringPaymentId?: string } = {},
  ) =>
    financial.createInboxItem({
      id: randomUUID(), workspaceId: transaction.workspaceId, transactionId: transaction.id,
      classificationId: links.classificationId ?? null, recurringPaymentId: links.recurringPaymentId ?? null,
      reason, actions: actionsAllowed, status: "OPEN", details: {}, resolvedByUserId: null, resolvedAt: null,
    });
  const detect = (transaction: LedgerTransactionRecord, merchant: string, typicalAmountMinor: bigint) =>
    financial.createRecurringPayment({
      id: randomUUID(), workspaceId: transaction.workspaceId, detectionKey: `detected:${merchant}`, normalizedMerchant: merchant,
      displayName: null, origin: "DETECTED", direction: "EXPENSE", accountId: transaction.accountId,
      categoryId: SYSTEM_OTHER_EXPENSE_ID, currency: "XAF", typicalAmountMinor, amountToleranceBps: 500, cadenceDays: 30,
      firstOccurredAt: new Date("2026-07-03T09:00:00.000Z"), lastOccurredAt: new Date("2026-10-03T09:00:00.000Z"),
      nextOccurrenceAt: null, sampleTransactionIds: [transaction.id], status: "CANDIDATE", lifecycle: "ACTIVE",
      createdByUserId: owner.userId, idempotencyKey: null, commandFingerprint: null, confirmedByUserId: null,
      confirmedAt: null, ignoredByUserId: null, ignoredAt: null,
    });

  const carrefourTransaction = await spend(workspaceOne, "Carrefour", "32500");
  const carrefourClassification = await classify(carrefourTransaction, "Carrefour", SYSTEM_GROCERIES_ID);
  const carrefour = await flag(carrefourTransaction, "CLASSIFICATION_REVIEW", ["CLASSIFY_TRANSACTION"], {
    classificationId: carrefourClassification.id,
  });

  const taxiTransaction = await spend(workspaceOne, "City Taxi", "3500");
  const taxi = await flag(taxiTransaction, "UNKNOWN_CATEGORY", ["CLASSIFY_TRANSACTION"], {
    classificationId: (await classify(taxiTransaction, "City Taxi", null)).id,
  });

  const netflixTransaction = await spend(workspaceOne, "Netflix", "6500", SYSTEM_OTHER_EXPENSE_ID);
  const netflixRecurring = await detect(netflixTransaction, "netflix", 6_500n);
  const netflix = await flag(netflixTransaction, "POSSIBLE_RECURRING", ["CONFIRM_RECURRING", "IGNORE_RECURRING"], {
    recurringPaymentId: netflixRecurring.id,
  });

  const canalTransaction = await spend(workspaceOne, "Canal Plus", "10000", SYSTEM_OTHER_EXPENSE_ID);
  const canalRecurring = await detect(canalTransaction, "canal plus", 10_000n);
  const canal = await flag(canalTransaction, "POSSIBLE_RECURRING", ["CONFIRM_RECURRING", "IGNORE_RECURRING"], {
    recurringPaymentId: canalRecurring.id,
  });

  const amazonTransaction = await spend(workspaceOne, "AMZN MKTP", "12000");
  const amazon = await flag(amazonTransaction, "MERCHANT_AMBIGUITY", ["CLASSIFY_TRANSACTION", "DISMISS"], {
    classificationId: (await classify(amazonTransaction, "AMZN MKTP", null)).id,
  });

  const walletTransaction = await spend(workspaceOne, "Orange Money", "20000", SYSTEM_OTHER_EXPENSE_ID);
  const wallet = await flag(walletTransaction, "POSSIBLE_TRANSFER", ["REVIEW_TRANSFER", "DISMISS"]);

  const foreignTransaction = await spend(workspaceTwo, "Foreign Market", "7000");
  const foreign = await flag(foreignTransaction, "UNKNOWN_CATEGORY", ["CLASSIFY_TRANSACTION"], {
    classificationId: (await classify(foreignTransaction, "Foreign Market", null)).id,
  });

  const unused = async () => {
    throw new Error("This domain service does not belong to the Inbox sub-agent.");
  };
  const services: PaceDomainServices = {
    ...createAgentActionDomainServices(actionService),
    getInboxItems: (scope, query) => listAgentInbox({ ...scope, query }, reads),
    getInboxItem: (scope, reference) => getAgentInboxItem({ ...scope, reference }, reads),
    getRecentTransactions: unused,
    getExpenses: unused,
    searchTransactions: unused,
    getTransactionDetail: unused,
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
    getBudgets: unused,
    getBudget: unused,
    getSavingsGoals: unused,
    getSavingsGoal: unused,
    getForecast: unused,
    getRules: unused,
    getRule: unused,
    getInsightContext: unused,
  };

  const trace = createInMemoryPaceTraceSink();
  const deps = { registry: paceSubAgentRegistry, services, trace, now: fixedNow };
  const envelopeFor = (actor: AuthenticatedActor, workspaceId: string, sessionId = "session-1") =>
    resolvePaceContextEnvelope(workspaces, { actor, workspaceId, language: "en", session: { runtime: "local", id: sessionId } });

  let turn = 0;
  /** One member turn through the orchestrator with the real InboxAgent and a scripted model. */
  const ask = async (request: string, steps: readonly Step[], envelope?: PaceContextEnvelope) => {
    turn += 1;
    const model = scriptedModel(steps);
    const result = await createPaceOrchestrator({
      ...deps,
      executors: { inbox: createInboxAgent({ model }) },
    }).handle({ request, envelope: envelope ?? (await envelopeFor(owner, workspaceOne, `session-${turn}`)) });
    const inbox = result.results.find((entry) => entry.agentId === "inbox");
    assert.ok(inbox, `"${request}" reaches the Inbox sub-agent`);
    return { result, inbox, model };
  };

  let calls = 0;
  const invoke = async (tool: string, input: unknown, envelope: PaceContextEnvelope) => {
    calls += 1;
    return (await invokePaceCapability(deps, { agentId: "inbox", tool, input, envelope, callId: `direct-${calls}` })).result;
  };
  const submitCall = (actionId: string, envelope: PaceContextEnvelope, callId: string) =>
    ({ agentId: "inbox", tool: "submit_inbox_resolution_draft", input: { actionId }, envelope, callId }) as const;
  /** APPROVAL → EXECUTE → VERIFY, as the member's confirmation drives it. */
  const approveAndExecute = async (actionId: string, envelope: PaceContextEnvelope) => {
    const approval = await resolvePaceApproval(deps, submitCall(actionId, envelope, `approve-${actionId}`), "approve");
    assert.equal(approval.result.status, "ok");
    return (await invokePaceCapability(deps, submitCall(actionId, envelope, `execute-${actionId}`))).result;
  };

  const statusOf = (itemId: string) => financial.items.get(itemId)!.status;
  const categoryOf = (transaction: LedgerTransactionRecord) => ledgerRecords.transactions.get(transaction.id)!.categoryId;
  const recurringStatusOf = (recurringId: string) => financial.recurring.get(recurringId)!.status;
  /** Everything a resolution could touch: transactions, Inbox items, classifications, and recurring payments. */
  const snapshot = () =>
    JSON.stringify(
      [ledgerRecords.transactions, financial.items, financial.classifications, financial.recurring].map((records) => [...records.values()]),
      (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
    );

  return {
    actions, amazon, amazonTransaction, approveAndExecute, ask, canal, canalRecurring, canonical, carrefour,
    carrefourClassification, carrefourTransaction, categoryOf, deps, envelopeFor, financial, foreign, invoke,
    ledgerRecords, netflix, netflixRecurring, netflixTransaction, recurringStatusOf, snapshot, statusOf, submitCall,
    taxi, taxiTransaction, trace, wallet, walletTransaction,
  };
}

const outputsOf = (result: PaceSubAgentResult) => result.toolResults.map((toolResult) => `${toolResult.tool}:${toolResult.status}`);
const dataOf = <T>(result: PaceSubAgentResult, tool: string) =>
  result.toolResults.find((toolResult) => toolResult.tool === tool)?.data as T;
const xaf = (minorUnits: string): Money => ({ minorUnits, currency: "XAF" });

const prepareAndSubmit = (input: Record<string, unknown>, question = "Which Inbox item do you mean?"): Step[] => [
  () => ({ call: ["create_inbox_resolution_draft", input] }),
  (outputs) =>
    outputs.create_inbox_resolution_draft!.data?.isReadyForApproval
      ? { call: ["submit_inbox_resolution_draft", { actionId: outputs.create_inbox_resolution_draft!.actionId }] }
      : { text: question },
];

test("the registered inbox sub-agent owns every capability the InboxAgent offers the model", async () => {
  const { ask } = await createFixture();
  const { model } = await ask("What do I need to review?", [() => ({ text: "Nothing to add." })]);

  const call = model.doGenerateCalls[0]!;
  assert.deepEqual(
    (call.tools ?? []).map((tool) => tool.name).sort(),
    inboxSubAgent.capabilities.map((capability) => capability.tool).sort(),
  );
  const system = JSON.stringify(call.prompt.filter((message) => message.role === "system"));
  assert.match(system, /Never invent or guess an Inbox item id, a transaction id, a category id, or a recurring id/);
  assert.match(system, /never describe an item as resolved until its verified result returns/);
  assert.match(system, /Workspace currency: XAF/);

  assert.deepEqual(
    inboxSubAgent.capabilities.map((capability) => [capability.tool, capability.access, capability.approval]),
    [
      ["get_inbox_items", "read", "none"],
      ["get_inbox_item", "read", "none"],
      ["create_inbox_resolution_draft", "prepare", "none"],
      ["submit_inbox_resolution_draft", "commit", "required"],
    ],
  );
});

test("the example requests reach the Inbox sub-agent", () => {
  const inboxFirst = [
    ["What do I need to review?", "read"],
    ["Why is this transaction in my Inbox?", "read"],
    ["Categorize this as Transport", "write"],
    ["Accept the suggested category", "write"],
    ["Ignore this recurring suggestion", "write"],
    ["Resolve my Inbox", "write"],
  ] as const;
  for (const [request, intent] of inboxFirst) {
    const plan = routePaceRequest(paceSubAgentRegistry, request);
    assert.equal(plan.routes[0]?.agentId, "inbox", request);
    assert.equal(plan.intent, intent, request);
  }

  const confirm = routePaceRequest(paceSubAgentRegistry, "Confirm this recurring payment");
  assert.equal(confirm.routes[0]?.agentId, "recurring");
  assert.equal(confirm.routes.some((route) => route.agentId === "inbox"), false);
  const fromInbox = routePaceRequest(paceSubAgentRegistry, "Confirm this recurring payment from my Inbox");
  assert.equal(fromInbox.routes.some((route) => route.agentId === "inbox"), true);
  assert.equal(fromInbox.intent, "write");
});

test("unresolved Inbox items are listed and summarized by reason without approval", async () => {
  const { actions, amazon, ask, canal, carrefour, netflix, snapshot, taxi, trace, wallet } = await createFixture();
  const before = snapshot();

  const { result, inbox } = await ask("What do I need to review?", [
    () => ({ call: ["get_inbox_items", {}] }),
    (outputs) => ({ text: `${(outputs.get_inbox_items!.data as unknown as Listing).unresolvedCount} items need your review.` }),
  ]);

  assert.equal(result.status, "completed");
  assert.deepEqual(outputsOf(inbox), ["get_inbox_items:ok"]);
  const listing = dataOf<Listing>(inbox, "get_inbox_items");
  assert.equal(listing.unresolvedCount, 6);
  assert.equal(listing.matchingCount, 6);
  assert.equal(listing.listedCount, 6);
  assert.deepEqual(
    listing.items.map((item) => item.id).sort(),
    [carrefour.id, taxi.id, netflix.id, canal.id, amazon.id, wallet.id].sort(),
  );
  assert.deepEqual(listing.summary, [
    { reason: "UNKNOWN_CATEGORY", issue: "Category is missing", count: 1, resolutionSupported: true },
    { reason: "POSSIBLE_TRANSFER", issue: "Possible transfer", count: 1, resolutionSupported: false },
    { reason: "POSSIBLE_RECURRING", issue: "Possible recurring payment", count: 2, resolutionSupported: true },
    { reason: "MERCHANT_AMBIGUITY", issue: "Merchant is ambiguous", count: 1, resolutionSupported: false },
    { reason: "CLASSIFICATION_REVIEW", issue: "Category needs review", count: 1, resolutionSupported: true },
  ]);
  const listed = new Map(listing.items.map((item) => [item.id, item]));
  assert.deepEqual(listed.get(carrefour.id)?.amount, xaf("32500"));
  assert.deepEqual(listed.get(carrefour.id)?.resolution.availableOperations, ["ACCEPT_SUGGESTION", "CHOOSE_CATEGORY"]);
  assert.deepEqual(listed.get(taxi.id)?.resolution.availableOperations, ["CHOOSE_CATEGORY"]);
  assert.deepEqual(listed.get(netflix.id)?.resolution.availableOperations, ["CONFIRM_RECURRING", "IGNORE_RECURRING"]);
  assert.deepEqual(listed.get(amazon.id)?.resolution.availableOperations, []);
  assert.deepEqual(listed.get(wallet.id)?.resolution.availableOperations, []);
  assert.equal(inbox.summary, "6 items need your review.");

  const recurringOnly = await ask("Which recurring suggestions are pending in my Inbox?", [
    () => ({ call: ["get_inbox_items", { reason: "POSSIBLE_RECURRING", limit: 1 }] }),
    () => ({ text: "Two recurring suggestions; one is listed." }),
  ]);
  const filtered = dataOf<Listing>(recurringOnly.inbox, "get_inbox_items");
  assert.equal(filtered.unresolvedCount, 6);
  assert.equal(filtered.matchingCount, 2);
  assert.equal(filtered.listedCount, 1);
  assert.equal(filtered.items.every((item) => item.reason === "POSSIBLE_RECURRING"), true);

  assert.deepEqual(result.pendingApprovals, []);
  assert.equal(actions.actions.size, 0);
  assert.equal(trace.events.some((event) => event.type.startsWith("approval.")), false);
  assert.equal(snapshot(), before);
});

test("an item's reason is explained from its stored facts", async () => {
  const { ask, carrefour, carrefourTransaction, netflix, netflixRecurring, taxi } = await createFixture();

  const { result, inbox } = await ask("Why is the Carrefour transaction in my Inbox?", [
    () => ({ call: ["get_inbox_item", { merchantName: "Carrefour" }] }),
    (outputs) => ({ text: (outputs.get_inbox_item!.data as unknown as Located).item.why }),
  ]);

  assert.equal(inbox.status, "completed");
  assert.deepEqual(result.pendingApprovals, []);
  const { item } = dataOf<Located>(inbox, "get_inbox_item");
  assert.equal(item.id, carrefour.id);
  assert.equal(item.reason, "CLASSIFICATION_REVIEW");
  assert.equal(item.issue, "Category needs review");
  assert.match(item.why, /suggested the category "Groceries" but was not confident enough/);
  assert.equal(inbox.summary, item.why);
  assert.equal(item.transaction.id, carrefourTransaction.id);
  assert.equal(item.transaction.category, null);
  assert.deepEqual(item.suggestion, { category: { id: SYSTEM_GROCERIES_ID, name: "Groceries" }, confidence: "REVIEW" });
  assert.equal(item.recurring, null);
  assert.equal(item.resolution.supported, true);
  assert.equal(item.resolution.unavailableReason, null);

  const missing = await ask("Why is City Taxi in my Inbox?", [
    () => ({ call: ["get_inbox_item", { inboxItemId: taxi.id }] }),
    () => ({ text: "It has no category yet." }),
  ]);
  const uncategorized = dataOf<Located>(missing.inbox, "get_inbox_item").item;
  assert.equal(uncategorized.reason, "UNKNOWN_CATEGORY");
  assert.match(uncategorized.why, /could not determine a category/);
  assert.equal(uncategorized.suggestion, null);

  const pattern = await ask("Why is Netflix in my Inbox?", [
    () => ({ call: ["get_inbox_item", { merchantName: "Netflix" }] }),
    () => ({ text: "It looks recurring." }),
  ]);
  const recurring = dataOf<Located>(pattern.inbox, "get_inbox_item").item;
  assert.equal(recurring.id, netflix.id);
  assert.match(recurring.why, /repeating pattern, about every 30 days\. It is only a suggestion/);
  assert.deepEqual(recurring.recurring, {
    id: netflixRecurring.id, name: "netflix", status: "CANDIDATE", typicalAmount: xaf("6500"), cadenceDays: 30, frequency: "monthly",
  });
});

test("an unknown or unnamed item returns candidates and is never guessed", async () => {
  const { actions, ask, envelopeFor, invoke, snapshot, taxi } = await createFixture();
  const before = snapshot();

  const unknown = await ask("Why is Uber in my Inbox?", [
    () => ({ call: ["get_inbox_item", { merchantName: "Uber" }] }),
    () => ({ text: "I could not find an Uber item. Which one do you mean?" }),
  ]);
  const missing = dataOf<Unresolved>(unknown.inbox, "get_inbox_item");
  assert.equal(missing.resolved, false);
  assert.equal(missing.reason, "NOT_FOUND");
  assert.equal(missing.candidates.length, 6);
  assert.equal(unknown.inbox.status, "needs_input");

  const unnamed = await ask("Categorize this as Transport", prepareAndSubmit({
    operation: "CHOOSE_CATEGORY", categoryName: "Transport", sourceText: "Categorize this as Transport",
  }));
  const draft = dataOf<Prepared>(unnamed.inbox, "create_inbox_resolution_draft").draft;
  assert.equal(draft.inboxItemId, null);
  assert.deepEqual(draft.missingFields, ["item"]);
  assert.equal(draft.candidates.length, 2);
  assert.equal(draft.approvalSummary, null);
  assert.equal(unnamed.inbox.status, "needs_input");
  assert.deepEqual(unnamed.result.pendingApprovals, []);

  const envelope = await envelopeFor(owner, workspaceOne);
  const guessed = await invoke("get_inbox_item", { inboxItemId: randomUUID() }, envelope);
  assert.equal(guessed.status, "refused");
  assert.equal(guessed.error?.code, "DOMAIN_REJECTED");
  const both = await invoke("get_inbox_item", { inboxItemId: taxi.id, merchantName: "City Taxi" }, envelope);
  assert.equal(both.error?.code, "INVALID_INPUT");
  const incomplete = await invoke("submit_inbox_resolution_draft", { actionId: [...actions.actions.keys()][0] }, envelope);
  assert.equal(incomplete.status, "refused");

  assert.equal(snapshot(), before);
});

test("accepting the category suggestion is prepared precisely and only applied after approval", async () => {
  const { approveAndExecute, ask, carrefour, carrefourTransaction, categoryOf, envelopeFor, financial, ledgerRecords, statusOf } = await createFixture();
  const request = "Accept the suggested category for Carrefour";
  const transactionsBefore = ledgerRecords.transactions.size;

  const { result, inbox } = await ask(request, prepareAndSubmit({
    operation: "ACCEPT_SUGGESTION", merchantName: "Carrefour", sourceText: request,
  }));

  assert.equal(result.status, "approval_required");
  assert.deepEqual(outputsOf(inbox), ["create_inbox_resolution_draft:ok", "submit_inbox_resolution_draft:approval_required"]);
  const prepared = dataOf<Prepared>(inbox, "create_inbox_resolution_draft");
  assert.equal(prepared.draft.inboxOperation, "ACCEPT_SUGGESTION");
  assert.equal(prepared.draft.inboxItemId, carrefour.id);
  assert.equal(prepared.draft.currentCategory, null);
  assert.deepEqual(prepared.draft.category, { id: SYSTEM_GROCERIES_ID, name: "Groceries" });
  assert.equal(
    prepared.draft.approvalSummary?.text,
    [
      "Resolve Inbox item",
      "",
      "Transaction:",
      "Carrefour — 32,500 XAF",
      "",
      "Current issue:",
      "Category needs review",
      "",
      "Change:",
      "Uncategorized → Groceries",
      "",
      "Only this transaction's category changes.",
      "Its amount, account, and date stay the same, and no balance is affected.",
    ].join("\n"),
  );
  assert.equal(categoryOf(carrefourTransaction), null);
  assert.equal(statusOf(carrefour.id), "OPEN");

  const actionId = inbox.pendingApprovals[0]!.actionId;
  const executed = await approveAndExecute(actionId, await envelopeFor(owner, workspaceOne));
  assert.equal(executed.status, "ok");
  const verified = executed.data as Verified;
  assert.equal(verified.inboxItemId, carrefour.id);
  assert.equal(verified.itemStatus, "RESOLVED");
  assert.deepEqual(verified.category, { id: SYSTEM_GROCERIES_ID, name: "Groceries" });
  assert.deepEqual(verified.resolvedInboxItemIds, [carrefour.id]);
  assert.deepEqual(verified.remainingReasons, []);

  assert.equal(categoryOf(carrefourTransaction), SYSTEM_GROCERIES_ID);
  assert.equal(statusOf(carrefour.id), "RESOLVED");
  assert.equal(ledgerRecords.transactions.size, transactionsBefore);
  assert.equal(ledgerRecords.transactions.get(carrefourTransaction.id)!.amountMinor, 32_500n);
  assert.equal(
    (await financial.listAudit(workspaceOne, undefined, carrefour.id)).at(-1)?.event,
    "INBOX_CATEGORY_SUGGESTION_ACCEPTED",
  );
});

test("the member can choose another category, and only a real one", async () => {
  const { approveAndExecute, ask, carrefour, carrefourTransaction, categoryOf, envelopeFor, financial, statusOf, taxi, taxiTransaction } = await createFixture();
  const request = "Categorize City Taxi as Transport";

  const { inbox } = await ask(request, prepareAndSubmit({
    operation: "CHOOSE_CATEGORY", merchantName: "City Taxi", categoryName: "Transport", sourceText: request,
  }));
  const prepared = dataOf<Prepared>(inbox, "create_inbox_resolution_draft");
  assert.deepEqual(prepared.draft.category, { id: SYSTEM_TRANSPORT_ID, name: "Transport" });
  assert.equal(prepared.draft.approvalSummary?.transaction, "City Taxi — 3,500 XAF");
  assert.equal(prepared.draft.approvalSummary?.issue, "Category is missing");
  assert.equal(prepared.draft.approvalSummary?.change, "Uncategorized → Transport");
  assert.equal(categoryOf(taxiTransaction), null);

  const envelope = await envelopeFor(owner, workspaceOne);
  const executed = await approveAndExecute(inbox.pendingApprovals[0]!.actionId, envelope);
  assert.equal(executed.status, "ok");
  assert.equal(categoryOf(taxiTransaction), SYSTEM_TRANSPORT_ID);
  assert.equal(statusOf(taxi.id), "RESOLVED");
  assert.equal(
    (await financial.listAudit(workspaceOne, undefined, taxi.id)).at(-1)?.event,
    "INBOX_CATEGORY_MANUALLY_SELECTED",
  );

  const overridden = await ask("Categorize Carrefour as Transport", prepareAndSubmit({
    operation: "CHOOSE_CATEGORY", inboxItemId: carrefour.id, categoryName: "transport", sourceText: "Categorize Carrefour as Transport",
  }));
  assert.equal(
    dataOf<Prepared>(overridden.inbox, "create_inbox_resolution_draft").draft.approvalSummary?.change,
    "Uncategorized → Transport",
  );
  await approveAndExecute(overridden.inbox.pendingApprovals[0]!.actionId, envelope);
  assert.equal(categoryOf(carrefourTransaction), SYSTEM_TRANSPORT_ID);
  assert.equal([...financial.classifications.values()].find((entry) => entry.transactionId === carrefourTransaction.id)?.suggestedCategoryId, SYSTEM_GROCERIES_ID);
});

test("an unknown category or a missing suggestion is asked about, never invented", async () => {
  const { amazonTransaction, ask, categoryOf, envelopeFor, invoke, snapshot, taxi, taxiTransaction } = await createFixture();
  const before = snapshot();

  const unknown = await ask("Categorize City Taxi as Rides", prepareAndSubmit({
    operation: "CHOOSE_CATEGORY", merchantName: "City Taxi", categoryName: "Rides", sourceText: "Categorize City Taxi as Rides",
  }, "I could not find that category. Which one do you mean?"));
  const draft = dataOf<Prepared>(unknown.inbox, "create_inbox_resolution_draft").draft;
  assert.equal(draft.inboxItemId, taxi.id);
  assert.equal(draft.category, null);
  assert.deepEqual(draft.missingFields, ["category"]);
  assert.deepEqual(draft.categoryCandidates.map((category) => category.name).sort(), ["Groceries", "Other expense", "Transport"]);
  assert.equal(draft.approvalSummary, null);
  assert.equal(unknown.inbox.status, "needs_input");
  assert.deepEqual(unknown.result.pendingApprovals, []);

  const envelope = await envelopeFor(owner, workspaceOne);
  const income = await invoke(
    "create_inbox_resolution_draft",
    { operation: "CHOOSE_CATEGORY", inboxItemId: taxi.id, categoryName: "Salary", sourceText: "it was salary" },
    envelope,
  );
  assert.deepEqual((income.data as Prepared).draft.missingFields, ["category"]);

  const noSuggestion = await invoke(
    "create_inbox_resolution_draft",
    { operation: "ACCEPT_SUGGESTION", inboxItemId: taxi.id, sourceText: "accept the suggestion" },
    envelope,
  );
  assert.equal(noSuggestion.status, "refused");
  assert.equal(noSuggestion.error?.code, "DOMAIN_REJECTED");
  assert.match(noSuggestion.error!.message, /no current category suggestion to accept/);

  const smuggledId = await invoke(
    "create_inbox_resolution_draft",
    { operation: "CHOOSE_CATEGORY", inboxItemId: taxi.id, categoryId: SYSTEM_TRANSPORT_ID, sourceText: "use this id" },
    envelope,
  );
  assert.equal(smuggledId.error?.code, "INVALID_INPUT");

  assert.equal(categoryOf(taxiTransaction), null);
  assert.equal(categoryOf(amazonTransaction), null);
  assert.equal(snapshot(), before);
});

test("a recurring suggestion is confirmed through the canonical recurring service", async () => {
  const { approveAndExecute, ask, canal, canonical, envelopeFor, financial, ledgerRecords, netflix, netflixRecurring, recurringStatusOf, statusOf } = await createFixture();
  const request = "Confirm this recurring payment from my Inbox";
  const transactionsBefore = JSON.stringify([...ledgerRecords.transactions.values()].map((transaction) => [transaction.id, transaction.updatedAt]));

  const { result, inbox } = await ask(request, prepareAndSubmit({
    operation: "CONFIRM_RECURRING", merchantName: "Netflix", sourceText: request,
  }));

  assert.equal(result.pendingApprovals.length, 1);
  const prepared = dataOf<Prepared>(inbox, "create_inbox_resolution_draft");
  assert.equal(prepared.draft.recurringId, netflixRecurring.id);
  assert.equal(prepared.draft.category, null);
  assert.equal(
    prepared.draft.approvalSummary?.text,
    [
      "Resolve Inbox item",
      "",
      "Transaction:",
      "Netflix — 6,500 XAF",
      "",
      "Current issue:",
      "Possible recurring payment",
      "",
      "Change:",
      "Confirm detected recurring payment — 6,500 XAF / month",
      "",
      "This will confirm the detected pattern so Pace projects its future occurrences.",
      "It will not create or modify any Transaction.",
    ].join("\n"),
  );
  assert.equal(recurringStatusOf(netflixRecurring.id), "CANDIDATE");
  assert.equal(statusOf(netflix.id), "OPEN");
  assert.deepEqual(canonical.calls, []);

  const executed = await approveAndExecute(inbox.pendingApprovals[0]!.actionId, await envelopeFor(owner, workspaceOne));
  assert.equal(executed.status, "ok");
  const verified = executed.data as Verified;
  assert.deepEqual(verified.recurring, { id: netflixRecurring.id, status: "CONFIRMED" });
  assert.equal(verified.itemStatus, "RESOLVED");
  assert.equal(verified.category, null);
  assert.deepEqual(canonical.calls, ["confirm"]);

  assert.equal(recurringStatusOf(netflixRecurring.id), "CONFIRMED");
  assert.equal(statusOf(netflix.id), "RESOLVED");
  assert.equal(statusOf(canal.id), "OPEN");
  assert.equal(financial.recurring.size, 2);
  assert.equal([...financial.audit.values()].filter((entry) => entry.event === "RECURRING_CONFIRMED").length, 1);
  assert.equal(
    JSON.stringify([...ledgerRecords.transactions.values()].map((transaction) => [transaction.id, transaction.updatedAt])),
    transactionsBefore,
  );
});

test("a recurring suggestion is ignored through the canonical recurring service", async () => {
  const { approveAndExecute, ask, canal, canalRecurring, canonical, envelopeFor, financial, invoke, ledgerRecords, netflix, recurringStatusOf, statusOf } = await createFixture();
  const request = "Ignore this recurring suggestion for Canal Plus";
  const transactionsBefore = ledgerRecords.transactions.size;

  const { inbox } = await ask(request, prepareAndSubmit({
    operation: "IGNORE_RECURRING", merchantName: "Canal Plus", sourceText: request,
  }));
  const prepared = dataOf<Prepared>(inbox, "create_inbox_resolution_draft");
  assert.equal(prepared.draft.approvalSummary?.change, "Ignore detected recurring payment — 10,000 XAF / month");
  assert.deepEqual(prepared.draft.approvalSummary?.effects, [
    "This will stop Pace from treating this detected pattern as recurring. It can be restored later.",
    "It will not modify past Transactions.",
  ]);

  const envelope = await envelopeFor(owner, workspaceOne);
  const executed = await approveAndExecute(inbox.pendingApprovals[0]!.actionId, envelope);
  assert.equal(executed.status, "ok");
  assert.deepEqual((executed.data as Verified).recurring, { id: canalRecurring.id, status: "IGNORED" });
  assert.deepEqual(canonical.calls, ["ignore"]);
  assert.equal(recurringStatusOf(canalRecurring.id), "IGNORED");
  assert.equal(statusOf(canal.id), "RESOLVED");
  assert.equal(statusOf(netflix.id), "OPEN");
  assert.equal(financial.recurring.size, 2);
  assert.equal(ledgerRecords.transactions.size, transactionsBefore);

  const wrongKind = await invoke(
    "create_inbox_resolution_draft",
    { operation: "CHOOSE_CATEGORY", inboxItemId: netflix.id, categoryName: "Transport", sourceText: "categorize Netflix" },
    envelope,
  );
  assert.equal(wrongKind.status, "refused");
  assert.match(wrongKind.error!.message, /not a category/);
});

test("every AI-initiated resolution is held for approval and cannot be skipped or revived", async () => {
  const { actions, ask, canonical, carrefour, deps, envelopeFor, invoke, snapshot, submitCall } = await createFixture();
  const before = snapshot();
  const request = "Accept the suggested category for Carrefour";

  const { result, inbox } = await ask(request, prepareAndSubmit({
    operation: "ACCEPT_SUGGESTION", merchantName: "Carrefour", sourceText: request,
  }));
  assert.equal(result.status, "approval_required");
  assert.equal(inbox.status, "approval_required");
  const actionId = inbox.pendingApprovals[0]!.actionId;
  assert.equal((await actions.findAction(workspaceOne, actionId))?.status, "WAITING_APPROVAL");

  const envelope = await envelopeFor(owner, workspaceOne);
  const unapproved = await invokePaceCapability(deps, submitCall(actionId, envelope, "skip-approval"));
  assert.equal(unapproved.result.status, "approval_required");
  assert.equal(unapproved.result.data, null);
  assert.equal(snapshot(), before);

  const viewerEnvelope = await envelopeFor(viewer, workspaceOne, "viewer-session");
  const viewerWrites = [
    ["create_inbox_resolution_draft", { operation: "ACCEPT_SUGGESTION", inboxItemId: carrefour.id, sourceText: "accept it" }],
    ["submit_inbox_resolution_draft", { actionId }],
  ] as const;
  for (const [tool, input] of viewerWrites) {
    assert.equal((await invoke(tool, input, viewerEnvelope)).error?.code, "PERMISSION_DENIED", tool);
  }
  const viewerApproval = await resolvePaceApproval(deps, submitCall(actionId, viewerEnvelope, "viewer-approve"), "approve");
  assert.equal(viewerApproval.result.error?.code, "PERMISSION_DENIED");
  assert.equal((await invoke("get_inbox_items", {}, viewerEnvelope)).status, "ok");
  const viewerDetail = (await invoke("get_inbox_item", { inboxItemId: carrefour.id }, viewerEnvelope)).data as Located;
  assert.deepEqual(viewerDetail.item.resolution.availableOperations, []);
  assert.match(viewerDetail.item.resolution.unavailableReason!, /do not have permission/);

  await resolvePaceApproval(deps, submitCall(actionId, envelope, "reject"), "reject");
  const rejected = await invokePaceCapability(deps, submitCall(actionId, envelope, "after-reject"));
  assert.equal(rejected.result.status, "refused");
  assert.equal(rejected.result.error?.code, "DOMAIN_REJECTED");

  assert.deepEqual(canonical.calls, []);
  assert.equal(snapshot(), before);
  assert.equal([...actions.actions.values()].some((action) => action.status === "COMPLETED"), false);
});

test("an approved resolution is revalidated against current state before it runs", async () => {
  const { actions, approveAndExecute, ask, canonical, carrefour, carrefourClassification, carrefourTransaction, categoryOf, envelopeFor, financial, netflix, netflixRecurring, recurringStatusOf, statusOf } = await createFixture();
  const envelope = await envelopeFor(owner, workspaceOne);

  const accept = await ask("Accept the suggested category for Carrefour", prepareAndSubmit({
    operation: "ACCEPT_SUGGESTION", merchantName: "Carrefour", sourceText: "Accept the suggested category for Carrefour",
  }));
  const acceptId = accept.inbox.pendingApprovals[0]!.actionId;
  financial.classifications.set(carrefourClassification.id, {
    ...carrefourClassification,
    suggestedCategoryId: SYSTEM_TRANSPORT_ID,
    updatedAt: new Date(carrefourClassification.updatedAt.getTime() + 1_000),
  });

  const staleSuggestion = await approveAndExecute(acceptId, envelope);
  assert.equal(staleSuggestion.status, "refused");
  assert.equal(staleSuggestion.error?.code, "DOMAIN_REJECTED");
  assert.match(staleSuggestion.error!.message, /category suggestion changed since the resolution was prepared/);
  assert.equal(categoryOf(carrefourTransaction), null);
  assert.equal(statusOf(carrefour.id), "OPEN");
  const failed = await actions.findAction(workspaceOne, acceptId);
  assert.equal(failed?.status, "FAILED");
  assert.equal(failed?.result, null);

  const confirm = await ask("Confirm this recurring payment from my Inbox", prepareAndSubmit({
    operation: "CONFIRM_RECURRING", merchantName: "Netflix", sourceText: "Confirm the Netflix recurring payment",
  }));
  const confirmId = confirm.inbox.pendingApprovals[0]!.actionId;
  const item = financial.items.get(netflix.id)!;
  financial.items.set(netflix.id, { ...item, updatedAt: new Date(item.updatedAt.getTime() + 1_000) });

  const staleItem = await approveAndExecute(confirmId, envelope);
  assert.equal(staleItem.status, "refused");
  assert.match(staleItem.error!.message, /changed since the resolution was prepared/);
  assert.equal(recurringStatusOf(netflixRecurring.id), "CANDIDATE");
  assert.equal(statusOf(netflix.id), "OPEN");

  const settled = await ask("Ignore this recurring suggestion for Netflix", prepareAndSubmit({
    operation: "IGNORE_RECURRING", merchantName: "Netflix", sourceText: "Ignore the Netflix suggestion",
  }));
  const current = financial.recurring.get(netflixRecurring.id)!;
  financial.recurring.set(netflixRecurring.id, { ...current, status: "CONFIRMED" });
  const alreadyDecided = await approveAndExecute(settled.inbox.pendingApprovals[0]!.actionId, envelope);
  assert.equal(alreadyDecided.status, "refused");
  assert.equal(recurringStatusOf(netflixRecurring.id), "CONFIRMED");

  assert.deepEqual(canonical.calls, []);
});

test("a merchant ambiguity is explained and never resolved", async () => {
  const { actions, amazon, ask, canonical, envelopeFor, invoke, snapshot } = await createFixture();
  const before = snapshot();

  const explained = await ask("Why is AMZN MKTP in my Inbox?", [
    () => ({ call: ["get_inbox_item", { merchantName: "AMZN MKTP" }] }),
    (outputs) => ({ text: (outputs.get_inbox_item!.data as unknown as Located).item.why }),
  ]);
  const { item } = dataOf<Located>(explained.inbox, "get_inbox_item");
  assert.equal(item.id, amazon.id);
  assert.equal(item.reason, "MERCHANT_AMBIGUITY");
  assert.match(item.why, /could not tell which merchant/);
  assert.equal(item.resolution.supported, false);
  assert.deepEqual(item.resolution.availableOperations, []);
  assert.match(item.resolution.unavailableReason!, /no safe way to settle a merchant ambiguity/);

  const attempt = await ask("Categorize AMZN MKTP as Groceries and resolve it in my Inbox", prepareAndSubmit({
    operation: "CHOOSE_CATEGORY", merchantName: "AMZN MKTP", categoryName: "Groceries", sourceText: "Categorize AMZN MKTP as Groceries",
  }, "Pace cannot resolve a merchant ambiguity yet."));
  assert.deepEqual(outputsOf(attempt.inbox), ["create_inbox_resolution_draft:ok"]);
  const refusal = dataOf<NotPrepared>(attempt.inbox, "create_inbox_resolution_draft");
  assert.equal(refusal.prepared, false);
  assert.equal(refusal.supported, false);
  assert.match(refusal.explanation, /cannot be resolved, dismissed, or marked as reviewed/);
  assert.equal(refusal.item.id, amazon.id);
  assert.equal(attempt.inbox.toolResults[0]!.actionId, null);
  assert.equal(attempt.inbox.status, "completed");
  assert.deepEqual(attempt.result.pendingApprovals, []);

  const envelope = await envelopeFor(owner, workspaceOne);
  for (const operation of ["ACCEPT_SUGGESTION", "CHOOSE_CATEGORY", "CONFIRM_RECURRING", "IGNORE_RECURRING"]) {
    const outcome = await invoke(
      "create_inbox_resolution_draft",
      { operation, inboxItemId: amazon.id, categoryName: "Groceries", sourceText: "resolve it" },
      envelope,
    );
    assert.equal((outcome.data as NotPrepared).prepared, false, operation);
    assert.equal(outcome.actionId, null, operation);
  }
  for (const operation of ["RESOLVE_MERCHANT", "DISMISS", "MARK_REVIEWED"]) {
    const outcome = await invoke(
      "create_inbox_resolution_draft",
      { operation, inboxItemId: amazon.id, sourceText: "resolve it" },
      envelope,
    );
    assert.equal(outcome.error?.code, "INVALID_INPUT", operation);
  }

  assert.equal(actions.actions.size, 0);
  assert.deepEqual(canonical.calls, []);
  assert.equal(snapshot(), before);
});

test("a suspected transfer is explained and never converted or settled", async () => {
  const { actions, ask, canonical, envelopeFor, invoke, ledgerRecords, snapshot, wallet, walletTransaction } = await createFixture();
  const before = snapshot();

  const explained = await ask("Why is Orange Money in my Inbox?", [
    () => ({ call: ["get_inbox_item", { merchantName: "Orange Money" }] }),
    (outputs) => ({ text: (outputs.get_inbox_item!.data as unknown as Located).item.why }),
  ]);
  const { item } = dataOf<Located>(explained.inbox, "get_inbox_item");
  assert.equal(item.id, wallet.id);
  assert.equal(item.reason, "POSSIBLE_TRANSFER");
  assert.match(item.why, /suspects it is a transfer rather than spending\. It is still recorded as an expense/);
  assert.equal(item.resolution.supported, false);
  assert.deepEqual(item.resolution.availableOperations, []);
  assert.match(item.resolution.unavailableReason!, /cannot convert this transaction into a transfer/);

  const envelope = await envelopeFor(owner, workspaceOne);
  for (const operation of ["ACCEPT_SUGGESTION", "CHOOSE_CATEGORY", "CONFIRM_RECURRING", "IGNORE_RECURRING"]) {
    const outcome = await invoke(
      "create_inbox_resolution_draft",
      { operation, merchantName: "Orange Money", categoryName: "Transport", sourceText: "it is a transfer" },
      envelope,
    );
    assert.equal(outcome.status, "ok", operation);
    assert.equal((outcome.data as NotPrepared).prepared, false, operation);
    assert.match((outcome.data as NotPrepared).explanation, /Nothing is changed and it stays in the Inbox/);
  }
  for (const operation of ["CONVERT_TO_TRANSFER", "REVIEW_TRANSFER", "CONFIRM_TRANSFER"]) {
    const outcome = await invoke(
      "create_inbox_resolution_draft",
      { operation, inboxItemId: wallet.id, sourceText: "it is a transfer" },
      envelope,
    );
    assert.equal(outcome.error?.code, "INVALID_INPUT", operation);
  }

  assert.equal(ledgerRecords.transactions.get(walletTransaction.id)!.kind, "EXPENSE");
  assert.equal(actions.actions.size, 0);
  assert.deepEqual(canonical.calls, []);
  assert.equal(snapshot(), before);
});

test("no duplicate resolution exists to be invoked", async () => {
  const { actions, ask, carrefour, envelopeFor, invoke, snapshot } = await createFixture();
  const before = snapshot();

  const tools = inboxSubAgent.capabilities.map((capability) => capability.tool);
  assert.equal(tools.some((tool) => /duplicate|merge|dedup|dismiss|delete|remove|transfer|merchant/.test(tool)), false);
  assert.match(inboxSubAgent.instructions, /Pace cannot confirm, merge, or remove a duplicate/);

  const { result, inbox, model } = await ask("These two Carrefour transactions in my Inbox are duplicates, merge them", [
    () => ({ call: ["get_inbox_item", { merchantName: "Carrefour" }] }),
    () => ({ text: "Pace cannot confirm or merge duplicates." }),
  ]);
  assert.equal((model.doGenerateCalls[0]!.tools ?? []).some((tool) => /duplicate|merge/.test(tool.name)), false);
  assert.deepEqual(outputsOf(inbox), ["get_inbox_item:ok"]);
  const located = dataOf<Located>(inbox, "get_inbox_item");
  assert.equal(JSON.stringify(located).toLowerCase().includes("duplicate"), false);
  assert.deepEqual(result.pendingApprovals, []);

  const envelope = await envelopeFor(owner, workspaceOne);
  for (const tool of ["confirm_duplicate", "merge_transactions", "resolve_duplicate"]) {
    assert.equal((await invoke(tool, { inboxItemId: carrefour.id }, envelope)).error?.code, "CAPABILITY_NOT_OWNED", tool);
  }
  for (const operation of ["CONFIRM_DUPLICATE", "MERGE_DUPLICATE", "KEEP_SURVIVOR"]) {
    const outcome = await invoke(
      "create_inbox_resolution_draft",
      { operation, inboxItemId: carrefour.id, sourceText: "they are duplicates" },
      envelope,
    );
    assert.equal(outcome.error?.code, "INVALID_INPUT", operation);
  }

  assert.equal(actions.actions.size, 0);
  assert.equal(snapshot(), before);
});

test("a failed canonical resolution leaves the item unresolved", async () => {
  const { actions, approveAndExecute, ask, canonical, deps, envelopeFor, invoke, snapshot, submitCall, taxi, taxiTransaction, categoryOf, statusOf } = await createFixture();
  const before = snapshot();
  const envelope = await envelopeFor(owner, workspaceOne);
  const choose = () =>
    ask("Categorize City Taxi as Transport", prepareAndSubmit({
      operation: "CHOOSE_CATEGORY", merchantName: "City Taxi", categoryName: "Transport", sourceText: "Categorize City Taxi as Transport",
    }));

  const first = await choose();
  const failedId = first.inbox.pendingApprovals[0]!.actionId;
  canonical.fail = new Error("database unavailable");
  const failed = await approveAndExecute(failedId, envelope);
  canonical.fail = null;

  assert.equal(failed.status, "failed");
  assert.equal(failed.error?.code, "EXECUTION_FAILED");
  assert.equal(failed.data, null);
  assert.deepEqual(canonical.calls, ["choose"]);
  assert.equal(categoryOf(taxiTransaction), null);
  assert.equal(statusOf(taxi.id), "OPEN");
  assert.equal(snapshot(), before);
  const record = await actions.findAction(workspaceOne, failedId);
  assert.equal(record?.status, "FAILED");
  assert.equal(record?.result, null);
  assert.equal((await actions.listAudit(workspaceOne, failedId)).at(-1)?.event, "EXECUTION_FAILED");
  const retried = await invokePaceCapability(deps, submitCall(failedId, envelope, "retry-failed"));
  assert.equal(retried.result.status, "refused");

  const second = await choose();
  const unverifiedId = second.inbox.pendingApprovals[0]!.actionId;
  canonical.skip = true;
  const unverified = await approveAndExecute(unverifiedId, envelope);
  canonical.skip = false;

  assert.equal(unverified.status, "failed");
  assert.equal(unverified.data, null);
  assert.equal((await actions.findAction(workspaceOne, unverifiedId))?.status, "FAILED");
  assert.equal(statusOf(taxi.id), "OPEN");
  assert.equal(snapshot(), before);

  const stillListed = (await invoke("get_inbox_items", {}, envelope)).data as Listing;
  assert.equal(stillListed.unresolvedCount, 6);
  assert.equal(stillListed.items.some((item) => item.id === taxi.id), true);
});

test("the agent cannot read or resolve Inbox items across workspaces", async () => {
  const { ask, carrefour, carrefourTransaction, categoryOf, deps, envelopeFor, foreign, invoke, statusOf, submitCall } = await createFixture();
  await assert.rejects(envelopeFor(outsider, workspaceOne), AuthorizationError);
  await assert.rejects(envelopeFor(viewer, workspaceTwo), AuthorizationError);

  const elsewhere = await envelopeFor(owner, workspaceTwo, "session-two");
  const listed = await ask("What do I need to review?", [
    () => ({ call: ["get_inbox_items", {}] }),
    () => ({ text: "Done." }),
  ], elsewhere);
  const listing = dataOf<Listing>(listed.inbox, "get_inbox_items");
  assert.equal(listing.unresolvedCount, 1);
  assert.deepEqual(listing.items.map((item) => item.id), [foreign.id]);
  assert.equal(JSON.stringify(listed.result).includes(carrefour.id), false);
  assert.equal(JSON.stringify(listed.result).includes("Carrefour"), false);

  const attempts = [
    ["get_inbox_item", { inboxItemId: carrefour.id }],
    ["create_inbox_resolution_draft", { operation: "ACCEPT_SUGGESTION", inboxItemId: carrefour.id, sourceText: "accept it" }],
  ] as const;
  for (const [tool, input] of attempts) {
    const outcome = await invoke(tool, input, elsewhere);
    assert.equal(outcome.status, "refused", tool);
    assert.equal(outcome.error?.code, "DOMAIN_REJECTED", tool);
    assert.equal(outcome.data, null, tool);
  }

  const byName = (await invoke("get_inbox_item", { merchantName: "Carrefour" }, elsewhere)).data as Unresolved;
  assert.equal(byName.resolved, false);
  assert.deepEqual(byName.candidates.map((candidate) => candidate.id), [foreign.id]);
  const draftByName = await invoke(
    "create_inbox_resolution_draft",
    { operation: "ACCEPT_SUGGESTION", merchantName: "Carrefour", sourceText: "accept it" },
    elsewhere,
  );
  assert.deepEqual((draftByName.data as Prepared).draft.missingFields, ["item"]);
  assert.deepEqual((draftByName.data as Prepared).draft.candidates.map((candidate) => candidate.id), [foreign.id]);
  const smuggled = await invoke("get_inbox_items", { workspaceId: workspaceOne }, elsewhere);
  assert.equal(smuggled.error?.code, "INVALID_INPUT");

  const home = await envelopeFor(owner, workspaceOne);
  const draft = await invoke(
    "create_inbox_resolution_draft",
    { operation: "ACCEPT_SUGGESTION", inboxItemId: carrefour.id, sourceText: "accept it" },
    home,
  );
  assert.equal(draft.status, "ok");
  const leaked = await invokePaceCapability(deps, submitCall(draft.actionId!, elsewhere, "leak"));
  assert.equal(leaked.result.status, "refused");
  assert.equal(leaked.result.error?.code, "DOMAIN_REJECTED");
  const leakedApproval = await resolvePaceApproval(deps, submitCall(draft.actionId!, elsewhere, "leak-approve"), "approve");
  assert.equal(leakedApproval.result.status, "refused");

  assert.equal(categoryOf(carrefourTransaction), null);
  assert.equal(statusOf(carrefour.id), "OPEN");
  assert.equal(statusOf(foreign.id), "OPEN");
});

test("an approved resolution is verified against stored state, audited, and idempotent", async () => {
  const { actions, approveAndExecute, ask, canonical, carrefour, carrefourTransaction, deps, envelopeFor, financial, ledgerRecords, submitCall, trace } = await createFixture();
  const request = "Accept the suggested category for Carrefour";

  const { inbox } = await ask(request, prepareAndSubmit({
    operation: "ACCEPT_SUGGESTION", merchantName: "Carrefour", sourceText: request,
  }));
  const actionId = inbox.pendingApprovals[0]!.actionId;
  const envelope = await envelopeFor(owner, workspaceOne);

  const executed = await approveAndExecute(actionId, envelope);
  assert.equal(executed.status, "ok");
  assert.equal(executed.actionId, actionId);
  const verified = executed.data as Verified;
  assert.ok(!Number.isNaN(Date.parse(verified.verifiedAt)));
  const storedItem = financial.items.get(carrefour.id)!;
  const storedTransaction = ledgerRecords.transactions.get(carrefourTransaction.id)!;
  assert.deepEqual(
    { inboxItemId: verified.inboxItemId, itemStatus: verified.itemStatus, transactionId: verified.transactionId, categoryId: verified.category?.id },
    { inboxItemId: storedItem.id, itemStatus: storedItem.status, transactionId: storedTransaction.id, categoryId: storedTransaction.categoryId },
  );

  const completed = await actions.findAction(workspaceOne, actionId);
  assert.equal(completed?.type, "INBOX_RESOLVE");
  assert.equal(completed?.status, "COMPLETED");
  assert.deepEqual(completed?.result, verified);
  const audit = await actions.listAudit(workspaceOne, actionId);
  assert.deepEqual(
    audit.map((event) => event.event),
    ["DRAFT_CREATED", "APPROVAL_REQUESTED", "APPROVED", "EXECUTION_STARTED", "PERSISTENCE_VERIFIED"],
  );
  assert.deepEqual(audit.at(-1)?.metadata, {
    inboxItemId: carrefour.id,
    inboxOperation: "ACCEPT_SUGGESTION",
    transactionId: carrefourTransaction.id,
    categoryId: SYSTEM_GROCERIES_ID,
    recurringId: null,
    resolvedInboxItemIds: [carrefour.id],
  });
  const inboxAudit = await financial.listAudit(workspaceOne, undefined, carrefour.id);
  assert.equal(inboxAudit.at(-1)?.idempotencyKey, `agent-action:${actionId}`);
  assert.equal(inboxAudit.at(-1)?.actorUserId, owner.userId);

  const transactionAudits = (await ledgerRecords.listTransactionAudit(workspaceOne, carrefourTransaction.id)).length;
  const replay = await invokePaceCapability(deps, submitCall(actionId, envelope, "replay"));
  assert.deepEqual(replay.result.data, verified);
  assert.deepEqual(canonical.calls, ["accept"]);
  assert.equal((await ledgerRecords.listTransactionAudit(workspaceOne, carrefourTransaction.id)).length, transactionAudits);
  assert.equal((await financial.listAudit(workspaceOne, undefined, carrefour.id)).length, inboxAudit.length);

  const after = await ask("What do I need to review?", [
    () => ({ call: ["get_inbox_items", {}] }),
    () => ({ text: "Five items are left." }),
  ]);
  const listing = dataOf<Listing>(after.inbox, "get_inbox_items");
  assert.equal(listing.unresolvedCount, 5);
  assert.equal(listing.items.some((item) => item.id === carrefour.id), false);

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
});
