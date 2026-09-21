import { localDateForInstant, localDateKey, periodForLocalDates, type Period } from "@/money/period";
import type { LedgerAccountType, LedgerTransactionKind, LedgerTransactionStatus } from "@/modules/ledger/domain";
import type { AccountActionPolicy } from "@/modules/ledger/account-action-policy";

export const ACCOUNT_DETAIL_CHART_RANGES = ["7d", "30d", "3m", "1y"] as const;

export type AccountDetailChartRange = (typeof ACCOUNT_DETAIL_CHART_RANGES)[number];
export type AccountDetailStatus = "ACTIVE" | "ARCHIVED";
export type AccountDetailMovementDirection = "INFLOW" | "OUTFLOW";

export type AccountDetailChartPoint = {
  readonly date: string;
  readonly balanceMinor: string;
};

export type AccountDetailCategory = {
  readonly id: string;
  readonly name: string;
  readonly amountMinor: string;
  readonly percentage: number;
};

export type AccountDetailRecentTransaction = {
  readonly id: string;
  readonly kind: LedgerTransactionKind;
  readonly status: LedgerTransactionStatus;
  readonly amountMinor: string;
  readonly movementMinor: string;
  readonly occurredAt: string;
  readonly merchantName: string | null;
  readonly note: string | null;
  readonly category: { readonly key: string; readonly label: string } | null;
  readonly transferCounterpartyName: string | null;
  readonly movementDirection: AccountDetailMovementDirection;
};

export type AccountDetail = {
  readonly account: {
    readonly id: string;
    readonly name: string;
    readonly type: LedgerAccountType;
    readonly currency: string;
    readonly status: AccountDetailStatus;
    readonly createdAt: string;
    /** Optimistic concurrency token for future account-management surfaces. */
    readonly updatedAt: string;
  };
  readonly capabilities: AccountActionPolicy;
  readonly currentBalanceMinor: string;
  readonly availableBalanceMinor: string;
  readonly summary: {
    readonly inflowsMinor: string;
    readonly outflowsMinor: string;
    readonly netTransfersMinor: string;
    readonly transactionCount: number;
  };
  readonly chart: {
    readonly range: AccountDetailChartRange;
    readonly points: readonly AccountDetailChartPoint[];
  };
  readonly topCategories: readonly AccountDetailCategory[];
  readonly recentTransactions: readonly AccountDetailRecentTransaction[];
};

export function parseAccountDetailChartRange(value: string | string[] | undefined): AccountDetailChartRange {
  const candidate = Array.isArray(value) ? value[0] : value;
  return ACCOUNT_DETAIL_CHART_RANGES.includes(candidate as AccountDetailChartRange)
    ? candidate as AccountDetailChartRange
    : "30d";
}

export function accountDetailChartPeriod(
  range: AccountDetailChartRange,
  now: Date,
  timeZone: string,
): Period {
  const today = localDateForInstant(now, timeZone);
  const endExclusive = addCalendarDays(today, 1);
  const start = range === "7d"
    ? addCalendarDays(endExclusive, -7)
    : range === "30d"
      ? addCalendarDays(endExclusive, -30)
      : range === "3m"
        ? addCalendarMonths(endExclusive, -3)
        : addCalendarMonths(endExclusive, -12);

  return periodForLocalDates(localDateKey(start), localDateKey(endExclusive), timeZone);
}

export function accountDetailHref(pathname: string, range: AccountDetailChartRange): string {
  return range === "30d" ? pathname : `${pathname}?chart=${range}`;
}

function addCalendarDays(
  value: { readonly year: number; readonly month: number; readonly day: number },
  days: number,
) {
  const shifted = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function addCalendarMonths(
  value: { readonly year: number; readonly month: number; readonly day: number },
  months: number,
) {
  const shifted = new Date(Date.UTC(value.year, value.month - 1 + months, value.day));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}
