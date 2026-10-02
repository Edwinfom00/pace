import {
  calculateTotals,
  comparePeriods,
  currentMoneyTransactions,
  summarizePeriod,
  UNCATEGORIZED_CATEGORY_ID,
  type DimensionComparison,
  type MoneyTransaction,
  type PeriodSummary,
} from "@/money";
import { calendarMonthPeriod, createPeriod, type Period } from "@/money/period";
import { overviewPeriodKey } from "@/modules/overview/domain/overview-financial-summary";

import {
  summarizeAccounts,
  type AccountAnalysisAccount,
  type AccountLedgerEntry,
} from "../account/account-analysis";
import {
  compareBigintDescending,
  currencyOptions,
  exclusions,
  insightsWindows,
  metric,
  serializeWindow,
  shareBps,
  type InsightsNameResolver,
  type InsightsWindows,
} from "../overview/insights-overview";
import { INSIGHTS_RANGE_MONTHS } from "../overview/insights-overview.types";
import type {
  InsightsTrends,
  TrendsCategorySeries,
  TrendsChange,
  TrendsMonth,
  TrendsRange,
  TrendsSignal,
} from "./insights-trends.types";

export interface TrendsRecurringPayment {
  readonly id: string;
  readonly direction: "EXPENSE" | "INCOME";
  readonly status: "CANDIDATE" | "CONFIRMED" | "IGNORED";
  readonly currency: string;
  readonly sampleTransactionIds: readonly string[];
}

export interface BuildInsightsTrendsInput {
  readonly transactions: readonly AccountLedgerEntry[];
  readonly accounts: readonly AccountAnalysisAccount[];
  readonly recurringPayments: readonly TrendsRecurringPayment[];
  readonly requestedCurrency: string | null;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly range: TrendsRange;
  readonly periodKey: string | undefined;
  readonly now: Date;
  readonly resolveName: InsightsNameResolver;
}

interface MonthBucket {
  readonly month: string;
  readonly period: Period | null;
  readonly isPartial: boolean;
  readonly summary: PeriodSummary | null;
  readonly recurring: bigint;
}

const CATEGORY_LIMIT = 5;
const CHANGE_LIMIT = 3;
const ACCOUNT_LIMIT = 4;
const SPIKE_MINIMUM_MONTHS = 3;
const SPIKE_THRESHOLD_PERCENT = 150n;
const RISING_MONTHS = 3;
const NEGATIVE_STREAK_MONTHS = 2;
const RECURRING_INCREASE_PERCENT = 10n;

export function buildInsightsTrends(
  input: BuildInsightsTrendsInput,
): InsightsTrends {
  const windows = insightsWindows(
    input.periodKey,
    input.range,
    input.timeZone,
    input.now,
  );
  const currencies = currencyOptions(
    input.transactions,
    input.workspaceCurrency,
    windows.current,
  );
  const currency = currencies.some(
    (option) => option.code === input.requestedCurrency,
  )
    ? input.requestedCurrency!
    : input.workspaceCurrency;
  // One report currency only: other currencies are counted, never converted or summed.
  const scoped = input.transactions.filter(
    (transaction) => transaction.currency === currency,
  );
  const options = { currency };
  const comparison = comparePeriods(
    scoped,
    windows.current,
    windows.previous,
    options,
  );
  const recurringIds = recurringTransactionIds(
    input.recurringPayments,
    currency,
  );
  const recurringEntries = recurringActuals(scoped, recurringIds);
  const recurringIn = (period: Period) =>
    calculateTotals(
      recurringEntries.filter((entry) => inPeriod(entry.occurredAt, period)),
      options,
    ).spending.minor;

  const buckets = monthBuckets(
    scoped,
    windows,
    input.range,
    input.timeZone,
    input.now,
    currency,
    recurringIn,
  );
  const currentTotals = comparison.current.totals;
  const previousTotals = comparison.previous.totals;
  const recurringCurrent = recurringIn(windows.current);
  const recurringPrevious = recurringIn(windows.previous);
  const categories = categorySeries(
    comparison.categories,
    buckets,
    currentTotals.spending.minor,
    input.resolveName,
  );
  const totals = {
    income: metric(
      currentTotals.income.minor,
      previousTotals.income.minor,
      "higher",
    ),
    spending: metric(
      currentTotals.spending.minor,
      previousTotals.spending.minor,
      "lower",
    ),
    net: metric(currentTotals.net.minor, previousTotals.net.minor, "higher"),
    recurring: metric(recurringCurrent, recurringPrevious, "lower"),
  };

  return {
    currency,
    workspaceCurrency: input.workspaceCurrency,
    locale: input.locale,
    range: input.range,
    periodKey: windows.periodKey,
    current: serializeWindow(
      windows.current,
      input.timeZone,
      windows.isPartial,
    ),
    previous: serializeWindow(
      windows.previous,
      input.timeZone,
      windows.previous.end.getTime() !== windows.previousFull.end.getTime(),
    ),
    hasActivity:
      currentTotals.incomeTransactionCount +
        currentTotals.spendingTransactionCount +
        previousTotals.incomeTransactionCount +
        previousTotals.spendingTransactionCount >
      0,
    totals,
    months: buckets.map(serializeMonth),
    categories,
    increases: changes(comparison.categories, input.resolveName, "up"),
    decreases: changes(comparison.categories, input.resolveName, "down"),
    recurring: {
      paymentCount: activeRecurringCount(
        input.recurringPayments,
        recurringEntries,
        windows.current,
        currency,
      ),
      shareBps:
        recurringCurrent > 0n && currentTotals.spending.minor > 0n
          ? shareBps(recurringCurrent, currentTotals.spending.minor)
          : 0,
    },
    signals: trendSignals(buckets, categories.items, totals.recurring),
    accounts: summarizeAccounts({
      transactions: input.transactions,
      accounts: input.accounts,
      currency,
      period: windows.current,
      limit: ACCOUNT_LIMIT,
    }),
    currencies,
    exclusions: exclusions(input.transactions, windows.current, currency),
  };
}

function monthBuckets(
  transactions: readonly MoneyTransaction[],
  windows: InsightsWindows,
  range: TrendsRange,
  timeZone: string,
  now: Date,
  currency: string,
  recurringIn: (period: Period) => bigint,
): MonthBucket[] {
  const count = INSIGHTS_RANGE_MONTHS[range];
  return Array.from({ length: count }, (_, index) => {
    const month = calendarMonthPeriod(
      windows.anchorMonth.start,
      timeZone,
      index - (count - 1),
    );
    // Months are clipped to the evaluated window so they always add up to the
    // period totals and never include future-dated entries.
    const end =
      month.end > windows.current.end ? windows.current.end : month.end;
    const period = end > month.start ? createPeriod(month.start, end) : null;
    return {
      month: overviewPeriodKey(month, timeZone),
      period,
      isPartial: inPeriod(now, month),
      summary: period
        ? summarizePeriod(transactions, period, { currency })
        : null,
      recurring: period ? recurringIn(period) : 0n,
    };
  });
}

function serializeMonth(bucket: MonthBucket): TrendsMonth {
  const totals = bucket.summary?.totals;
  return {
    month: bucket.month,
    incomeMinor: (totals?.income.minor ?? 0n).toString(),
    spendingMinor: (totals?.spending.minor ?? 0n).toString(),
    netMinor: (totals?.net.minor ?? 0n).toString(),
    recurringMinor: bucket.recurring.toString(),
    transactionCount: totals
      ? totals.incomeTransactionCount + totals.spendingTransactionCount
      : 0,
    isPartial: bucket.isPartial,
    isFuture: bucket.period === null,
  };
}

export function recurringTransactionIds(
  payments: readonly TrendsRecurringPayment[],
  currency: string,
): ReadonlySet<string> {
  return new Set(
    payments
      .filter(
        (payment) =>
          payment.direction === "EXPENSE" &&
          payment.status === "CONFIRMED" &&
          payment.currency === currency,
      )
      .flatMap((payment) => payment.sampleTransactionIds),
  );
}

/**
 * Recurring spending is measured only from posted ledger transactions that a
 * confirmed recurring payment already matched. Projected occurrences are never
 * actuals. Corrections are resolved on the full ledger before filtering.
 */
function recurringActuals<T extends MoneyTransaction>(
  transactions: readonly T[],
  ids: ReadonlySet<string>,
): T[] {
  if (ids.size === 0) return [];
  return currentMoneyTransactions(transactions).filter(
    (transaction) =>
      (transaction.kind === "EXPENSE" && ids.has(transaction.id)) ||
      (transaction.kind === "REFUND" &&
        transaction.refundedTransactionId !== null &&
        ids.has(transaction.refundedTransactionId)),
  );
}

function activeRecurringCount(
  payments: readonly TrendsRecurringPayment[],
  actuals: readonly MoneyTransaction[],
  period: Period,
  currency: string,
): number {
  const paidIds = new Set(
    actuals
      .filter(
        (entry) =>
          entry.kind === "EXPENSE" &&
          entry.status === "POSTED" &&
          inPeriod(entry.occurredAt, period),
      )
      .map((entry) => entry.id),
  );
  return payments.filter(
    (payment) =>
      payment.direction === "EXPENSE" &&
      payment.status === "CONFIRMED" &&
      payment.currency === currency &&
      payment.sampleTransactionIds.some((id) => paidIds.has(id)),
  ).length;
}

function categorySeries(
  categories: readonly DimensionComparison[],
  buckets: readonly MonthBucket[],
  totalSpending: bigint,
  resolveName: InsightsNameResolver,
): InsightsTrends["categories"] {
  const ranked = categories
    .filter((entry) => entry.current.spending.minor > 0n)
    .map((entry) => ({
      entry,
      name: resolveName("category", entry.id) ?? entry.id,
    }))
    .sort(
      (left, right) =>
        compareBigintDescending(
          left.entry.current.spending.minor,
          right.entry.current.spending.minor,
        ) || left.name.localeCompare(right.name),
    );
  const monthly = buckets.map(
    (bucket) =>
      new Map(
        (bucket.summary?.categories ?? []).map((summary) => [
          summary.id,
          summary.spending.minor,
        ]),
      ),
  );
  return {
    items: ranked.slice(0, CATEGORY_LIMIT).map(({ entry, name }) => {
      const values = monthly.map((byId) => byId.get(entry.id) ?? 0n);
      const peak = values.reduce(
        (max, value) => (value > max ? value : max),
        0n,
      );
      return {
        id: entry.id,
        name,
        isUncategorized: entry.id === UNCATEGORIZED_CATEGORY_ID,
        totalMinor: entry.current.spending.minor.toString(),
        shareBps: shareBps(entry.current.spending.minor, totalSpending),
        change: metric(
          entry.current.spending.minor,
          entry.previous.spending.minor,
          "lower",
        ),
        points: buckets.map((bucket, index) => ({
          month: bucket.month,
          spendingMinor: values[index]!.toString(),
          peakShareBps:
            values[index]! > 0n ? shareBps(values[index]!, peak) : 0,
        })),
      };
    }),
    otherCount: Math.max(0, ranked.length - CATEGORY_LIMIT),
  };
}

function changes(
  categories: readonly DimensionComparison[],
  resolveName: InsightsNameResolver,
  direction: "up" | "down",
): TrendsChange[] {
  return categories
    .filter((entry) =>
      direction === "up"
        ? entry.delta.spending.minor > 0n
        : entry.delta.spending.minor < 0n,
    )
    .flatMap((entry) => {
      const name = resolveName("category", entry.id);
      return name ? [{ entry, name }] : [];
    })
    .sort(
      (left, right) =>
        compareBigintDescending(
          abs(left.entry.delta.spending.minor),
          abs(right.entry.delta.spending.minor),
        ) || left.entry.id.localeCompare(right.entry.id),
    )
    .slice(0, CHANGE_LIMIT)
    .map(({ entry, name }) => {
      const previous = entry.previous.spending.minor;
      const delta = entry.delta.spending.minor;
      return {
        id: entry.id,
        name,
        isUncategorized: entry.id === UNCATEGORIZED_CATEGORY_ID,
        currentMinor: entry.current.spending.minor.toString(),
        previousMinor: previous.toString(),
        deltaMinor: delta.toString(),
        percentage: previous > 0n ? roundedPercent(abs(delta), previous) : null,
      };
    });
}

function trendSignals(
  buckets: readonly MonthBucket[],
  categories: readonly TrendsCategorySeries[],
  recurring: InsightsTrends["totals"]["recurring"],
): TrendsSignal[] {
  const complete = buckets.filter(
    (bucket) => bucket.summary !== null && !bucket.isPartial,
  );
  const signals: TrendsSignal[] = [];
  const spike = spendingSpike(complete);
  if (spike) signals.push(spike);
  const rising = categoryRising(complete, categories);
  if (rising) signals.push(rising);
  const streak = netNegativeStreak(complete);
  if (streak) signals.push(streak);
  const recurringDelta = BigInt(recurring.deltaMinor);
  const recurringPrevious = BigInt(recurring.previousMinor);
  if (
    recurringDelta > 0n &&
    recurringPrevious > 0n &&
    recurringDelta * 100n >= recurringPrevious * RECURRING_INCREASE_PERCENT
  ) {
    signals.push({
      kind: "recurringIncrease",
      deltaMinor: recurring.deltaMinor,
      percentage: roundedPercent(recurringDelta, recurringPrevious),
    });
  }
  return signals;
}

function spendingSpike(complete: readonly MonthBucket[]): TrendsSignal | null {
  if (complete.length < SPIKE_MINIMUM_MONTHS) return null;
  const spending = complete.map(
    (bucket) => bucket.summary!.totals.spending.minor,
  );
  const total = spending.reduce((sum, value) => sum + value, 0n);
  let best: { index: number; baseline: bigint; excess: bigint } | null = null;
  const others = BigInt(complete.length - 1);
  for (const [index, value] of spending.entries()) {
    const baseline = roundedDivide(total - value, others);
    if (baseline <= 0n || value * 100n < baseline * SPIKE_THRESHOLD_PERCENT)
      continue;
    const excess = value - baseline;
    if (!best || excess >= best.excess) best = { index, baseline, excess };
  }
  if (!best) return null;
  const { index, baseline, excess } = best;
  return {
    kind: "spendingSpike",
    month: complete[index]!.month,
    spendingMinor: spending[index]!.toString(),
    baselineMinor: baseline.toString(),
    percentage: roundedPercent(excess, baseline),
  };
}

function categoryRising(
  complete: readonly MonthBucket[],
  categories: readonly TrendsCategorySeries[],
): TrendsSignal | null {
  if (complete.length < RISING_MONTHS) return null;
  const recent = complete.slice(-RISING_MONTHS).map((bucket) => bucket.month);
  const candidates = categories.flatMap((category) => {
    const byMonth = new Map(
      category.points.map((point) => [
        point.month,
        BigInt(point.spendingMinor),
      ]),
    );
    const values = recent.map((month) => byMonth.get(month) ?? 0n);
    const rising =
      values[0]! > 0n &&
      values.every((value, index) => index === 0 || value > values[index - 1]!);
    return rising ? [{ category, from: values[0]!, to: values.at(-1)! }] : [];
  });
  const top = candidates.sort(
    (left, right) =>
      compareBigintDescending(left.to - left.from, right.to - right.from) ||
      left.category.id.localeCompare(right.category.id),
  )[0];
  if (!top) return null;
  return {
    kind: "categoryRising",
    id: top.category.id,
    name: top.category.name,
    isUncategorized: top.category.isUncategorized,
    monthCount: RISING_MONTHS,
    fromMinor: top.from.toString(),
    toMinor: top.to.toString(),
  };
}

function netNegativeStreak(
  complete: readonly MonthBucket[],
): TrendsSignal | null {
  let count = 0;
  let total = 0n;
  for (let index = complete.length - 1; index >= 0; index -= 1) {
    const net = complete[index]!.summary!.totals.net.minor;
    if (net >= 0n) break;
    count += 1;
    total += net;
  }
  if (count < NEGATIVE_STREAK_MONTHS) return null;
  return {
    kind: "netNegativeStreak",
    monthCount: count,
    lastMonth: complete.at(-1)!.month,
    totalMinor: total.toString(),
  };
}

function roundedDivide(total: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) return 0n;
  return (total * 2n + divisor) / (2n * divisor);
}

function roundedPercent(value: bigint, base: bigint): string {
  return ((value * 100n + base / 2n) / base).toString();
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function inPeriod(value: Date, period: Period): boolean {
  return value >= period.start && value < period.end;
}
