import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { resolveAccountReference } from "@/modules/accounts/domain/account-reference";
import { localizeCategoryName } from "@/modules/ledger/category-localization";
import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
} from "@/modules/ledger/domain";
import { reportLocale } from "@/modules/reports/application/build-financial-report";
import type { GetFinancialReportInput } from "@/modules/reports/application/get-financial-report";
import {
  REPORT_OPTIONAL_SECTIONS,
  parseReportLanguage,
  type FinancialReportDTO,
} from "@/modules/reports/domain/financial-report.types";
import type { WorkspaceMemberContext } from "@/modules/workspaces/domain";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { GetAccountAnalysisInput } from "../account/get-account-analysis";
import type { AccountAnalysis } from "../account/account-analysis.types";
import {
  agentInsightsScope,
  agentMetric,
  agentMoney,
  resolveAgentInsightsPeriod,
  withMoney,
  type AgentAccountInsightsQuery,
  type AgentCategoryInsightsQuery,
  type AgentChartBlock,
  type AgentInsightChartQuery,
  type AgentInsightsAnalyticsQuery,
  type AgentInsightsContext,
  type AgentRecurringInsightsQuery,
  type AgentReportExportResult,
  type AgentReportQuery,
  type AgentTrendsQuery,
} from "../agent-insights-view";
import type { GetCategoryAnalysisInput } from "../category/get-category-analysis";
import type { CategoryAnalysis } from "../category/category-analysis.types";
import type {
  GetInsightsOverviewInput,
  InsightsOverviewResult,
} from "../overview/get-insights-overview";
import type { GetInsightsRecurringInput } from "../recurring/get-insights-recurring";
import { DEFAULT_RECURRING_HORIZON, type InsightsRecurring } from "../recurring/insights-recurring.types";
import type { GetInsightsTrendsInput } from "../trends/get-insights-trends";
import type { InsightsTrends } from "../trends/insights-trends.types";

export type AgentInsightsReadDependencies = {
  readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">;
  readonly listCategories: (
    workspaceId: string,
  ) => Promise<LedgerCategoryRecord[]>;
  readonly listAccounts: (
    workspaceId: string,
  ) => Promise<LedgerAccountRecord[]>;
  readonly readOverview: (
    input: GetInsightsOverviewInput,
  ) => Promise<InsightsOverviewResult>;
  readonly readCategoryAnalysis: (
    input: GetCategoryAnalysisInput,
  ) => Promise<CategoryAnalysis | null>;
  readonly readAccountAnalysis: (
    input: GetAccountAnalysisInput,
  ) => Promise<AccountAnalysis | null>;
  readonly readTrends: (
    input: GetInsightsTrendsInput,
  ) => Promise<InsightsTrends>;
  readonly readRecurring: (
    input: GetInsightsRecurringInput,
  ) => Promise<InsightsRecurring>;
  readonly readReport: (
    input: GetFinancialReportInput,
  ) => Promise<FinancialReportDTO>;
};

type ReadScope = AgentInsightsContext & {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly now?: Date;
};

const WORKSPACE_SEMANTICS =
  "Workspace income and spending are computed by the server from effective posted Transactions in one currency. A transfer between accounts is neither income nor spending. A refund reduces spending. A corrected transaction counts once at its corrected value, and technical reversal entries are never listed or counted. Amounts in other currencies are reported separately and never converted or added.";
const ACCOUNT_SEMANTICS =
  "These are movements of one account in that account's currency, not workspace income or spending. A transfer in is an account inflow and a transfer out is an account outflow, but a transfer is never workspace income or spending.";
const TREND_SEMANTICS =
  "Each month is computed by the server from effective posted Transactions in one currency. Transfers are excluded and refunds reduce spending. Changes compare the whole range with the range of the same length before it. A partial month is still in progress.";
const RECURRING_SEMANTICS =
  "actual holds only real effective Transactions linked to confirmed recurring items. projected holds expected occurrences from each item's cadence: nothing projected has been paid, none affects a balance, and none is spending or income. The two are never added together.";
const REPORT_SEMANTICS =
  "The report data was built by the server for this period, language, and currency. The PDF file is produced by Pace's report renderer from exportRequest when the member downloads it; there is no file URL. The report covers one currency and lists any others as excluded.";

export async function getAgentInsightsAnalytics(
  input: ReadScope & { readonly query: AgentInsightsAnalyticsQuery },
  dependencies: AgentInsightsReadDependencies,
) {
  const member = await requireReader(input, dependencies);
  const now = input.now ?? new Date();
  const {
    currency: workspaceCurrency,
    locale,
    timezone: timeZone,
  } = member.preferences;
  const requestedCurrency = input.query.currency ?? null;
  const { overview, insights } = await dependencies.readOverview({
    actor: input.actor,
    workspaceId: input.workspaceId,
    workspaceSlug: member.workspace.slug,
    workspaceCurrency,
    locale,
    timeZone,
    labels: getDashboardLabels(input.language),
    ...resolveAgentInsightsPeriod(input.query, timeZone, now),
    requestedCurrency,
    now,
  });
  const { currency, kpis } = overview;

  return {
    basis: "ACTUAL_TRANSACTIONS" as const,
    semantics: WORKSPACE_SEMANTICS,
    scope: agentInsightsScope(overview, timeZone, requestedCurrency),
    hasActivity: overview.hasActivity,
    analytics: {
      kind: "analytics_result" as const,
      income: agentMoney(kpis.income.minor, currency),
      spending: agentMoney(kpis.spending.minor, currency),
      net: agentMoney(kpis.net.minor, currency),
      dailyAverageSpending: agentMoney(kpis.dailyAverage.minor, currency),
    },
    comparison: {
      kind: "comparison_result" as const,
      comparedWith: "PREVIOUS_PERIOD" as const,
      income: agentMetric(kpis.income, currency),
      spending: agentMetric(kpis.spending, currency),
      net: agentMetric(kpis.net, currency),
      dailyAverageSpending: agentMetric(kpis.dailyAverage, currency),
      topChanges: overview.topChanges.map((change) =>
        withMoney(change, currency),
      ),
    },
    breakdown: {
      kind: "breakdown_result" as const,
      dimension: "category" as const,
      total: agentMoney(overview.categories.totalMinor, currency),
      items: overview.categories.items.map((item) => withMoney(item, currency)),
      other: overview.categories.other
        ? withMoney(overview.categories.other, currency)
        : null,
    },
    monthly: overview.incomeVsSpending.map((month) => ({
      month: month.month,
      income: agentMoney(month.incomeMinor, currency),
      spending: agentMoney(month.spendingMinor, currency),
      isPartial: month.isPartial,
    })),
    insights: {
      kind: "deterministic_insight_result" as const,
      month: insights.month,
      unavailable: insights.unavailable,
      items: insights.items.map(
        ({ id, type, tone, title, subject, description }) => ({
          id,
          type,
          tone,
          title,
          subject,
          description,
        }),
      ),
    },
    exclusions: overview.exclusions,
  };
}

export async function getAgentCategoryInsights(
  input: ReadScope & { readonly query: AgentCategoryInsightsQuery },
  dependencies: AgentInsightsReadDependencies,
) {
  const member = await requireReader(input, dependencies);
  const now = input.now ?? new Date();
  const labels = getDashboardLabels(input.language);
  const {
    currency: workspaceCurrency,
    locale,
    timezone: timeZone,
  } = member.preferences;

  const records = await dependencies.listCategories(input.workspaceId);
  const names = new Map(
    records.map((record) => [record.id, localizeCategoryName(labels, record)]),
  );
  const candidates = records
    .filter((record) => record.kind === "EXPENSE")
    .map((record) => ({
      id: record.id,
      name: names.get(record.id)!,
      parentName: record.parentCategoryId
        ? (names.get(record.parentCategoryId) ?? null)
        : null,
    }));
  const located = resolveAccountReference(
    {
      accountId: input.query.categoryId,
      accountName: input.query.categoryName,
    },
    candidates,
  );
  if (located.status !== "RESOLVED") {
    return {
      resolved: false as const,
      reason: located.status,
      candidates: located.candidates,
    };
  }

  const requestedCurrency = input.query.currency ?? null;
  const analysis = await dependencies.readCategoryAnalysis({
    actor: input.actor,
    workspaceId: input.workspaceId,
    categoryId: located.account.id,
    workspaceCurrency,
    locale,
    timeZone,
    labels,
    ...resolveAgentInsightsPeriod(input.query, timeZone, now),
    requestedCurrency,
    now,
  });
  if (!analysis)
    return {
      resolved: false as const,
      reason: "NOT_FOUND" as const,
      candidates,
    };
  const { currency, kpis } = analysis;

  return {
    resolved: true as const,
    basis: "ACTUAL_TRANSACTIONS" as const,
    semantics: WORKSPACE_SEMANTICS,
    scope: agentInsightsScope(analysis, timeZone, requestedCurrency),
    category: analysis.category,
    hasActivity: analysis.hasActivity,
    analytics: {
      kind: "analytics_result" as const,
      spent: agentMoney(kpis.spent.minor, currency),
      transactionCount: kpis.transactionCount.current,
      averageTransaction: agentMoney(kpis.averageTransaction.minor, currency),
      shareOfWorkspaceSpendingBps: analysis.shareOfSpendingBps,
    },
    comparison: {
      kind: "comparison_result" as const,
      comparedWith: "PREVIOUS_PERIOD" as const,
      spent: agentMetric(kpis.spent, currency),
      transactionCount: kpis.transactionCount,
      averageTransaction: agentMetric(kpis.averageTransaction, currency),
    },
    breakdown: {
      kind: "breakdown_result" as const,
      subcategories:
        analysis.subcategories?.map((row) => withMoney(row, currency)) ?? null,
      merchants: {
        items: analysis.merchants.items.map((row) => withMoney(row, currency)),
        other: analysis.merchants.other
          ? withMoney(analysis.merchants.other, currency)
          : null,
      },
    },
    contributingTransactions: {
      totalCount: analysis.transactions.totalCount,
      refundCount: analysis.transactions.refundCount,
      listedCount: analysis.transactions.items.length,
      items: analysis.transactions.items.map((item) =>
        withMoney(item, currency),
      ),
    },
    insights: {
      kind: "deterministic_insight_result" as const,
      items: analysis.insights.map((insight) => withMoney(insight, currency)),
    },
    exclusions: analysis.exclusions,
  };
}

export async function getAgentAccountInsights(
  input: ReadScope & { readonly query: AgentAccountInsightsQuery },
  dependencies: AgentInsightsReadDependencies,
) {
  const member = await requireReader(input, dependencies);
  const now = input.now ?? new Date();
  const {
    currency: workspaceCurrency,
    locale,
    timezone: timeZone,
  } = member.preferences;

  const accounts = (await dependencies.listAccounts(input.workspaceId))
    .filter((account) => account.workspaceId === input.workspaceId)
    .map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      status: account.archivedAt ? ("ARCHIVED" as const) : ("ACTIVE" as const),
    }));
  const located = resolveAccountReference(input.query, accounts);
  if (located.status !== "RESOLVED") {
    return {
      resolved: false as const,
      reason: located.status,
      candidates: located.candidates,
    };
  }

  const analysis = await dependencies.readAccountAnalysis({
    actor: input.actor,
    workspaceId: input.workspaceId,
    accountId: located.account.id,
    workspaceCurrency,
    locale,
    timeZone,
    labels: getDashboardLabels(input.language),
    ...resolveAgentInsightsPeriod(input.query, timeZone, now),
    now,
  });
  if (!analysis)
    return {
      resolved: false as const,
      reason: "NOT_FOUND" as const,
      candidates: accounts,
    };
  const { currency, kpis, balances } = analysis;

  return {
    resolved: true as const,
    basis: "ACCOUNT_MOVEMENTS" as const,
    semantics: ACCOUNT_SEMANTICS,
    scope: agentInsightsScope(analysis, timeZone, null),
    account: analysis.account,
    hasActivity: analysis.hasActivity,
    balanceEvolution: {
      periodOpening: agentMoney(balances.periodOpeningMinor, currency),
      periodClosing: agentMoney(balances.periodClosingMinor, currency),
      current: agentMoney(balances.currentMinor, currency),
      available:
        balances.availableMinor === null
          ? null
          : agentMoney(balances.availableMinor, currency),
    },
    analytics: {
      kind: "analytics_result" as const,
      inflows: agentMoney(kpis.inflows.minor, currency),
      outflows: agentMoney(kpis.outflows.minor, currency),
      netMovement: agentMoney(kpis.net.minor, currency),
      transactionCount: kpis.transactionCount.current,
      composition: withMoney(analysis.composition, currency),
    },
    comparison: {
      kind: "comparison_result" as const,
      comparedWith: "PREVIOUS_PERIOD" as const,
      inflows: agentMetric(kpis.inflows, currency),
      outflows: agentMetric(kpis.outflows, currency),
      netMovement: agentMetric(kpis.net, currency),
      transactionCount: kpis.transactionCount,
    },
    breakdown: {
      kind: "breakdown_result" as const,
      spendingCategories: {
        total: agentMoney(analysis.categories.totalMinor, currency),
        items: analysis.categories.items.map((item) =>
          withMoney(item, currency),
        ),
        other: analysis.categories.other
          ? withMoney(analysis.categories.other, currency)
          : null,
      },
      counterparties: analysis.counterparties.map((item) =>
        withMoney(item, currency),
      ),
    },
    importantMovements: {
      totalCount: analysis.transactions.totalCount,
      transferCount: analysis.transactions.transferCount,
      listedCount: analysis.transactions.items.length,
      items: analysis.transactions.items.map((item) =>
        withMoney(item, currency),
      ),
    },
    insights: {
      kind: "deterministic_insight_result" as const,
      items: analysis.insights.map((insight) => withMoney(insight, currency)),
    },
    exclusions: analysis.exclusions,
  };
}

export async function getAgentInsightsTrends(
  input: ReadScope & { readonly query: AgentTrendsQuery },
  dependencies: AgentInsightsReadDependencies,
) {
  const member = await requireReader(input, dependencies);
  const now = input.now ?? new Date();
  const {
    currency: workspaceCurrency,
    locale,
    timezone: timeZone,
  } = member.preferences;
  const requestedCurrency = input.query.currency ?? null;
  const trends = await dependencies.readTrends({
    actor: input.actor,
    workspaceId: input.workspaceId,
    workspaceCurrency,
    locale,
    timeZone,
    labels: getDashboardLabels(input.language),
    range: input.query.range,
    periodKey: resolveAgentInsightsPeriod({}, timeZone, now).periodKey,
    requestedCurrency,
    now,
  });
  const { currency, totals } = trends;

  return {
    basis: "ACTUAL_TRANSACTIONS" as const,
    semantics: TREND_SEMANTICS,
    scope: agentInsightsScope(trends, timeZone, requestedCurrency),
    hasActivity: trends.hasActivity,
    trend: {
      kind: "trend_result" as const,
      range: trends.range,
      months: trends.months
        .filter((month) => !month.isFuture)
        .map((month) => ({
          month: month.month,
          income: agentMoney(month.incomeMinor, currency),
          spending: agentMoney(month.spendingMinor, currency),
          net: agentMoney(month.netMinor, currency),
          recurringSpending: agentMoney(month.recurringMinor, currency),
          transactionCount: month.transactionCount,
          isPartial: month.isPartial,
        })),
      categories: trends.categories.items.map((series) => ({
        id: series.id,
        name: series.name,
        isUncategorized: series.isUncategorized,
        total: agentMoney(series.totalMinor, currency),
        shareBps: series.shareBps,
        change: agentMetric(series.change, currency),
        months: series.points.map((point) => ({
          month: point.month,
          spending: agentMoney(point.spendingMinor, currency),
        })),
      })),
      otherCategoryCount: trends.categories.otherCount,
      recurring: trends.recurring,
    },
    comparison: {
      kind: "comparison_result" as const,
      comparedWith: "PREVIOUS_RANGE" as const,
      income: agentMetric(totals.income, currency),
      spending: agentMetric(totals.spending, currency),
      net: agentMetric(totals.net, currency),
      recurringSpending: agentMetric(totals.recurring, currency),
      categoryIncreases: trends.increases.map((change) =>
        withMoney(change, currency),
      ),
      categoryDecreases: trends.decreases.map((change) =>
        withMoney(change, currency),
      ),
    },
    insights: {
      kind: "deterministic_insight_result" as const,
      items: trends.signals.map((signal) => withMoney(signal, currency)),
    },
    exclusions: trends.exclusions,
  };
}

export async function getAgentRecurringInsights(
  input: ReadScope & { readonly query: AgentRecurringInsightsQuery },
  dependencies: AgentInsightsReadDependencies,
) {
  const member = await requireReader(input, dependencies);
  const now = input.now ?? new Date();
  const {
    currency: workspaceCurrency,
    locale,
    timezone: timeZone,
  } = member.preferences;
  const requestedCurrency = input.query.currency ?? null;
  const recurring = await dependencies.readRecurring({
    actor: input.actor,
    workspaceId: input.workspaceId,
    workspaceCurrency,
    locale,
    timeZone,
    ...resolveAgentInsightsPeriod(input.query, timeZone, now),
    horizon: input.query.horizon,
    requestedCurrency,
    now,
  });
  const { currency, actual, upcoming } = recurring;

  return {
    semantics: RECURRING_SEMANTICS,
    scope: agentInsightsScope(recurring, timeZone, requestedCurrency),
    hasRecurring: recurring.hasRecurring,
    counts: recurring.counts,
    actual: {
      kind: "analytics_result" as const,
      basis: "ACTUAL_TRANSACTIONS" as const,
      recurringSpending: agentMetric(actual.spending, currency),
      recurringIncome: agentMetric(actual.income, currency),
      totalSpending: agentMoney(actual.totalSpendingMinor, currency),
      shareOfSpendingBps: actual.shareBps,
      previousShareOfSpendingBps: actual.previousShareBps,
      paidCount: actual.paidCount,
      months: recurring.months
        .filter((month) => !month.isFuture)
        .map((month) => withMoney(month, currency)),
      topOutflows: recurring.topItems.outflows.map((item) =>
        withMoney(item, currency),
      ),
      topInflows: recurring.topItems.inflows.map((item) =>
        withMoney(item, currency),
      ),
      priceChanges: recurring.priceChanges.map((change) =>
        withMoney(change, currency),
      ),
    },
    projected: {
      kind: "analytics_result" as const,
      basis: "PROJECTION" as const,
      horizon: upcoming.horizon,
      from: upcoming.firstDate,
      to: upcoming.lastDate,
      expectedOutflow: agentMoney(upcoming.outflowMinor, currency),
      expectedInflow: agentMoney(upcoming.inflowMinor, currency),
      occurrenceCount: upcoming.occurrenceCount,
      commitmentCount: upcoming.commitmentCount,
      hasVariableAmounts: upcoming.hasVariableAmounts,
      occurrences: upcoming.items.map((item) => withMoney(item, currency)),
      unlistedOccurrenceCount: upcoming.remainingCount,
    },
    insights: {
      kind: "deterministic_insight_result" as const,
      items: recurring.signals.map((signal) => withMoney(signal, currency)),
    },
    exclusions: recurring.exclusions,
  };
}

export async function generateAgentFinancialReport(
  input: ReadScope & { readonly query: AgentReportQuery },
  dependencies: AgentInsightsReadDependencies,
): Promise<AgentReportExportResult> {
  const member = await requireReader(input, dependencies);
  const now = input.now ?? new Date();
  const { query } = input;
  const {
    currency: workspaceCurrency,
    locale,
    timezone: timeZone,
  } = member.preferences;
  const included = {
    transactions: query.includeTransactions,
    accounts: query.includeAccounts,
    recurring: query.includeRecurring,
    insights: query.includeInsights,
  };
  const sections = REPORT_OPTIONAL_SECTIONS.filter(
    (section) => included[section],
  );
  const requestedCurrency = query.currency ?? workspaceCurrency;

  const report = await dependencies.readReport({
    actor: input.actor,
    workspace: {
      id: member.workspace.id,
      name: member.workspace.name,
      slug: member.workspace.slug,
    },
    workspaceCurrency,
    workspaceLocale: locale,
    timeZone,
    now,
    language: query.language ?? parseReportLanguage(input.language),
    periodKey: resolveAgentInsightsPeriod(query, timeZone, now).periodKey,
    currency: requestedCurrency,
    sections,
  });

  return {
    kind: "report_export_result",
    status: "READY",
    format: "pdf",
    fileName: report.meta.fileName,
    language: report.meta.language,
    locale: report.meta.locale,
    timeZone: report.meta.timeZone,
    generatedAt: report.meta.generatedAt,
    period: {
      key: report.period.key,
      from: report.period.firstDate,
      to: report.period.lastDate,
      isPartial: report.period.isPartial,
    },
    currency: {
      code: report.currency.code,
      workspaceCurrency: report.currency.workspaceCurrency,
      requestedButUnavailable:
        requestedCurrency !== report.currency.code ? requestedCurrency : null,
      excludedCurrencies: report.currency.excludedCurrencies,
    },
    sections,
    pages: report.meta.pages,
    pageCount: report.meta.pages.length,
    hasActivity: report.hasActivity,
    exportRequest: {
      workspaceSlug: report.workspace.slug,
      period: report.period.key,
      currency: report.currency.code,
      language: report.meta.language,
      sections: sections.join(","),
    },
    block: {
      type: "report-export",
      workspaceSlug: report.workspace.slug,
      period: report.period.key,
      periodFrom: report.period.firstDate,
      periodTo: report.period.lastDate,
      currency: report.currency.code,
      language: report.meta.language,
      sections: sections.join(","),
      fileName: report.meta.fileName,
      pageCount: report.meta.pages.length,
    },
    semantics: REPORT_SEMANTICS,
  };
}

const CHART_SEMANTICS =
  "block is a finished chart built by the server from the same effective posted Transactions as the Insights read models, in one currency. Transfers are excluded and refunds reduce spending. Copy block into the answer unchanged; never add, remove, or alter a series, label, or value.";

const CHART_TEXT = {
  en: {
    INCOME_VS_SPENDING: "Income vs spending",
    SPENDING_TREND: "Spending trend",
    NET_CASH_FLOW: "Net cash flow",
    SPENDING_BY_CATEGORY: "Spending by category",
    CATEGORY_TRENDS: "Category trends",
    RECURRING_VS_OTHER_SPENDING: "Recurring vs other spending",
    income: "Income",
    spending: "Spending",
    net: "Net",
    recurring: "Recurring",
    other: "Other",
    partial: "{month} is still in progress.",
  },
  fr: {
    INCOME_VS_SPENDING: "Revenus et dépenses",
    SPENDING_TREND: "Évolution des dépenses",
    NET_CASH_FLOW: "Flux de trésorerie net",
    SPENDING_BY_CATEGORY: "Dépenses par catégorie",
    CATEGORY_TRENDS: "Évolution par catégorie",
    RECURRING_VS_OTHER_SPENDING: "Dépenses récurrentes et autres",
    income: "Revenus",
    spending: "Dépenses",
    net: "Net",
    recurring: "Récurrent",
    other: "Autres",
    partial: "{month} est encore en cours.",
  },
  de: {
    INCOME_VS_SPENDING: "Einnahmen und Ausgaben",
    SPENDING_TREND: "Ausgabenverlauf",
    NET_CASH_FLOW: "Netto-Cashflow",
    SPENDING_BY_CATEGORY: "Ausgaben nach Kategorie",
    CATEGORY_TRENDS: "Kategorieverlauf",
    RECURRING_VS_OTHER_SPENDING: "Wiederkehrende und sonstige Ausgaben",
    income: "Einnahmen",
    spending: "Ausgaben",
    net: "Netto",
    recurring: "Wiederkehrend",
    other: "Sonstige",
    partial: "{month} läuft noch.",
  },
} as const;

const CHART_CATEGORY_SERIES_LIMIT = 5;

export async function createAgentInsightChart(
  input: ReadScope & { readonly query: AgentInsightChartQuery },
  dependencies: AgentInsightsReadDependencies,
) {
  const member = await requireReader(input, dependencies);
  const now = input.now ?? new Date();
  const { query } = input;
  const { currency: workspaceCurrency, locale, timezone: timeZone } = member.preferences;
  const language = parseReportLanguage(input.language);
  const text = CHART_TEXT[language];
  const labels = getDashboardLabels(input.language);
  const requestedCurrency = query.currency ?? null;
  const monthLabel = (month: string) =>
    new Intl.DateTimeFormat(reportLocale(language, locale), {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${month}-01T12:00:00Z`));
  const result = (
    model: Parameters<typeof agentInsightsScope>[0],
    hasData: boolean,
    block: Omit<AgentChartBlock, "type" | "title" | "currency">,
    partialMonth: string | null = null,
  ) => ({
    kind: "chart_result" as const,
    chart: query.chart,
    basis: "ACTUAL_TRANSACTIONS" as const,
    semantics: CHART_SEMANTICS,
    scope: agentInsightsScope(model, timeZone, requestedCurrency),
    hasData,
    block: hasData
      ? ({
          type: "chart",
          title: text[query.chart],
          currency: model.currency,
          ...block,
          ...(partialMonth ? { note: text.partial.replace("{month}", monthLabel(partialMonth)) } : {}),
        } satisfies AgentChartBlock)
      : null,
  });

  if (query.chart === "SPENDING_BY_CATEGORY") {
    const { overview } = await dependencies.readOverview({
      actor: input.actor,
      workspaceId: input.workspaceId,
      workspaceSlug: member.workspace.slug,
      workspaceCurrency,
      locale,
      timeZone,
      labels,
      ...resolveAgentInsightsPeriod(query, timeZone, now),
      requestedCurrency,
      now,
    });
    const { items, other } = overview.categories;
    return result(overview, items.length > 0, {
      chartType: "donut",
      categories: [...items.map((item) => item.name), ...(other ? [text.other] : [])],
      series: [
        {
          key: "spending",
          label: text.spending,
          values: [...items.map((item) => item.spendingMinor), ...(other ? [other.spendingMinor] : [])],
        },
      ],
    });
  }

  if (query.chart === "RECURRING_VS_OTHER_SPENDING") {
    const recurring = await dependencies.readRecurring({
      actor: input.actor,
      workspaceId: input.workspaceId,
      workspaceCurrency,
      locale,
      timeZone,
      range: query.range,
      horizon: DEFAULT_RECURRING_HORIZON,
      periodKey: resolveAgentInsightsPeriod({}, timeZone, now).periodKey,
      requestedCurrency,
      now,
    });
    const months = recurring.months.filter((month) => !month.isFuture);
    return result(
      recurring,
      months.some((month) => month.totalSpendingMinor !== "0"),
      {
        chartType: "stacked-bar",
        categories: months.map((month) => monthLabel(month.month)),
        series: [
          { key: "recurring", label: text.recurring, values: months.map((month) => month.recurringSpendingMinor) },
          { key: "other", label: text.other, values: months.map((month) => month.otherSpendingMinor) },
        ],
      },
      months.find((month) => month.isPartial)?.month ?? null,
    );
  }

  const trends = await dependencies.readTrends({
    actor: input.actor,
    workspaceId: input.workspaceId,
    workspaceCurrency,
    locale,
    timeZone,
    labels,
    range: query.range,
    periodKey: resolveAgentInsightsPeriod({}, timeZone, now).periodKey,
    requestedCurrency,
    now,
  });
  const months = trends.months.filter((month) => !month.isFuture);
  const categories = months.map((month) => monthLabel(month.month));
  const partialMonth = months.find((month) => month.isPartial)?.month ?? null;
  const visible = new Set(months.map((month) => month.month));

  switch (query.chart) {
    case "INCOME_VS_SPENDING":
      return result(
        trends,
        trends.hasActivity,
        {
          chartType: "bar",
          categories,
          series: [
            { key: "income", label: text.income, values: months.map((month) => month.incomeMinor) },
            { key: "spending", label: text.spending, values: months.map((month) => month.spendingMinor) },
          ],
        },
        partialMonth,
      );
    case "SPENDING_TREND":
      return result(
        trends,
        trends.hasActivity,
        {
          chartType: "line",
          categories,
          series: [{ key: "spending", label: text.spending, values: months.map((month) => month.spendingMinor) }],
        },
        partialMonth,
      );
    case "NET_CASH_FLOW":
      return result(
        trends,
        trends.hasActivity,
        {
          chartType: "bar",
          categories,
          series: [{ key: "net", label: text.net, values: months.map((month) => month.netMinor) }],
        },
        partialMonth,
      );
    case "CATEGORY_TRENDS": {
      const series = trends.categories.items.slice(0, CHART_CATEGORY_SERIES_LIMIT).map((item) => ({
        key: item.id,
        label: item.name,
        values: item.points.filter((point) => visible.has(point.month)).map((point) => point.spendingMinor),
      }));
      return result(trends, series.length > 0, { chartType: "line", categories, series }, partialMonth);
    }
  }
}

async function requireReader(
  input: ReadScope,
  dependencies: AgentInsightsReadDependencies,
): Promise<WorkspaceMemberContext> {
  const member = await dependencies.workspaces.findMemberContext(
    input.workspaceId,
    input.actor.userId,
  );
  if (!member)
    throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(member.membership.role, "read");
  return member;
}
