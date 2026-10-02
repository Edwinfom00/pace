import type { RecurringPaymentStatus } from "@/modules/financial-inbox/domain";

import type {
  InsightsCurrencyOption,
  InsightsExclusions,
  InsightsMetric,
  InsightsRange,
  InsightsWindow,
} from "../overview/insights-overview.types";

export const RECURRING_HORIZONS = ["30d", "60d", "90d"] as const;
export type RecurringHorizon = (typeof RECURRING_HORIZONS)[number];
export const DEFAULT_RECURRING_HORIZON: RecurringHorizon = "30d";

export const RECURRING_HORIZON_DAYS: Readonly<
  Record<RecurringHorizon, number>
> = {
  "30d": 30,
  "60d": 60,
  "90d": 90,
};

export function parseRecurringHorizon(
  value: string | string[] | undefined,
): RecurringHorizon {
  const candidate = Array.isArray(value) ? value[0] : value;
  return RECURRING_HORIZONS.includes(candidate as RecurringHorizon)
    ? (candidate as RecurringHorizon)
    : DEFAULT_RECURRING_HORIZON;
}

export type RecurringFlow = "OUTFLOW" | "INFLOW";

export interface RecurringActualMonth {
  readonly month: string;
  readonly recurringSpendingMinor: string;
  readonly otherSpendingMinor: string;
  readonly totalSpendingMinor: string;
  readonly recurringIncomeMinor: string;
  readonly shareBps: number;
  readonly isPartial: boolean;
  readonly isFuture: boolean;
}

export interface RecurringTopItem {
  readonly id: string;
  readonly name: string | null;
  readonly flow: RecurringFlow;
  readonly status: RecurringPaymentStatus;
  readonly lifecycle: "ACTIVE" | "PAUSED";
  readonly actualMinor: string;
  readonly typicalAmountMinor: string;
  readonly cadenceDays: number;
  readonly paymentCount: number;
  readonly shareBps: number;
  readonly latestTransactionId: string | null;
  readonly latestDate: string | null;
}

export interface RecurringUpcomingOccurrence {
  readonly recurringId: string;
  readonly name: string | null;
  readonly flow: RecurringFlow;
  readonly date: string;
  readonly amountMinor: string;
  readonly isVariable: boolean;
}

export interface RecurringUpcomingWeek {
  readonly start: string;
  readonly outflowMinor: string;
  readonly inflowMinor: string;
  readonly peakShareBps: number;
}

export interface RecurringUpcoming {
  readonly horizon: RecurringHorizon;
  readonly firstDate: string;
  readonly lastDate: string;
  readonly outflowMinor: string;
  readonly inflowMinor: string;
  readonly occurrenceCount: number;
  readonly commitmentCount: number;
  readonly hasVariableAmounts: boolean;
  readonly weeks: readonly RecurringUpcomingWeek[];
  readonly items: readonly RecurringUpcomingOccurrence[];
  readonly remainingCount: number;
}

export interface RecurringPriceChange {
  readonly recurringId: string;
  readonly name: string | null;
  readonly flow: RecurringFlow;
  readonly previousMinor: string;
  readonly currentMinor: string;
  readonly deltaMinor: string;
  readonly percentage: string;
  readonly previousDate: string;
  readonly changedDate: string;
  readonly transactionId: string;
  readonly previousTransactionId: string;
}

export interface RecurringStatusCounts {
  readonly active: number;
  readonly paused: number;
  readonly ignored: number;
  readonly needsReview: number;
  readonly otherCurrency: number;
}

export type RecurringAnalyticsSignal =
  | {
      readonly kind: "recurringIncrease";
      readonly deltaMinor: string;
      readonly percentage: string;
    }
  | {
      readonly kind: "priceIncrease";
      readonly recurringId: string;
      readonly name: string | null;
      readonly count: number;
      readonly deltaMinor: string;
      readonly percentage: string;
    }
  | {
      readonly kind: "overdue";
      readonly recurringId: string;
      readonly name: string | null;
      readonly count: number;
      readonly lastDate: string;
    }
  | {
      readonly kind: "needsReview";
      readonly count: number;
    };

export interface InsightsRecurring {
  readonly currency: string;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly range: InsightsRange;
  readonly horizon: RecurringHorizon;
  readonly periodKey: string;
  readonly current: InsightsWindow;
  readonly previous: InsightsWindow;
  readonly hasRecurring: boolean;
  readonly actual: {
    readonly spending: InsightsMetric;
    readonly income: InsightsMetric;
    readonly totalSpendingMinor: string;
    readonly shareBps: number;
    readonly previousShareBps: number;
    readonly paidCount: number;
  };
  readonly months: readonly RecurringActualMonth[];
  readonly upcoming: RecurringUpcoming;
  readonly topItems: {
    readonly outflows: readonly RecurringTopItem[];
    readonly inflows: readonly RecurringTopItem[];
  };
  readonly priceChanges: readonly RecurringPriceChange[];
  readonly counts: RecurringStatusCounts;
  readonly signals: readonly RecurringAnalyticsSignal[];
  readonly currencies: readonly InsightsCurrencyOption[];
  readonly exclusions: InsightsExclusions;
}
