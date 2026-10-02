import type { InsightType } from "@/money/insights";

export const INSIGHTS_RANGES = ["1m", "3m", "6m", "12m"] as const;
export type InsightsRange = (typeof INSIGHTS_RANGES)[number];

export const INSIGHTS_RANGE_MONTHS: Readonly<Record<InsightsRange, number>> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "12m": 12,
};

export function parseInsightsRange(
  value: string | string[] | undefined,
): InsightsRange {
  const candidate = Array.isArray(value) ? value[0] : value;
  return INSIGHTS_RANGES.includes(candidate as InsightsRange)
    ? (candidate as InsightsRange)
    : "1m";
}

export function parseInsightsCurrency(
  value: string | string[] | undefined,
): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[A-Z]{3}$/.test(candidate) ? candidate : null;
}

export type InsightsTrendDirection = "up" | "down" | "neutral";
export type InsightsTrendSentiment = "positive" | "negative" | "neutral";

export interface InsightsWindow {
  readonly start: string;
  readonly endExclusive: string;
  readonly firstDate: string;
  readonly lastDate: string;
  readonly dayCount: number;
  readonly isPartial: boolean;
}

export interface InsightsMetric {
  readonly minor: string;
  readonly previousMinor: string;
  readonly deltaMinor: string;
  readonly direction: InsightsTrendDirection;
  readonly sentiment: InsightsTrendSentiment;
  readonly percentage: string | null;
}

export interface InsightsMonthBar {
  readonly month: string;
  readonly incomeMinor: string;
  readonly spendingMinor: string;
  readonly isPartial: boolean;
  readonly isSelected: boolean;
}

export interface InsightsTrendPoint {
  readonly day: number;
  readonly currentDate: string | null;
  readonly previousDate: string | null;
  readonly currentMinor: string | null;
  readonly previousMinor: string | null;
}

export interface InsightsCategorySlice {
  readonly id: string;
  readonly name: string;
  readonly spendingMinor: string;
  readonly previousSpendingMinor: string;
  readonly shareBps: number;
  readonly transactionCount: number;
  readonly isUncategorized: boolean;
}

export interface InsightsCategoryBreakdown {
  readonly totalMinor: string;
  readonly items: readonly InsightsCategorySlice[];
  readonly other: {
    readonly spendingMinor: string;
    readonly shareBps: number;
    readonly categoryCount: number;
  } | null;
}

export interface InsightsChange {
  readonly dimension: "category" | "merchant";
  readonly id: string;
  readonly name: string;
  readonly currentMinor: string;
  readonly previousMinor: string;
  readonly deltaMinor: string;
  readonly direction: "up" | "down";
  readonly percentage: string | null;
}

export interface InsightsCurrencyOption {
  readonly code: string;
  readonly isWorkspaceCurrency: boolean;
  readonly transactionCount: number;
}

export interface InsightsExclusions {
  readonly transferCount: number;
  readonly pendingCount: number;
  readonly otherCurrencyCount: number;
}

export interface InsightsOverview {
  readonly currency: string;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly range: InsightsRange;
  readonly periodKey: string;
  readonly current: InsightsWindow;
  readonly previous: InsightsWindow;
  readonly hasActivity: boolean;
  readonly kpis: {
    readonly spending: InsightsMetric;
    readonly income: InsightsMetric;
    readonly net: InsightsMetric;
    readonly dailyAverage: InsightsMetric;
  };
  readonly incomeVsSpending: readonly InsightsMonthBar[];
  readonly spendingTrend: {
    readonly hasSpending: boolean;
    readonly points: readonly InsightsTrendPoint[];
  };
  readonly categories: InsightsCategoryBreakdown;
  readonly topChanges: readonly InsightsChange[];
  readonly currencies: readonly InsightsCurrencyOption[];
  readonly exclusions: InsightsExclusions;
}

export type InsightsInsightTone = "positive" | "neutral" | "attention";

export interface InsightsDeterministicItem {
  readonly id: string;
  readonly type: InsightType;
  readonly tone: InsightsInsightTone;
  readonly title: string;
  readonly subject: string | null;
  readonly description: string | null;
  readonly href: string | null;
}

export interface InsightsDeterministicInsights {
  readonly month: string;
  readonly items: readonly InsightsDeterministicItem[];
  readonly unavailable: boolean;
}
