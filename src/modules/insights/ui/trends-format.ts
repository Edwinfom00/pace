import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { minorToChartValue } from "@/modules/overview/domain/overview-formatters";

import { INSIGHTS_RANGE_MONTHS } from "../overview/insights-overview.types";
import type {
  InsightsTrends,
  TrendsMonth,
  TrendsSignal,
} from "../trends/insights-trends.types";
import { formatInsightsMoney, formatInsightsMonth } from "./insights-format";
import {
  insightsCategoryHref,
  type InsightsQueryState,
} from "./insights-links";

export function trendsQueryState(trends: InsightsTrends): InsightsQueryState {
  return {
    periodKey: trends.periodKey,
    range: trends.range,
    currency: trends.currency,
    workspaceCurrency: trends.workspaceCurrency,
  };
}

export interface CashFlowChartDatum extends TrendsMonth {
  readonly label: string;
  readonly income: number | null;
  readonly spending: number | null;
  readonly net: number | null;
  readonly recurring: number | null;
}

export function cashFlowChartData(
  months: readonly TrendsMonth[],
  currency: string,
  locale: string,
): CashFlowChartDatum[] {
  const value = (month: TrendsMonth, minor: string) =>
    month.isFuture ? null : minorToChartValue(minor, currency);
  return months.map((month) => ({
    ...month,
    label: formatInsightsMonth(month.month, locale).replace(".", ""),
    income: value(month, month.incomeMinor),
    spending: value(month, month.spendingMinor),
    net: value(month, month.netMinor),
    recurring: value(month, month.recurringMinor),
  }));
}

export function hasCashFlow(months: readonly TrendsMonth[]): boolean {
  return months.some(
    (month) => month.incomeMinor !== "0" || month.spendingMinor !== "0",
  );
}

export function hasRecurringSpending(months: readonly TrendsMonth[]): boolean {
  return months.some((month) => month.recurringMinor !== "0");
}

export function cashFlowSummary(
  trends: InsightsTrends,
  labels: DashboardLabels,
): string {
  const money = (minor: string) =>
    formatInsightsMoney(minor, trends.currency, trends.locale);
  return formatDashboardLabel(labels, "insights.trends.cashFlow.summary", {
    months: INSIGHTS_RANGE_MONTHS[trends.range],
    income: money(trends.totals.income.minor),
    spending: money(trends.totals.spending.minor),
    net: money(trends.totals.net.minor),
  });
}

export function sparkBarHeight(peakShareBps: number): string {
  return `${Math.max(peakShareBps > 0 ? 8 : 0, Math.min(100, peakShareBps / 100))}%`;
}

export interface TrendsSignalCopy {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly href: string | null;
}

export function trendsSignalCopy(
  signal: TrendsSignal,
  trends: InsightsTrends,
  labels: DashboardLabels,
  workspaceSlug: string,
): TrendsSignalCopy {
  const money = (minor: string) =>
    formatInsightsMoney(minor, trends.currency, trends.locale);
  const month = (value: string) =>
    formatInsightsMonth(value, trends.locale, "long");
  switch (signal.kind) {
    case "spendingSpike":
      return {
        id: `${signal.kind}:${signal.month}`,
        title: labels["insights.trends.signals.spendingSpike.title"],
        body: formatDashboardLabel(
          labels,
          "insights.trends.signals.spendingSpike.body",
          {
            month: month(signal.month),
            amount: money(signal.spendingMinor),
            percent: signal.percentage,
            baseline: money(signal.baselineMinor),
          },
        ),
        href: null,
      };
    case "categoryRising":
      return {
        id: `${signal.kind}:${signal.id}`,
        title: labels["insights.trends.signals.categoryRising.title"],
        body: formatDashboardLabel(
          labels,
          "insights.trends.signals.categoryRising.body",
          {
            name: signal.name,
            count: signal.monthCount,
            from: money(signal.fromMinor),
            to: money(signal.toMinor),
          },
        ),
        href: signal.isUncategorized
          ? null
          : insightsCategoryHref(
              workspaceSlug,
              signal.id,
              trendsQueryState(trends),
            ),
      };
    case "netNegativeStreak":
      return {
        id: `${signal.kind}:${signal.lastMonth}`,
        title: labels["insights.trends.signals.netNegativeStreak.title"],
        body: formatDashboardLabel(
          labels,
          "insights.trends.signals.netNegativeStreak.body",
          {
            count: signal.monthCount,
            month: month(signal.lastMonth),
            amount: money(signal.totalMinor.replace("-", "")),
          },
        ),
        href: null,
      };
    case "recurringIncrease":
      return {
        id: signal.kind,
        title: labels["insights.trends.signals.recurringIncrease.title"],
        body: formatDashboardLabel(
          labels,
          "insights.trends.signals.recurringIncrease.body",
          { amount: money(signal.deltaMinor), percent: signal.percentage },
        ),
        href: `/w/${workspaceSlug}/recurring`,
      };
  }
}
