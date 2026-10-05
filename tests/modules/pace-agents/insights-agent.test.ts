import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { MockLanguageModelV4 } from "ai/test";

import { ConflictError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { toCurrencyCode } from "@/money/currency";
import type { InsightCandidate } from "@/money/insights";
import { AgentActionService } from "@/modules/agent-actions/agent-action-service";
import { getAccountAnalysisWithReaders } from "@/modules/insights/account/get-account-analysis";
import { createInsightsAgent } from "@/modules/insights/agent/insights-agent";
import { insightsSubAgent } from "@/modules/insights/agent/insights-sub-agent";
import {
  AGENT_INSIGHTS_RESULT_KINDS,
  resolveAgentInsightsPeriod,
  type AgentChartBlock,
  type AgentInsightsScope,
  type AgentMetric,
  type AgentMoney,
  type AgentReportExportResult,
} from "@/modules/insights/agent-insights-view";
import { getCategoryAnalysisWithReaders } from "@/modules/insights/category/get-category-analysis";
import { getInsightsOverviewWithReaders } from "@/modules/insights/overview/get-insights-overview";
import {
  createAgentInsightChart,
  generateAgentFinancialReport,
  getAgentAccountInsights,
  getAgentCategoryInsights,
  getAgentInsightsAnalytics,
  getAgentInsightsTrends,
  getAgentRecurringInsights,
  type AgentInsightsReadDependencies,
} from "@/modules/insights/queries/agent-insights-reads";
import { getInsightsRecurringWithReaders } from "@/modules/insights/recurring/get-insights-recurring";
import type {
  RecurringAnalyticsCorrection,
  RecurringAnalyticsPayment,
} from "@/modules/insights/recurring/insights-recurring";
import { getInsightsTrendsWithReaders } from "@/modules/insights/trends/get-insights-trends";
import { correctTransactionForActor } from "@/modules/ledger/correct-transaction";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { resolvePaceContextEnvelope } from "@/modules/pace-agents/context";
import type { PaceContextEnvelope, PaceSubAgentResult } from "@/modules/pace-agents/domain";
import { createAgentActionDomainServices, type PaceDomainServices } from "@/modules/pace-agents/domain-services";
import { invokePaceCapability } from "@/modules/pace-agents/gateway";
import { createPaceOrchestrator, type PaceSubAgentExecutor } from "@/modules/pace-agents/orchestrator";
import { paceSubAgentRegistry } from "@/modules/pace-agents/registry";
import { routePaceRequest } from "@/modules/pace-agents/routing";
import { createInMemoryPaceTraceSink } from "@/modules/pace-agents/trace";
import { paceAssistantBlockSchema } from "@/modules/pace-assistant/types/pace-assistant";
import {
  getFinancialReportWithReaders,
  type GetFinancialReportInput,
} from "@/modules/reports/application/get-financial-report";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryAgentActionRepository } from "../../support/in-memory-agent-action-repository";
import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_OTHER_EXPENSE_ID,
  SYSTEM_OTHER_INCOME_ID,
  SYSTEM_SALARY_ID,
  SYSTEM_TRANSPORT_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const outsider: AuthenticatedActor = { userId: "outsider-1", email: "outsider@pace.test", name: "Outsider" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";
const fixedNow = () => new Date("2026-10-05T09:00:00.000Z");
const october = { from: "2026-10-01", to: "2026-10-05" };

type ToolOutput = { status: string; data: Record<string, unknown>; error: { code: string; message: string } | null };
type Step = (outputs: Record<string, ToolOutput>) => { readonly call: readonly [string, unknown] } | { readonly text: string };
type Analytics = {
  scope: AgentInsightsScope;
  semantics: string;
  hasActivity: boolean;
  analytics: { kind: string; income: AgentMoney; spending: AgentMoney; net: AgentMoney };
  comparison: {
    kind: string;
    income: AgentMetric;
    spending: AgentMetric;
    net: AgentMetric;
    topChanges: { id: string; dimension: string; current: AgentMoney; previous: AgentMoney; delta: AgentMoney; percentage: string | null }[];
  };
  breakdown: { kind: string; total: AgentMoney; items: { id: string; name: string; spending: AgentMoney; shareBps: number }[] };
  insights: { kind: string; unavailable: boolean; items: { id: string; type: string; title: string; subject: string | null; description: string | null }[] };
  exclusions: { transferCount: number; pendingCount: number; otherCurrencyCount: number };
};
type CategoryResult = {
  resolved: boolean;
  reason?: string;
  candidates?: { id: string; name: string }[];
  scope: AgentInsightsScope;
  category: { id: string; name: string };
  analytics: { kind: string; spent: AgentMoney; transactionCount: number };
  comparison: { spent: AgentMetric };
  contributingTransactions: { totalCount: number; refundCount: number; items: { id: string; kind: string; signed: AgentMoney }[] };
};
type AccountResult = {
  resolved: boolean;
  basis: string;
  semantics: string;
  scope: AgentInsightsScope;
  analytics: {
    inflows: AgentMoney;
    outflows: AgentMoney;
    netMovement: AgentMoney;
    composition: { income: AgentMoney; refunds: AgentMoney; transfersIn: AgentMoney; expenses: AgentMoney; transfersOut: AgentMoney };
  };
  importantMovements: { transferCount: number; items: { movement: string }[] };
};
type Trends = {
  scope: AgentInsightsScope;
  trend: {
    kind: string;
    range: string;
    months: { month: string; income: AgentMoney; spending: AgentMoney; net: AgentMoney; transactionCount: number; isPartial: boolean }[];
    categories: { id: string; name: string; months: { month: string; spending: AgentMoney }[] }[];
  };
  comparison: { kind: string };
};
type Recurring = {
  scope: AgentInsightsScope;
  actual: { basis: string; recurringSpending: AgentMetric; totalSpending: AgentMoney; shareOfSpendingBps: number; paidCount: number };
  projected: { basis: string; expectedOutflow: AgentMoney; occurrenceCount: number; from: string; occurrences: { date: string; amount: AgentMoney }[] };
};
type Chart = { kind: string; hasData: boolean; scope: AgentInsightsScope; block: AgentChartBlock | null };

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

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

const xaf = (minorUnits: string): AgentMoney => ({ minorUnits, currency: "XAF" });
const dataOf = <T>(result: PaceSubAgentResult, tool: string) =>
  result.toolResults.find((toolResult) => toolResult.tool === tool)?.data as T;
const periodOf = (scope: AgentInsightsScope) => ({ from: scope.period.from, to: scope.period.to });

async function createFixture() {
  const actions = new InMemoryAgentActionRepository();
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const actionService = new AgentActionService(actions, ledger, ledgerRecords, workspaces);

  for (const id of [workspaceOne, workspaceTwo]) {
    const now = new Date("2026-08-01T00:00:00.000Z");
    const workspace: WorkspaceRecord = {
      id, name: id === workspaceOne ? "Home" : "Other", slug: id, type: "PERSONAL", createdByUserId: owner.userId, createdAt: now, updatedAt: now,
    };
    await workspaces.createWorkspaceWithOwner({
      workspace,
      preferences: { currency: "XAF", locale: "fr-CM", timezone: "Africa/Douala", weekStartsOn: 1 },
      owner: { workspaceId: id, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now },
      initialAccount: { id: `${id}-wallet`, workspaceId: id, name: "Wallet", type: "CASH", currency: "XAF", createdByUserId: owner.userId },
    });
  }
  workspaces.addMembership({
    workspaceId: workspaceOne, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: new Date(),
  });

  const mains = new Map<string, string>();
  for (const id of [workspaceOne, workspaceTwo]) {
    mains.set(id, (await ledger.createAccount(owner, id, { name: "Main Account", type: "CHECKING", currency: "XAF" })).id);
  }
  const main = mains.get(workspaceOne)!;
  const savings = await ledger.createAccount(owner, workspaceOne, { name: "Savings", type: "SAVINGS", currency: "XAF" });
  const euro = await ledger.createAccount(owner, workspaceOne, { name: "Euro Wallet", type: "CHECKING", currency: "EUR" });

  const post = (workspaceId: string, input: Record<string, unknown>) =>
    ledger.createTransaction(owner, workspaceId, { currency: "XAF", accountId: mains.get(workspaceId), ...input });
  const expense = (categoryId: string, amountMinor: string, day: string, note: string, workspaceId = workspaceOne) =>
    post(workspaceId, { kind: "EXPENSE", categoryId, amountMinor, occurredAt: `${day}T12:00:00.000Z`, note });
  const salary = (day: string) =>
    post(workspaceOne, { kind: "INCOME", categoryId: SYSTEM_SALARY_ID, amountMinor: "300000", occurredAt: `${day}T12:00:00.000Z`, note: "Salary" });

  await post(workspaceTwo, { kind: "INCOME", categoryId: SYSTEM_SALARY_ID, amountMinor: "50000", occurredAt: "2026-10-01T12:00:00.000Z" });
  await expense(SYSTEM_GROCERIES_ID, "7000", "2026-10-02", "Foreign groceries", workspaceTwo);

  await salary("2026-09-01");
  const rentSeptember = await expense(SYSTEM_OTHER_EXPENSE_ID, "100000", "2026-09-02", "Rent");
  await expense(SYSTEM_TRANSPORT_ID, "10000", "2026-09-02", "Taxi");
  await expense(SYSTEM_GROCERIES_ID, "40000", "2026-09-03", "Market");
  await expense(SYSTEM_GROCERIES_ID, "60000", "2026-09-20", "Supermarket");
  await salary("2026-10-01");
  const rentOctober = await expense(SYSTEM_OTHER_EXPENSE_ID, "100000", "2026-10-02", "Rent");
  await expense(SYSTEM_GROCERIES_ID, "30000", "2026-10-02", "Market");
  await post(workspaceOne, {
    kind: "TRANSFER", accountId: main, transferAccountId: savings.id, amountMinor: "100000", occurredAt: "2026-10-03T12:00:00.000Z",
  });
  const mistyped = await expense(SYSTEM_TRANSPORT_ID, "50000", "2026-10-03", "Taxi");
  const corrected = await correctTransactionForActor(owner, {
    workspaceId: workspaceOne,
    transactionId: mistyped.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: "13200" },
    idempotencyKey: randomUUID(),
    reason: "Incorrect amount",
  }, { ledger });
  assert.equal(corrected.ok, true);
  const dinner = await expense(SYSTEM_GROCERIES_ID, "20000", "2026-10-04", "Dinner supplies");
  await ledger.createRefund(owner, {
    workspaceId: workspaceOne,
    expenseTransactionId: dinner.id,
    accountId: main,
    amountMinor: 5_000n,
    currency: toCurrencyCode("XAF"),
    occurredAt: new Date("2026-10-04T15:00:00.000Z"),
    idempotencyKey: randomUUID(),
  });
  await post(workspaceOne, {
    kind: "INCOME", accountId: euro.id, currency: "EUR", categoryId: SYSTEM_OTHER_INCOME_ID, amountMinor: "50000", occurredAt: "2026-10-01T12:00:00.000Z",
  });
  await post(workspaceOne, {
    kind: "EXPENSE", accountId: euro.id, currency: "EUR", categoryId: SYSTEM_GROCERIES_ID, amountMinor: "900", occurredAt: "2026-10-04T12:00:00.000Z",
  });

  const rent: RecurringAnalyticsPayment = {
    id: "recurring-rent",
    displayName: "Rent",
    normalizedMerchant: "rent",
    direction: "EXPENSE",
    status: "CONFIRMED",
    lifecycle: "ACTIVE",
    currency: "XAF",
    amountToleranceBps: 0,
    cadenceDays: 30,
    typicalAmountMinor: 100_000n,
    lastOccurredAt: new Date("2026-10-02T12:00:00.000Z"),
    nextOccurrenceAt: new Date("2026-11-01T12:00:00.000Z"),
    sampleTransactionIds: [rentSeptember.id, rentOctober.id],
  };
  const spike: InsightCandidate = {
    type: "CATEGORY_SPIKE",
    severity: "WARNING",
    data: { categoryId: SYSTEM_TRANSPORT_ID, changeMinor: "3200", currency: "XAF" },
    period: { start: new Date("2026-09-30T23:00:00.000Z"), end: new Date("2026-10-31T23:00:00.000Z") },
    source: "MONEY_ENGINE",
    fingerprint: "transport-spike",
    expiresAt: null,
  };

  const reportRequests: GetFinancialReportInput[] = [];
  const readers = {
    findMembership: (workspaceId: string, userId: string) => workspaces.findMembership(workspaceId, userId),
    listTransactions: (workspaceId: string) => ledgerRecords.listTransactions(workspaceId),
    listCategories: (workspaceId: string) => ledgerRecords.listCategories(workspaceId),
    listMerchants: (workspaceId: string) => ledgerRecords.listMerchants(workspaceId),
    listAccounts: (workspaceId: string) => ledgerRecords.listAccounts(workspaceId),
    getAccountBalance: (workspaceId: string, accountId: string) => ledgerRecords.getAccountBalance(workspaceId, accountId),
    findOpeningBalance: (workspaceId: string, accountId: string) => ledgerRecords.findOpeningBalance(workspaceId, accountId),
    listCorrections: async (workspaceId: string): Promise<RecurringAnalyticsCorrection[]> =>
      [...ledgerRecords.transactionCorrections.values()].filter((correction) => correction.workspaceId === workspaceId),
    listRecurringPayments: async (workspaceId: string) => (workspaceId === workspaceOne ? [rent] : []),
    previewInsights: async (_actor: AuthenticatedActor, workspaceId: string) => (workspaceId === workspaceOne ? [spike] : []),
  };
  const reads: AgentInsightsReadDependencies = {
    workspaces,
    listCategories: readers.listCategories,
    listAccounts: readers.listAccounts,
    readOverview: (input) => getInsightsOverviewWithReaders(input, readers),
    readCategoryAnalysis: (input) => getCategoryAnalysisWithReaders(input, readers),
    readAccountAnalysis: (input) => getAccountAnalysisWithReaders(input, readers),
    readTrends: (input) => getInsightsTrendsWithReaders(input, readers),
    readRecurring: (input) => getInsightsRecurringWithReaders(input, readers),
    readReport: (input) => {
      reportRequests.push(input);
      return getFinancialReportWithReaders(input, readers);
    },
  };

  const unused = async () => {
    throw new Error("This domain service does not belong to the Insights sub-agent.");
  };
  const at = { now: fixedNow() };
  const services: PaceDomainServices = {
    ...createAgentActionDomainServices(actionService),
    getInsightsAnalytics: (scope, query, context) => getAgentInsightsAnalytics({ ...scope, ...context, ...at, query }, reads),
    getCategoryInsights: (scope, query, context) => getAgentCategoryInsights({ ...scope, ...context, ...at, query }, reads),
    getAccountInsights: (scope, query, context) => getAgentAccountInsights({ ...scope, ...context, ...at, query }, reads),
    getInsightsTrends: (scope, query, context) => getAgentInsightsTrends({ ...scope, ...context, ...at, query }, reads),
    getRecurringInsights: (scope, query, context) => getAgentRecurringInsights({ ...scope, ...context, ...at, query }, reads),
    createInsightChart: (scope, query, context) => createAgentInsightChart({ ...scope, ...context, ...at, query }, reads),
    generateFinancialReport: (scope, query, context) => generateAgentFinancialReport({ ...scope, ...context, ...at, query }, reads),
    getBudgets: async () => ({ budgets: [{ id: "budget-food", label: "Food", remaining: xaf("55000") }] }),
    getAccount: async (scope) => ({ resolved: true, account: { id: mains.get(scope.workspaceId), name: "Main Account" } }),
    getOverviewSummary: unused,
    getInsightContext: unused,
    getRecentTransactions: unused,
    getExpenses: unused,
    searchTransactions: unused,
    getTransactionDetail: unused,
    getAccounts: unused,
    getAccountMovements: unused,
    compareAccountMovements: unused,
    checkAccountSpendability: unused,
    getRecurringPayments: unused,
    getRecurringPayment: unused,
    getRecurringSpending: unused,
    getUpcomingRecurring: unused,
    getInboxItems: unused,
    getInboxItem: unused,
    getBudget: unused,
    getSavingsGoals: unused,
    getSavingsGoal: unused,
    getForecast: unused,
    getRules: unused,
    getRule: unused,
  };

  const trace = createInMemoryPaceTraceSink();
  const deps = { registry: paceSubAgentRegistry, services, trace, now: fixedNow };
  const envelopeFor = (actor: AuthenticatedActor, workspaceId: string, language = "en", sessionId = "session-1") =>
    resolvePaceContextEnvelope(workspaces, { actor, workspaceId, language, session: { runtime: "local", id: sessionId } });

  let turn = 0;
  const ask = async (
    request: string,
    steps: readonly Step[],
    options: { readonly envelope?: PaceContextEnvelope; readonly executors?: Record<string, PaceSubAgentExecutor> } = {},
  ) => {
    turn += 1;
    const model = scriptedModel(steps);
    const result = await createPaceOrchestrator({
      ...deps,
      executors: { insights: createInsightsAgent({ model, now: fixedNow }), ...options.executors },
    }).handle({ request, envelope: options.envelope ?? (await envelopeFor(owner, workspaceOne, "en", `session-${turn}`)) });
    const insights = result.results.find((entry) => entry.agentId === "insights");
    assert.ok(insights, `"${request}" reaches the Insights sub-agent`);
    return { result, insights, model };
  };

  let calls = 0;
  const invoke = async <T>(tool: string, input: unknown, envelope?: PaceContextEnvelope) => {
    calls += 1;
    const { result } = await invokePaceCapability(deps, {
      agentId: "insights", tool, input, envelope: envelope ?? (await envelopeFor(owner, workspaceOne)), callId: `direct-${calls}`,
    });
    return { result, data: result.data as T };
  };

  return { ask, deps, envelopeFor, euro, invoke, ledgerRecords, main, mistyped, reportRequests, savings, trace };
}

test("the InsightsAgent offers only read capabilities and carries the authority rules", async () => {
  const { ask } = await createFixture();
  const { model } = await ask("How much did I spend this month?", [() => ({ text: "Nothing to add." })]);

  const call = model.doGenerateCalls[0]!;
  assert.deepEqual(
    (call.tools ?? []).map((tool) => tool.name).sort(),
    insightsSubAgent.capabilities.map((capability) => capability.tool).sort(),
  );
  assert.deepEqual([...new Set(insightsSubAgent.capabilities.map((capability) => capability.access))], ["read"]);
  assert.equal(insightsSubAgent.capabilities.every((capability) => capability.approval === "none"), true);
  assert.equal(insightsSubAgent.capabilities.every((capability) => capability.requiredPermission === "read"), true);
  assert.equal(
    insightsSubAgent.capabilities.some((capability) => capability.domainServices.some((service) => /Draft|Approved|approve/.test(service))),
    false,
  );

  const system = JSON.stringify(call.prompt.filter((message) => message.role === "system"));
  assert.match(system, /Never add, subtract, average, annualize, convert/);
  assert.match(system, /If the member's assumption disagrees with a tool result, the tool result is right/);
  assert.match(system, /Never add a cause, motive, habit, or life event/);
  assert.match(system, /Never work out a date range yourself/);
  assert.match(system, /Present it with a chart block by copying block exactly as returned/);
  assert.match(system, /Download PNG/);
  assert.match(system, /Time zone: Africa\/Douala/);
  assert.match(system, /Today is 2026-10-05/);
  assert.deepEqual([...AGENT_INSIGHTS_RESULT_KINDS], [
    "analytics_result", "comparison_result", "trend_result", "breakdown_result", "deterministic_insight_result",
    "report_export_result", "chart_result",
  ]);
});

test("October spending, income, and net come from the canonical overview with no model arithmetic", async () => {
  const { ask } = await createFixture();
  const { result, insights } = await ask("How much did I spend in October?", [
    () => ({ call: ["get_financial_analytics", { month: 10 }] }),
    (outputs) => ({ text: `Spending: ${(outputs.get_financial_analytics!.data as unknown as Analytics).analytics.spending.minorUnits}` }),
  ]);

  assert.equal(insights.status, "completed");
  assert.deepEqual(result.rejected, []);
  assert.deepEqual(result.pendingApprovals, []);
  const data = dataOf<Analytics>(insights, "get_financial_analytics");
  assert.deepEqual(periodOf(data.scope), october);
  assert.equal(data.scope.period.key, "2026-10");
  assert.equal(data.scope.period.isPartial, true);
  assert.equal(data.scope.timeZone, "Africa/Douala");
  assert.equal(data.analytics.kind, "analytics_result");
  assert.deepEqual(data.analytics.income, xaf("300000"));
  assert.deepEqual(data.analytics.spending, xaf("158200"));
  assert.deepEqual(data.analytics.net, xaf("141800"));
  assert.equal(insights.summary, "Spending: 158200");
});

test("the comparison is like for like with the previous period and ranks category changes", async () => {
  const { invoke } = await createFixture();
  const { data } = await invoke<Analytics>("get_financial_analytics", { period: "THIS_MONTH" });

  assert.deepEqual(data.scope.comparedWith, { from: "2026-09-01", to: "2026-09-05", dayCount: 5, isPartial: true });
  assert.equal(data.comparison.kind, "comparison_result");
  assert.deepEqual(data.comparison.spending.previous, xaf("150000"));
  assert.deepEqual(data.comparison.spending.change, xaf("8200"));
  assert.equal(data.comparison.spending.direction, "up");
  assert.equal(data.comparison.income.direction, "neutral");

  const transport = data.comparison.topChanges.find((change) => change.id === SYSTEM_TRANSPORT_ID)!;
  assert.deepEqual(transport.current, xaf("13200"));
  assert.deepEqual(transport.previous, xaf("10000"));
  assert.deepEqual(transport.delta, xaf("3200"));
  assert.equal(transport.percentage, "32");

  assert.equal(data.breakdown.kind, "breakdown_result");
  assert.deepEqual(data.breakdown.total, xaf("158200"));
  assert.deepEqual(
    data.breakdown.items.map((item) => [item.id, item.spending.minorUnits]),
    [[SYSTEM_OTHER_EXPENSE_ID, "100000"], [SYSTEM_GROCERIES_ID, "45000"], [SYSTEM_TRANSPORT_ID, "13200"]],
  );

  const september = (await invoke<Analytics>("get_financial_analytics", { period: "LAST_MONTH" })).data;
  assert.deepEqual(periodOf(september.scope), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(september.analytics.spending, xaf("210000"));
});

test("a transfer is excluded from workspace spending and counted as an account outflow", async () => {
  const { invoke } = await createFixture();
  const workspace = (await invoke<Analytics>("get_financial_analytics", {})).data;
  assert.equal(workspace.exclusions.transferCount, 1);
  assert.deepEqual(workspace.analytics.spending, xaf("158200"));
  assert.match(workspace.semantics, /A transfer between accounts is neither income nor spending/);

  const account = (await invoke<AccountResult>("get_account_analysis", { accountName: "main account" })).data;
  assert.equal(account.resolved, true);
  assert.equal(account.basis, "ACCOUNT_MOVEMENTS");
  assert.match(account.semantics, /not workspace income or spending/);
  assert.deepEqual(account.analytics.composition.transfersOut, xaf("100000"));
  assert.deepEqual(account.analytics.composition.expenses, xaf("163200"));
  assert.deepEqual(account.analytics.composition.refunds, xaf("5000"));
  assert.deepEqual(account.analytics.outflows, xaf("263200"));
  assert.deepEqual(account.analytics.inflows, xaf("305000"));
  assert.deepEqual(account.analytics.netMovement, xaf("41800"));
  assert.equal(account.importantMovements.transferCount, 1);
  assert.equal(account.importantMovements.items.some((item) => item.movement === "TRANSFER_OUT"), true);

  const savings = (await invoke<AccountResult>("get_account_analysis", { accountName: "Savings" })).data;
  assert.deepEqual(savings.analytics.composition.transfersIn, xaf("100000"));
  assert.deepEqual(savings.analytics.inflows, xaf("100000"));
});

test("refunds reduce category spending and a corrected transaction counts once at its corrected value", async () => {
  const { invoke, mistyped } = await createFixture();
  const { candidates } = (await invoke<CategoryResult>("get_category_analysis", { categoryName: "no such category" })).data;
  const nameOf = (id: string) => candidates!.find((candidate) => candidate.id === id)!.name;

  const groceries = (await invoke<CategoryResult>("get_category_analysis", { categoryName: nameOf(SYSTEM_GROCERIES_ID) })).data;
  assert.equal(groceries.resolved, true);
  assert.equal(groceries.category.id, SYSTEM_GROCERIES_ID);
  assert.deepEqual(groceries.analytics.spent, xaf("45000"));
  assert.deepEqual(groceries.comparison.spent.previous, xaf("40000"));
  assert.equal(groceries.comparison.spent.direction, "up");
  assert.equal(groceries.contributingTransactions.refundCount, 1);
  assert.equal(groceries.contributingTransactions.items.some((item) => item.kind === "REFUND" && item.signed.minorUnits === "-5000"), true);

  const transport = (await invoke<CategoryResult>("get_category_analysis", { categoryId: SYSTEM_TRANSPORT_ID })).data;
  assert.deepEqual(transport.analytics.spent, xaf("13200"));
  assert.equal(transport.analytics.transactionCount, 1);
  assert.equal(transport.contributingTransactions.totalCount, 1);
  assert.equal(transport.contributingTransactions.items.some((item) => item.id === mistyped.id), false);
  assert.equal(JSON.stringify(transport).includes("50000"), false);
});

test("an unknown or foreign category or account returns candidates and asks instead of guessing", async () => {
  const { ask, invoke } = await createFixture();
  const { insights } = await ask("How much did I spend on Vacations?", [
    () => ({ call: ["get_category_analysis", { categoryName: "Vacations" }] }),
    () => ({ text: "Which category do you mean?" }),
  ]);
  assert.equal(insights.status, "needs_input");
  const unresolved = dataOf<CategoryResult>(insights, "get_category_analysis");
  assert.equal(unresolved.resolved, false);
  assert.equal(unresolved.reason, "NOT_FOUND");
  assert.equal(unresolved.candidates!.length > 0, true);

  const account = (await invoke<AccountResult & { reason: string }>("get_account_analysis", { accountId: randomUUID() })).data;
  assert.equal(account.resolved, false);
  assert.equal(account.reason, "NOT_FOUND");

  const both = await invoke("get_category_analysis", { categoryName: "Food", categoryId: SYSTEM_GROCERIES_ID });
  assert.equal(both.result.error?.code, "INVALID_INPUT");
});

test("3, 6, and 12 month trends come from the canonical trend service", async () => {
  const { invoke } = await createFixture();
  for (const [range, count] of [["3m", 3], ["6m", 6], ["12m", 12]] as const) {
    const { data } = await invoke<Trends>("get_financial_trends", { range });
    assert.equal(data.trend.kind, "trend_result");
    assert.equal(data.trend.range, range);
    assert.equal(data.scope.period.range, range);
    assert.equal(data.trend.months.length, count);
    assert.equal(data.scope.period.to, "2026-10-05");
    const last = data.trend.months.at(-1)!;
    assert.deepEqual([last.month, last.spending, last.income, last.isPartial], ["2026-10", xaf("158200"), xaf("300000"), true]);
    assert.deepEqual(data.trend.months.at(-2)!.spending, xaf("210000"));
  }

  const { data } = await invoke<Trends>("get_financial_trends", {});
  assert.equal(data.trend.range, "6m");
  const groceries = data.trend.categories.find((series) => series.id === SYSTEM_GROCERIES_ID)!;
  assert.deepEqual(
    groceries.months.slice(-2).map((point) => [point.month, point.spending.minorUnits]),
    [["2026-09", "100000"], ["2026-10", "45000"]],
  );
  assert.equal((await invoke("get_financial_trends", { range: "1m" })).result.error?.code, "INVALID_INPUT");
});

test("recurring analytics keep actual transactions and projections apart", async () => {
  const { invoke } = await createFixture();
  const { data } = await invoke<Recurring>("get_recurring_analytics", { horizon: "30d" });

  assert.equal(data.actual.basis, "ACTUAL_TRANSACTIONS");
  assert.deepEqual(data.actual.recurringSpending.current, xaf("100000"));
  assert.deepEqual(data.actual.totalSpending, xaf("158200"));
  assert.equal(data.actual.paidCount, 1);
  assert.equal(data.projected.basis, "PROJECTION");
  assert.deepEqual(data.projected.expectedOutflow, xaf("100000"));
  assert.equal(data.projected.occurrenceCount, 1);
  assert.equal(data.projected.occurrences[0]!.date > data.scope.period.to, true);
  assert.equal("total" in data || "combined" in data, false);
});

test("deterministic insights are passed through unchanged from the canonical engine", async () => {
  const { invoke } = await createFixture();
  const { data } = await invoke<Analytics>("get_financial_analytics", {});
  assert.equal(data.insights.kind, "deterministic_insight_result");
  assert.equal(data.insights.unavailable, false);
  assert.deepEqual(data.insights.items.map((item) => [item.id, item.type]), [["transport-spike", "CATEGORY_SPIKE"]]);
  assert.equal(data.insights.items[0]!.title, "Category spending increased");
  assert.match(data.insights.items[0]!.description ?? "", /3[,.\s  ]?200/);
});

test("periods resolve on the workspace calendar, not UTC or the browser", () => {
  const lateSeptemberUtc = new Date("2026-09-30T23:30:00.000Z");
  assert.deepEqual(resolveAgentInsightsPeriod({}, "Africa/Douala", lateSeptemberUtc), { periodKey: "2026-10", range: "1m" });
  assert.deepEqual(resolveAgentInsightsPeriod({}, "UTC", lateSeptemberUtc), { periodKey: "2026-09", range: "1m" });
  assert.deepEqual(resolveAgentInsightsPeriod({ period: "LAST_MONTH" }, "Africa/Douala", lateSeptemberUtc), { periodKey: "2026-09", range: "1m" });
  assert.deepEqual(resolveAgentInsightsPeriod({ period: "LAST_6_MONTHS" }, "Africa/Douala", fixedNow()), { periodKey: "2026-10", range: "6m" });
  assert.deepEqual(resolveAgentInsightsPeriod({ month: 9 }, "Africa/Douala", fixedNow()), { periodKey: "2026-09", range: "1m" });
  assert.deepEqual(resolveAgentInsightsPeriod({ month: 12 }, "Africa/Douala", fixedNow()), { periodKey: "2025-12", range: "1m" });
  assert.deepEqual(resolveAgentInsightsPeriod({ month: 3, year: 2025 }, "Africa/Douala", fixedNow()), { periodKey: "2025-03", range: "1m" });
  assert.throws(() => resolveAgentInsightsPeriod({ month: 11, year: 2026 }, "Africa/Douala", fixedNow()), ConflictError);
});

test("currencies are reported separately and never combined", async () => {
  const { invoke } = await createFixture();
  const xafResult = (await invoke<Analytics>("get_financial_analytics", {})).data;
  assert.equal(xafResult.scope.currency.code, "XAF");
  assert.deepEqual(xafResult.scope.currency.reportedSeparately.map((entry) => entry.code), ["EUR"]);
  assert.equal(xafResult.scope.currency.requestedButUnavailable, null);
  assert.equal(xafResult.exclusions.otherCurrencyCount > 0, true);
  assert.deepEqual(xafResult.analytics.spending, xaf("158200"));

  const eur = (await invoke<Analytics>("get_financial_analytics", { currency: "eur" })).data;
  assert.deepEqual(eur.analytics.spending, { minorUnits: "900", currency: "EUR" });
  assert.deepEqual(eur.analytics.income, { minorUnits: "50000", currency: "EUR" });
  assert.deepEqual(eur.scope.currency.reportedSeparately.map((entry) => entry.code), ["XAF"]);

  const usd = (await invoke<Analytics>("get_financial_analytics", { currency: "USD" })).data;
  assert.equal(usd.scope.currency.code, "XAF");
  assert.equal(usd.scope.currency.requestedButUnavailable, "USD");
});

test("an explicit report request reuses the report read model with the resolved period and language", async () => {
  const { ask, reportRequests } = await createFixture();
  const { result, insights } = await ask("Generate my October financial report in French.", [
    () => ({ call: ["generate_financial_report", { month: 10, language: "fr" }] }),
    () => ({ text: "Votre rapport est prêt." }),
  ]);

  assert.equal(result.status, "completed");
  assert.deepEqual(result.pendingApprovals, []);
  const report = dataOf<AgentReportExportResult>(insights, "generate_financial_report");
  assert.equal(report.kind, "report_export_result");
  assert.equal(report.language, "fr");
  assert.deepEqual(report.period, { key: "2026-10", from: "2026-10-01", to: "2026-10-05", isPartial: true });
  assert.equal(report.pageCount, 9);
  assert.equal(report.pages.length, 9);
  assert.equal(report.fileName, "pace-workspace-one-financial-report-2026-10.pdf");
  assert.equal(report.currency.code, "XAF");
  assert.deepEqual(report.currency.excludedCurrencies.map((entry) => entry.code), ["EUR"]);
  assert.deepEqual(report.exportRequest, {
    workspaceSlug: workspaceOne, period: "2026-10", currency: "XAF", language: "fr", sections: "transactions,accounts,recurring,insights",
  });
  assert.equal(/https?:|\/api\//.test(JSON.stringify(report)), false);
  assert.equal(paceAssistantBlockSchema.safeParse(report.block).success, true);

  assert.equal(reportRequests.length, 1);
  const request = reportRequests[0]!;
  assert.deepEqual(
    [request.periodKey, request.language, request.currency, request.timeZone, request.workspace.id, request.now.toISOString()],
    ["2026-10", "fr", "XAF", "Africa/Douala", workspaceOne, fixedNow().toISOString()],
  );
});

test("reports follow the requested language, the member's language by default, and the chosen sections", async () => {
  const { envelopeFor, invoke, reportRequests } = await createFixture();
  for (const language of ["en", "fr", "de"] as const) {
    const { data } = await invoke<AgentReportExportResult>("generate_financial_report", { period: "LAST_MONTH", language });
    assert.equal(data.language, language);
    assert.equal(data.block.language, language);
    assert.equal(data.currency.code, "XAF");
    assert.deepEqual(data.period, { key: "2026-09", from: "2026-09-01", to: "2026-09-30", isPartial: false });
  }
  assert.deepEqual(reportRequests.map((request) => request.language), ["en", "fr", "de"]);

  const german = await invoke<AgentReportExportResult>("generate_financial_report", {}, await envelopeFor(owner, workspaceOne, "de"));
  assert.equal(german.data.language, "de");
  assert.equal(german.data.period.key, "2026-10");

  const slim = (await invoke<AgentReportExportResult>("generate_financial_report", {
    includeTransactions: false, includeRecurring: false,
  })).data;
  assert.deepEqual(slim.sections, ["accounts", "insights"]);
  assert.equal(slim.pageCount, 7);
  assert.equal(slim.exportRequest.sections, "accounts,insights");
  assert.deepEqual(reportRequests.at(-1)!.sections, ["accounts", "insights"]);

  assert.equal((await invoke("generate_financial_report", { language: "es" })).result.error?.code, "INVALID_INPUT");
  assert.equal((await invoke("generate_financial_report", { month: 11, year: 2026 })).result.error?.code, "DOMAIN_REJECTED");
});

test("charts are built by the server from canonical data and fit Pace's chart component", async () => {
  const { ask, invoke } = await createFixture();
  const { insights } = await ask("Show me a chart of income vs spending", [
    () => ({ call: ["create_insight_chart", { chart: "INCOME_VS_SPENDING", range: "3m" }] }),
    () => ({ text: "Here is your chart." }),
  ]);
  const chart = dataOf<Chart>(insights, "create_insight_chart");
  assert.equal(chart.kind, "chart_result");
  assert.equal(chart.hasData, true);
  const block = chart.block!;
  assert.equal(paceAssistantBlockSchema.safeParse(block).success, true);
  assert.deepEqual([block.type, block.chartType, block.currency, block.title], ["chart", "bar", "XAF", "Income vs spending"]);
  assert.equal(block.categories.length, 3);
  assert.deepEqual(block.series.map((series) => [series.key, series.values.slice(-2)]), [
    ["income", ["300000", "300000"]],
    ["spending", ["210000", "158200"]],
  ]);
  assert.match(block.note ?? "", /still in progress/);

  const donut = (await invoke<Chart>("create_insight_chart", { chart: "SPENDING_BY_CATEGORY", period: "LAST_MONTH" })).data;
  assert.equal(donut.block!.chartType, "donut");
  assert.deepEqual(periodOf(donut.scope), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(donut.block!.series[0]!.values, ["100000", "100000", "10000"]);
  assert.equal(paceAssistantBlockSchema.safeParse(donut.block).success, true);

  for (const kind of ["SPENDING_TREND", "NET_CASH_FLOW", "CATEGORY_TRENDS", "RECURRING_VS_OTHER_SPENDING"]) {
    const { data } = await invoke<Chart>("create_insight_chart", { chart: kind });
    assert.equal(data.hasData, true, kind);
    assert.equal(paceAssistantBlockSchema.safeParse(data.block).success, true, kind);
  }
  const french = (await invoke<Chart>("create_insight_chart", { chart: "NET_CASH_FLOW" }, await (await createFixture()).envelopeFor(owner, workspaceOne, "fr"))).data;
  assert.equal(french.block!.title, "Flux de trésorerie net");
  assert.equal(french.block!.series[0]!.values.at(-1), "141800");

  const empty = (await invoke<Chart>("create_insight_chart", { chart: "INCOME_VS_SPENDING", currency: "USD" })).data;
  assert.equal(empty.scope.currency.requestedButUnavailable, "USD");
});

test("cross-domain questions are composed by the orchestrator from each owning sub-agent", async () => {
  const { ask } = await createFixture();
  const plans: PaceSubAgentExecutor = async (_task, toolbox) => {
    await toolbox.call("get_budgets", {});
    return { summary: "Food budget read." };
  };
  const accounts: PaceSubAgentExecutor = async (_task, toolbox) => {
    await toolbox.call("get_account", { accountName: "Main Account" });
  };

  const food = await ask(
    "How much is left in my Food budget and how much did I spend on Food this month?",
    [() => ({ call: ["get_financial_analytics", {}] }), () => ({ text: "Spending read." })],
    { executors: { plans } },
  );
  assert.equal(food.result.plan.composition, "multi");
  assert.deepEqual(food.result.rejected, []);
  const completed = food.result.results.filter((entry) => entry.status === "completed").map((entry) => entry.agentId);
  assert.deepEqual([...completed].sort(), ["insights", "plans"]);
  assert.deepEqual(
    food.result.toolsUsed.map((used) => `${used.agentId}.${used.tool}`).sort(),
    ["insights.get_financial_analytics", "plans.get_budgets"],
  );
  assert.equal(food.insights.toolResults.every((toolResult) => toolResult.agentId === "insights"), true);

  const balance = await ask(
    "Why did my Main Account balance fall even though my spending decreased?",
    [() => ({ call: ["get_financial_analytics", {}] }), () => ({ text: "Spending rose." })],
    { executors: { accounts } },
  );
  assert.deepEqual(
    balance.result.results.filter((entry) => entry.status === "completed").map((entry) => entry.agentId).sort(),
    ["accounts", "insights"],
  );
  assert.equal(dataOf<Analytics>(balance.insights, "get_financial_analytics").comparison.spending.direction, "up");
});

test("a write request goes to its owner and the InsightsAgent cannot reach a write", async () => {
  const { invoke } = await createFixture();
  const plan = routePaceRequest(paceSubAgentRegistry, "Reduce my Food budget to 100,000");
  assert.equal(plan.routes[0]?.agentId, "plans");
  assert.equal(plan.routes.some((route) => route.agentId === "insights"), false);

  for (const tool of ["create_budget_draft", "submit_plan_draft", "create_transaction_draft"]) {
    const { result } = await invoke(tool, {});
    assert.equal(result.status, "refused");
    assert.equal(result.error?.code, "CAPABILITY_NOT_OWNED");
  }
});

test("the example requests route to the Insights sub-agent", () => {
  const examples = [
    "How much did I spend this month?",
    "Compare October with September",
    "Show my spending trend for six months.",
    "Generate my October financial report.",
    "Export my financial report in French.",
    "Erstelle meinen Finanzbericht für September.",
    "Génère mon rapport financier",
    "Show me a chart of my spending",
  ];
  for (const request of examples) {
    const plan = routePaceRequest(paceSubAgentRegistry, request);
    assert.equal(plan.routes.some((route) => route.agentId === "insights"), true, request);
  }
});

test("reads stay inside the member's workspace and respect membership", async () => {
  const { envelopeFor, invoke } = await createFixture();
  const other = (await invoke<Analytics>("get_financial_analytics", {}, await envelopeFor(owner, workspaceTwo))).data;
  assert.deepEqual(other.analytics.spending, xaf("7000"));
  assert.deepEqual(other.analytics.income, xaf("50000"));
  assert.deepEqual(other.insights.items, []);

  const foreignAccount = (await invoke<AccountResult & { reason: string }>(
    "get_account_analysis", { accountId: randomUUID() }, await envelopeFor(owner, workspaceTwo),
  )).data;
  assert.equal(foreignAccount.resolved, false);

  const asViewer = await invoke<Analytics>("get_financial_analytics", {}, await envelopeFor(viewer, workspaceOne));
  assert.equal(asViewer.result.status, "ok");
  assert.deepEqual(asViewer.data.analytics.spending, xaf("158200"));

  await assert.rejects(envelopeFor(outsider, workspaceOne));
  const forged = { ...(await envelopeFor(owner, workspaceOne)), actor: outsider };
  for (const [tool, input] of [
    ["get_financial_analytics", {}],
    ["get_financial_trends", {}],
    ["create_insight_chart", { chart: "SPENDING_TREND" }],
    ["generate_financial_report", {}],
  ] as const) {
    const { result } = await invoke(tool, input, forged);
    assert.equal(result.status, "refused", tool);
    assert.equal(result.error?.code, "PERMISSION_DENIED", tool);
    assert.equal(result.data, null);
  }
});

test("the trace records the routed agent, service, period, and currency scope without amounts", async () => {
  const { ask, trace } = await createFixture();
  await ask("Generate my October report and how much did I spend?", [
    () => ({ call: ["get_financial_analytics", { month: 10 }] }),
    () => ({ call: ["generate_financial_report", { month: 10, language: "de" }] }),
    () => ({ text: "Done." }),
  ]);

  const routed = trace.events.find((event) => event.type === "route.planned");
  assert.equal(routed?.type === "route.planned" && routed.routes.some((route) => route.agentId === "insights"), true);

  const tools = trace.events.filter((event) => event.type === "tool.completed");
  assert.deepEqual(tools.map((event) => [event.agentId, event.tool, event.status]), [
    ["insights", "get_financial_analytics", "ok"],
    ["insights", "generate_financial_report", "ok"],
  ]);
  assert.deepEqual(tools[0]!.scope, {
    services: ["getInsightsAnalytics"], period: october, currencies: ["XAF"], report: null,
  });
  assert.deepEqual(tools[1]!.scope, {
    services: ["generateFinancialReport"], period: october, currencies: ["XAF"], report: { language: "de", pageCount: 9 },
  });
  for (const event of trace.events) {
    assert.equal(/158200|300000|141800|minorUnits/.test(JSON.stringify(event)), false);
    assert.equal(event.workspaceId, workspaceOne);
  }
  assert.equal(trace.events.some((event) => event.type === "subagent.completed" && event.agentId === "insights" && event.status === "completed"), true);
});
