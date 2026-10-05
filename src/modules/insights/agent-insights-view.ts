import { ConflictError } from "@/authorization/errors";
import { overviewPeriodKey } from "@/modules/overview/domain/overview-financial-summary";
import type {
  ReportLanguage,
  ReportOptionalSection,
  ReportPageKind,
} from "@/modules/reports/domain/financial-report.types";
import { calendarMonthPeriod, localDateForInstant } from "@/money/period";

import type {
  InsightsCurrencyOption,
  InsightsMetric,
  InsightsRange,
  InsightsWindow,
} from "./overview/insights-overview.types";
import type { RecurringHorizon } from "./recurring/insights-recurring.types";
import type { TrendsRange } from "./trends/insights-trends.types";

export const AGENT_INSIGHTS_PERIODS = [
  "THIS_MONTH",
  "LAST_MONTH",
  "LAST_3_MONTHS",
  "LAST_6_MONTHS",
  "LAST_12_MONTHS",
] as const;
export type AgentInsightsPeriod = (typeof AGENT_INSIGHTS_PERIODS)[number];

export const AGENT_REPORT_PERIODS = ["THIS_MONTH", "LAST_MONTH"] as const;
export type AgentReportPeriod = (typeof AGENT_REPORT_PERIODS)[number];

export const AGENT_INSIGHTS_RESULT_KINDS = [
  "analytics_result",
  "comparison_result",
  "trend_result",
  "breakdown_result",
  "deterministic_insight_result",
  "report_export_result",
  "chart_result",
] as const;
export type AgentInsightsResultKind =
  (typeof AGENT_INSIGHTS_RESULT_KINDS)[number];

export interface AgentInsightsPeriodQuery {
  readonly period?: AgentInsightsPeriod;
  readonly month?: number;
  readonly year?: number;
}

export interface AgentInsightsAnalyticsQuery extends AgentInsightsPeriodQuery {
  readonly currency?: string;
}

export interface AgentCategoryInsightsQuery extends AgentInsightsPeriodQuery {
  readonly categoryId?: string;
  readonly categoryName?: string;
  readonly currency?: string;
}

export interface AgentAccountInsightsQuery extends AgentInsightsPeriodQuery {
  readonly accountId?: string;
  readonly accountName?: string;
}

export interface AgentTrendsQuery {
  readonly range: TrendsRange;
  readonly currency?: string;
}

export interface AgentRecurringInsightsQuery extends AgentInsightsPeriodQuery {
  readonly horizon: RecurringHorizon;
  readonly currency?: string;
}

export interface AgentReportQuery {
  readonly period?: AgentReportPeriod;
  readonly month?: number;
  readonly year?: number;
  readonly language?: ReportLanguage;
  readonly currency?: string;
  readonly includeTransactions: boolean;
  readonly includeAccounts: boolean;
  readonly includeRecurring: boolean;
  readonly includeInsights: boolean;
}

export const AGENT_INSIGHT_CHARTS = [
  "INCOME_VS_SPENDING",
  "SPENDING_TREND",
  "NET_CASH_FLOW",
  "SPENDING_BY_CATEGORY",
  "CATEGORY_TRENDS",
  "RECURRING_VS_OTHER_SPENDING",
] as const;
export type AgentInsightChart = (typeof AGENT_INSIGHT_CHARTS)[number];

export interface AgentInsightChartQuery extends AgentInsightsPeriodQuery {
  readonly chart: AgentInsightChart;
  readonly range: TrendsRange;
  readonly currency?: string;
}

export const AGENT_CHART_TYPES = ["bar", "stacked-bar", "line", "donut"] as const;
export type AgentChartType = (typeof AGENT_CHART_TYPES)[number];

export interface AgentChartBlock {
  readonly type: "chart";
  readonly chartType: AgentChartType;
  readonly title: string;
  readonly currency: string;
  readonly categories: readonly string[];
  readonly series: readonly {
    readonly key: string;
    readonly label: string;
    readonly values: readonly string[];
  }[];
  readonly note?: string;
}

export interface AgentReportExportBlock {
  readonly type: "report-export";
  readonly workspaceSlug: string;
  readonly period: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly currency: string;
  readonly language: ReportLanguage;
  readonly sections: string;
  readonly fileName: string;
  readonly pageCount: number;
}

export interface AgentInsightsContext {
  readonly language: string | null;
}

export interface AgentMoney {
  readonly minorUnits: string;
  readonly currency: string;
}

export interface AgentMetric {
  readonly current: AgentMoney;
  readonly previous: AgentMoney;
  readonly change: AgentMoney;
  readonly direction: InsightsMetric["direction"];
  readonly sentiment: InsightsMetric["sentiment"];
  readonly percentage: string | null;
}

/** Every `…Minor` string of a canonical read model becomes a currency-tagged amount; nothing else changes. */
export type WithMoney<T> = {
  [K in keyof T as K extends `${infer Name}Minor`
    ? Name
    : K]: K extends `${string}Minor`
    ? null extends T[K]
      ? AgentMoney | null
      : AgentMoney
    : T[K];
};

export interface AgentInsightsScope {
  readonly period: {
    readonly key: string;
    readonly range: InsightsRange;
    readonly from: string;
    readonly to: string;
    readonly dayCount: number;
    readonly isPartial: boolean;
  };
  readonly comparedWith: {
    readonly from: string;
    readonly to: string;
    readonly dayCount: number;
    readonly isPartial: boolean;
  };
  readonly timeZone: string;
  readonly currency: {
    readonly code: string;
    readonly workspaceCurrency: string;
    readonly requestedButUnavailable: string | null;
    readonly reportedSeparately: readonly {
      readonly code: string;
      readonly transactionCount: number;
    }[];
  };
}

export interface AgentReportExportResult {
  readonly kind: "report_export_result";
  readonly status: "READY";
  readonly format: "pdf";
  readonly fileName: string;
  readonly language: ReportLanguage;
  readonly locale: string;
  readonly timeZone: string;
  readonly generatedAt: string;
  readonly period: {
    readonly key: string;
    readonly from: string;
    readonly to: string;
    readonly isPartial: boolean;
  };
  readonly currency: {
    readonly code: string;
    readonly workspaceCurrency: string;
    readonly requestedButUnavailable: string | null;
    readonly excludedCurrencies: readonly {
      readonly code: string;
      readonly transactionCount: number;
    }[];
  };
  readonly sections: readonly ReportOptionalSection[];
  readonly pages: readonly ReportPageKind[];
  readonly pageCount: number;
  readonly hasActivity: boolean;
  readonly exportRequest: {
    readonly workspaceSlug: string;
    readonly period: string;
    readonly currency: string;
    readonly language: ReportLanguage;
    readonly sections: string;
  };
  readonly block: AgentReportExportBlock;
  readonly semantics: string;
}

export function agentMoney(minorUnits: string, currency: string): AgentMoney {
  return { minorUnits, currency };
}

export function agentMetric(
  metric: InsightsMetric,
  currency: string,
): AgentMetric {
  return {
    current: agentMoney(metric.minor, currency),
    previous: agentMoney(metric.previousMinor, currency),
    change: agentMoney(metric.deltaMinor, currency),
    direction: metric.direction,
    sentiment: metric.sentiment,
    percentage: metric.percentage,
  };
}

export function withMoney<T extends object>(
  item: T,
  currency: string,
): WithMoney<T> {
  return Object.fromEntries(
    Object.entries(item).map(([key, value]) =>
      key.endsWith("Minor")
        ? [
            key.slice(0, -"Minor".length),
            typeof value === "string" ? agentMoney(value, currency) : null,
          ]
        : [key, value],
    ),
  ) as WithMoney<T>;
}

export function agentInsightsScope(
  model: {
    readonly currency: string;
    readonly workspaceCurrency: string;
    readonly range: InsightsRange;
    readonly periodKey: string;
    readonly current: InsightsWindow;
    readonly previous: InsightsWindow;
    readonly currencies?: readonly InsightsCurrencyOption[];
  },
  timeZone: string,
  requestedCurrency: string | null,
): AgentInsightsScope {
  return {
    period: {
      key: model.periodKey,
      range: model.range,
      from: model.current.firstDate,
      to: model.current.lastDate,
      dayCount: model.current.dayCount,
      isPartial: model.current.isPartial,
    },
    comparedWith: {
      from: model.previous.firstDate,
      to: model.previous.lastDate,
      dayCount: model.previous.dayCount,
      isPartial: model.previous.isPartial,
    },
    timeZone,
    currency: {
      code: model.currency,
      workspaceCurrency: model.workspaceCurrency,
      requestedButUnavailable:
        requestedCurrency && requestedCurrency !== model.currency
          ? requestedCurrency
          : null,
      reportedSeparately: (model.currencies ?? [])
        .filter((option) => option.code !== model.currency)
        .map((option) => ({
          code: option.code,
          transactionCount: option.transactionCount,
        })),
    },
  };
}

/**
 * Turns the member's period words into the month anchor and range the canonical
 * Insights read models take. Only the anchor is chosen here, from the workspace
 * calendar; every date boundary is still computed by those read models.
 */
export function resolveAgentInsightsPeriod(
  query: AgentInsightsPeriodQuery,
  timeZone: string,
  now: Date,
): { readonly periodKey: string; readonly range: InsightsRange } {
  const monthKey = (offset: number) =>
    overviewPeriodKey(calendarMonthPeriod(now, timeZone, offset), timeZone);

  if (query.month !== undefined) {
    const today = localDateForInstant(now, timeZone);
    const year =
      query.year ?? (query.month <= today.month ? today.year : today.year - 1);
    if (
      year > today.year ||
      (year === today.year && query.month > today.month)
    ) {
      throw new ConflictError(
        "That month has not started yet in the workspace time zone.",
      );
    }
    return {
      periodKey: `${year.toString().padStart(4, "0")}-${query.month.toString().padStart(2, "0")}`,
      range: "1m",
    };
  }

  switch (query.period ?? "THIS_MONTH") {
    case "THIS_MONTH":
      return { periodKey: monthKey(0), range: "1m" };
    case "LAST_MONTH":
      return { periodKey: monthKey(-1), range: "1m" };
    case "LAST_3_MONTHS":
      return { periodKey: monthKey(0), range: "3m" };
    case "LAST_6_MONTHS":
      return { periodKey: monthKey(0), range: "6m" };
    case "LAST_12_MONTHS":
      return { periodKey: monthKey(0), range: "12m" };
  }
}
