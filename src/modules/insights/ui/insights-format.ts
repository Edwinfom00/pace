import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import {
  formatOverviewMoney,
  minorToChartValue,
} from "@/modules/overview/domain/overview-formatters";

import type {
  InsightsMetric,
  InsightsMonthBar,
  InsightsTrendPoint,
  InsightsWindow,
} from "../overview/insights-overview.types";

export { formatOverviewMoney as formatInsightsMoney };

export function formatInsightsWindow(
  window: Pick<InsightsWindow, "firstDate" | "lastDate">,
  locale: string,
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const first = new Date(`${window.firstDate}T12:00:00Z`);
  const last = new Date(`${window.lastDate}T12:00:00Z`);
  return window.firstDate === window.lastDate
    ? formatter.format(first)
    : formatter.formatRange(first, last);
}

export function formatInsightsMonth(
  month: string,
  locale: string,
  style: "short" | "long" = "short",
): string {
  return new Intl.DateTimeFormat(locale, {
    month: style,
    ...(style === "long" ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
}

export function formatInsightsShare(shareBps: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: shareBps > 0 && shareBps < 100 ? 1 : 0,
  }).format(shareBps / 10_000);
}

export function formatInsightsComparison(
  metric: InsightsMetric,
  labels: DashboardLabels,
): { readonly text: string; readonly arrow: string } {
  if (metric.direction === "neutral")
    return { text: labels["insights.kpi.unchanged"], arrow: "→" };
  if (metric.percentage === null)
    return { text: labels["insights.kpi.noComparison"], arrow: "" };
  return {
    text: `${metric.percentage}%`,
    arrow: metric.direction === "up" ? "↑" : "↓",
  };
}

export function formatComparisonPeriod(
  previous: Pick<InsightsWindow, "firstDate" | "lastDate" | "isPartial">,
  labels: DashboardLabels,
  locale: string,
): string {
  const period = formatInsightsWindow(previous, locale);
  return formatDashboardLabel(
    labels,
    previous.isPartial
      ? "insights.comparison.dayForDay"
      : "insights.comparison.versus",
    { period },
  );
}

export interface IncomeSpendingChartDatum {
  readonly month: string;
  readonly label: string;
  readonly income: number;
  readonly spending: number;
  readonly incomeMinor: string;
  readonly spendingMinor: string;
  readonly isPartial: boolean;
  readonly isSelected: boolean;
}

export function incomeSpendingChartData(
  bars: readonly InsightsMonthBar[],
  currency: string,
  locale: string,
): IncomeSpendingChartDatum[] {
  return bars.map((bar) => ({
    month: bar.month,
    label: formatInsightsMonth(bar.month, locale).replace(".", ""),
    income: minorToChartValue(bar.incomeMinor, currency),
    spending: minorToChartValue(bar.spendingMinor, currency),
    incomeMinor: bar.incomeMinor,
    spendingMinor: bar.spendingMinor,
    isPartial: bar.isPartial,
    isSelected: bar.isSelected,
  }));
}

export function hasIncomeOrSpending(
  bars: readonly InsightsMonthBar[],
): boolean {
  return bars.some(
    (bar) => bar.incomeMinor !== "0" || bar.spendingMinor !== "0",
  );
}

export interface TrendChartDatum extends InsightsTrendPoint {
  readonly current: number | null;
  readonly previous: number | null;
}

export function trendChartData(
  points: readonly InsightsTrendPoint[],
  currency: string,
): TrendChartDatum[] {
  return points.map((point) => ({
    ...point,
    current:
      point.currentMinor === null
        ? null
        : minorToChartValue(point.currentMinor, currency),
    previous:
      point.previousMinor === null
        ? null
        : minorToChartValue(point.previousMinor, currency),
  }));
}

export function visibleTrendTickIndexes(
  count: number,
  mobile: boolean,
): ReadonlySet<number> {
  if (count <= 0) return new Set();
  const segments = mobile ? 3 : 6;
  const step = Math.max(1, Math.round((count - 1) / segments));
  const indexes = new Set<number>([0, count - 1]);
  for (let index = step; index < count - 1; index += step) {
    if (count - 1 - index >= step / 2) indexes.add(index);
  }
  return indexes;
}

export function categoryBarWidth(shareBps: number): string {
  return `${Math.max(shareBps > 0 ? 2 : 0, Math.min(100, shareBps / 100))}%`;
}
