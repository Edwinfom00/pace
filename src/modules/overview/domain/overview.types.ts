export const OVERVIEW_FILTERS = ["ALL", "EXPENSE", "INCOME", "TRANSFER"] as const;

export type OverviewFilter = (typeof OVERVIEW_FILTERS)[number];
export type OverviewMetricAvailability = "value" | "not-applicable" | "insufficient-data";
export type OverviewTrendDirection = "up" | "down" | "neutral";
export type OverviewTrendSentiment = "positive" | "negative" | "neutral";

export function parseOverviewFilter(value: string | string[] | undefined): OverviewFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return OVERVIEW_FILTERS.includes(candidate as OverviewFilter) ? candidate as OverviewFilter : "ALL";
}

export function parseOverviewDay(
  value: string | string[] | undefined,
  periodKey: string,
): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(candidate)) return null;
  if (!candidate.startsWith(`${periodKey}-`)) return null;

  const [year, month, day] = candidate.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day
    ? candidate
    : null;
}

export interface OverviewKpiTrend {
  readonly direction: OverviewTrendDirection;
  readonly sentiment: OverviewTrendSentiment;
  /** A rounded whole percentage, calculated from bigint minor units. */
  readonly percentage: string | null;
  readonly comparisonMonth: string;
}

export interface OverviewMetric {
  readonly availability: OverviewMetricAvailability;
  /** A decimal string so the client never receives a lossy financial number. */
  readonly minor: string | null;
  readonly trend?: OverviewKpiTrend;
}

export interface OverviewSpendingPacePoint {
  /** Local calendar date, serialized as YYYY-MM-DD. */
  readonly date: string;
  readonly day: number;
  /** Null means that the selected current month has not reached this day yet. */
  readonly actualMinor: string | null;
  readonly typicalMinor: string;
}

export interface OverviewSpendingPace {
  readonly availability: OverviewMetricAvailability;
  readonly hasActualSpending: boolean;
  readonly currentDay: number | null;
  readonly points: readonly OverviewSpendingPacePoint[];
}

export interface OverviewFinancialSummary {
  readonly filter: OverviewFilter;
  readonly currency: string;
  readonly locale: string;
  readonly primary: OverviewMetric;
  readonly pace: OverviewMetric;
  readonly expectedMonth: OverviewMetric;
  readonly spendingPace: OverviewSpendingPace;
}
