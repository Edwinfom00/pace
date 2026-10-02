import type { InsightsAccountSummary } from "../account/account-analysis.types";
import type {
  InsightsCurrencyOption,
  InsightsExclusions,
  InsightsMetric,
  InsightsWindow,
} from "../overview/insights-overview.types";

export const TRENDS_RANGES = ["3m", "6m", "12m"] as const;
export type TrendsRange = (typeof TRENDS_RANGES)[number];
export const DEFAULT_TRENDS_RANGE: TrendsRange = "6m";

export function parseTrendsRange(
  value: string | string[] | undefined,
): TrendsRange {
  const candidate = Array.isArray(value) ? value[0] : value;
  return TRENDS_RANGES.includes(candidate as TrendsRange)
    ? (candidate as TrendsRange)
    : DEFAULT_TRENDS_RANGE;
}

export interface TrendsMonth {
  readonly month: string;
  readonly incomeMinor: string;
  readonly spendingMinor: string;
  readonly netMinor: string;
  readonly recurringMinor: string;
  readonly transactionCount: number;
  readonly isPartial: boolean;
  readonly isFuture: boolean;
}

export interface TrendsCategoryPoint {
  readonly month: string;
  readonly spendingMinor: string;
  readonly peakShareBps: number;
}

export interface TrendsCategorySeries {
  readonly id: string;
  readonly name: string;
  readonly isUncategorized: boolean;
  readonly totalMinor: string;
  readonly shareBps: number;
  readonly change: InsightsMetric;
  readonly points: readonly TrendsCategoryPoint[];
}

export interface TrendsChange {
  readonly id: string;
  readonly name: string;
  readonly isUncategorized: boolean;
  readonly currentMinor: string;
  readonly previousMinor: string;
  readonly deltaMinor: string;
  readonly percentage: string | null;
}

export type TrendsSignal =
  | {
      readonly kind: "spendingSpike";
      readonly month: string;
      readonly spendingMinor: string;
      readonly baselineMinor: string;
      readonly percentage: string;
    }
  | {
      readonly kind: "categoryRising";
      readonly id: string;
      readonly name: string;
      readonly isUncategorized: boolean;
      readonly monthCount: number;
      readonly fromMinor: string;
      readonly toMinor: string;
    }
  | {
      readonly kind: "netNegativeStreak";
      readonly monthCount: number;
      readonly lastMonth: string;
      readonly totalMinor: string;
    }
  | {
      readonly kind: "recurringIncrease";
      readonly deltaMinor: string;
      readonly percentage: string;
    };

export interface InsightsTrends {
  readonly currency: string;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly range: TrendsRange;
  readonly periodKey: string;
  readonly current: InsightsWindow;
  readonly previous: InsightsWindow;
  readonly hasActivity: boolean;
  readonly totals: {
    readonly income: InsightsMetric;
    readonly spending: InsightsMetric;
    readonly net: InsightsMetric;
    readonly recurring: InsightsMetric;
  };
  readonly months: readonly TrendsMonth[];
  readonly categories: {
    readonly items: readonly TrendsCategorySeries[];
    readonly otherCount: number;
  };
  readonly increases: readonly TrendsChange[];
  readonly decreases: readonly TrendsChange[];
  readonly recurring: {
    readonly paymentCount: number;
    readonly shareBps: number;
  };
  readonly signals: readonly TrendsSignal[];
  readonly accounts: readonly InsightsAccountSummary[];
  readonly currencies: readonly InsightsCurrencyOption[];
  readonly exclusions: InsightsExclusions;
}
