import {
  calculateDailyPace,
  calculateTotals,
  comparePeriods,
  currentMoneyTransactions,
  summarizePeriod,
  UNCATEGORIZED_CATEGORY_ID,
  UNKNOWN_MERCHANT_ID,
  type DimensionComparison,
  type MoneyTransaction,
} from "@/money";
import {
  calendarMonthPeriod,
  countCalendarDays,
  createPeriod,
  localDateForInstant,
  localDateKey,
  periodForLocalDates,
  type LocalDate,
  type Period,
} from "@/money/period";
import {
  overviewPeriodFromKey,
  overviewPeriodKey,
} from "@/modules/overview/domain/overview-financial-summary";

import {
  INSIGHTS_RANGE_MONTHS,
  type InsightsCategoryBreakdown,
  type InsightsCategorySlice,
  type InsightsChange,
  type InsightsCurrencyOption,
  type InsightsMetric,
  type InsightsMonthBar,
  type InsightsOverview,
  type InsightsRange,
  type InsightsTrendPoint,
  type InsightsWindow,
} from "./insights-overview.types";

export type InsightsNameResolver = (
  dimension: "category" | "merchant",
  id: string,
) => string | null;

export interface BuildInsightsOverviewInput {
  readonly transactions: readonly MoneyTransaction[];
  readonly requestedCurrency: string | null;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly range: InsightsRange;
  readonly periodKey: string | undefined;
  readonly now: Date;
  readonly resolveName: InsightsNameResolver;
}

export interface InsightsWindows {
  readonly periodKey: string;
  readonly current: Period;
  readonly currentFull: Period;
  readonly previous: Period;
  readonly previousFull: Period;
  readonly anchorMonth: Period;
  readonly isPartial: boolean;
}

const CATEGORY_SLICE_LIMIT = 6;
const TOP_CHANGE_LIMIT = 5;
const MINIMUM_TREND_MONTHS = 6;

export function insightsWindows(
  periodKey: string | undefined,
  range: InsightsRange,
  timeZone: string,
  now: Date,
): InsightsWindows {
  const months = INSIGHTS_RANGE_MONTHS[range];
  const anchorMonth = overviewPeriodFromKey(periodKey, timeZone, now);
  const fullStart = calendarMonthPeriod(
    anchorMonth.start,
    timeZone,
    -(months - 1),
  ).start;
  const fullEnd = anchorMonth.end;
  const previousStart = calendarMonthPeriod(fullStart, timeZone, -months).start;
  const isPartial = now >= fullStart && now < fullEnd;
  const currentEnd = isPartial
    ? localDayStart(
        addLocalDays(localDateForInstant(now, timeZone), 1),
        timeZone,
      )
    : fullEnd;
  const elapsedDays = countCalendarDays(fullStart, currentEnd, timeZone);
  const previousDays = countCalendarDays(previousStart, fullStart, timeZone);
  // An in-progress period is compared like-for-like with the same number of
  // elapsed days, never against a complete previous period.
  const previousEnd =
    isPartial && elapsedDays < previousDays
      ? localDayStart(
          addLocalDays(
            localDateForInstant(previousStart, timeZone),
            elapsedDays,
          ),
          timeZone,
        )
      : fullStart;

  return {
    periodKey: overviewPeriodKey(anchorMonth, timeZone),
    current: createPeriod(fullStart, currentEnd),
    currentFull: createPeriod(fullStart, fullEnd),
    previous: createPeriod(previousStart, previousEnd),
    previousFull: createPeriod(previousStart, fullStart),
    anchorMonth,
    isPartial,
  };
}

export function buildInsightsOverview(
  input: BuildInsightsOverviewInput,
): InsightsOverview {
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
  // Each report covers exactly one currency. Other currencies are counted and
  // offered separately; they are never converted or summed into this report.
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
  const currentTotals = comparison.current.totals;
  const previousTotals = comparison.previous.totals;
  const currentDaily = dailyAverage(
    scoped,
    windows.current,
    input.timeZone,
    currency,
  );
  const previousDaily = dailyAverage(
    scoped,
    windows.previous,
    input.timeZone,
    currency,
  );

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
    kpis: {
      spending: metric(
        currentTotals.spending.minor,
        previousTotals.spending.minor,
        "lower",
      ),
      income: metric(
        currentTotals.income.minor,
        previousTotals.income.minor,
        "higher",
      ),
      net: metric(currentTotals.net.minor, previousTotals.net.minor, "higher"),
      dailyAverage: metric(currentDaily, previousDaily, "lower"),
    },
    incomeVsSpending: monthBars(
      scoped,
      windows,
      input.range,
      input.timeZone,
      input.now,
      currency,
    ),
    spendingTrend: spendingTrend(
      scoped,
      windows,
      input.timeZone,
      input.now,
      currency,
    ),
    categories: categoryBreakdown(comparison.categories, input.resolveName),
    topChanges: topChanges(
      comparison.categories,
      comparison.merchants,
      input.resolveName,
    ),
    currencies,
    exclusions: exclusions(input.transactions, windows.current, currency),
  };
}

function currencyOptions(
  transactions: readonly MoneyTransaction[],
  workspaceCurrency: string,
  current: Period,
): InsightsCurrencyOption[] {
  const counts = new Map<string, number>([[workspaceCurrency, 0]]);
  for (const transaction of currentMoneyTransactions(transactions)) {
    if (transaction.kind === "TRANSFER") continue;
    const inWindow =
      transaction.status === "POSTED" &&
      inPeriod(transaction.occurredAt, current);
    counts.set(
      transaction.currency,
      (counts.get(transaction.currency) ?? 0) + (inWindow ? 1 : 0),
    );
  }
  return [...counts.entries()]
    .map(([code, transactionCount]) => ({
      code,
      isWorkspaceCurrency: code === workspaceCurrency,
      transactionCount,
    }))
    .sort(
      (left, right) =>
        Number(right.isWorkspaceCurrency) - Number(left.isWorkspaceCurrency) ||
        left.code.localeCompare(right.code),
    );
}

function dailyAverage(
  transactions: readonly MoneyTransaction[],
  period: Period,
  timeZone: string,
  currency: string,
): bigint {
  const pace = calculateDailyPace(transactions, period, timeZone, {
    currency,
    now: new Date(period.end.getTime() - 1),
  });
  return pace.spendingPerElapsedDay?.minor ?? 0n;
}

export function metric(
  current: bigint,
  previous: bigint,
  better: "higher" | "lower",
): InsightsMetric {
  const delta = current - previous;
  const direction = delta > 0n ? "up" : delta < 0n ? "down" : "neutral";
  const improved =
    better === "higher" ? direction === "up" : direction === "down";
  const absolute = delta < 0n ? -delta : delta;
  return {
    minor: current.toString(),
    previousMinor: previous.toString(),
    deltaMinor: delta.toString(),
    direction,
    sentiment:
      direction === "neutral" ? "neutral" : improved ? "positive" : "negative",
    percentage:
      previous > 0n
        ? ((absolute * 100n + previous / 2n) / previous).toString()
        : null,
  };
}

function monthBars(
  transactions: readonly MoneyTransaction[],
  windows: InsightsWindows,
  range: InsightsRange,
  timeZone: string,
  now: Date,
  currency: string,
): InsightsMonthBar[] {
  const selectedMonths = INSIGHTS_RANGE_MONTHS[range];
  const count = Math.max(selectedMonths, MINIMUM_TREND_MONTHS);
  return Array.from({ length: count }, (_, index) => {
    const offset = index - (count - 1);
    const month = calendarMonthPeriod(
      windows.anchorMonth.start,
      timeZone,
      offset,
    );
    const totals = summarizePeriod(transactions, month, { currency }).totals;
    return {
      month: overviewPeriodKey(month, timeZone),
      incomeMinor: totals.income.minor.toString(),
      spendingMinor: totals.spending.minor.toString(),
      isPartial: inPeriod(now, month),
      isSelected: -offset < selectedMonths,
    };
  });
}

function spendingTrend(
  transactions: readonly MoneyTransaction[],
  windows: InsightsWindows,
  timeZone: string,
  now: Date,
  currency: string,
): InsightsOverview["spendingTrend"] {
  const effective = currentMoneyTransactions(transactions);
  const current = cumulativeDailySpending(
    effective,
    windows.currentFull,
    timeZone,
    currency,
  );
  const previous = cumulativeDailySpending(
    effective,
    windows.previousFull,
    timeZone,
    currency,
  );
  const lastActualDate = windows.isPartial
    ? localDateKey(localDateForInstant(now, timeZone))
    : null;
  const points: InsightsTrendPoint[] = Array.from(
    { length: Math.max(current.length, previous.length) },
    (_, index) => {
      const currentPoint = current[index];
      const previousPoint = previous[index];
      const isFuture = Boolean(
        currentPoint &&
        ((lastActualDate && currentPoint.date > lastActualDate) ||
          windows.currentFull.start > now),
      );
      return {
        day: index + 1,
        currentDate: currentPoint?.date ?? null,
        previousDate: previousPoint?.date ?? null,
        currentMinor:
          currentPoint && !isFuture ? currentPoint.minor.toString() : null,
        previousMinor: previousPoint ? previousPoint.minor.toString() : null,
      };
    },
  );
  return {
    hasSpending: points.some(
      (point) => point.currentMinor !== null && point.currentMinor !== "0",
    ),
    points,
  };
}

/**
 * Corrections must be resolved on the complete ledger before bucketing, so a
 * reversal posted on another day still removes the transaction it reverses.
 */
function cumulativeDailySpending(
  effective: readonly MoneyTransaction[],
  period: Period,
  timeZone: string,
  currency: string,
): Array<{ date: string; minor: bigint }> {
  const buckets = new Map<string, MoneyTransaction[]>();
  for (const transaction of effective) {
    if (!inPeriod(transaction.occurredAt, period)) continue;
    const key = localDateKey(
      localDateForInstant(transaction.occurredAt, timeZone),
    );
    const bucket = buckets.get(key) ?? [];
    bucket.push(transaction);
    buckets.set(key, bucket);
  }
  const first = localDateForInstant(period.start, timeZone);
  const dayCount = countCalendarDays(period.start, period.end, timeZone);
  let running = 0n;
  return Array.from({ length: dayCount }, (_, index) => {
    const date = localDateKey(addLocalDays(first, index));
    running += calculateTotals(buckets.get(date) ?? [], { currency }).spending
      .minor;
    return { date, minor: running };
  });
}

function categoryBreakdown(
  categories: readonly DimensionComparison[],
  resolveName: InsightsNameResolver,
): InsightsCategoryBreakdown {
  const spending = categories
    .filter((category) => category.current.spending.minor > 0n)
    .map((category) => ({
      category,
      name: resolveName("category", category.id) ?? category.id,
    }))
    .sort(
      (left, right) =>
        compareBigintDescending(
          left.category.current.spending.minor,
          right.category.current.spending.minor,
        ) || left.name.localeCompare(right.name),
    );
  const total = spending.reduce(
    (sum, entry) => sum + entry.category.current.spending.minor,
    0n,
  );
  const visible =
    spending.length > CATEGORY_SLICE_LIMIT + 1
      ? spending.slice(0, CATEGORY_SLICE_LIMIT)
      : spending;
  const rest = spending.slice(visible.length);
  const restTotal = rest.reduce(
    (sum, entry) => sum + entry.category.current.spending.minor,
    0n,
  );

  return {
    totalMinor: total.toString(),
    items: visible.map(
      ({ category, name }): InsightsCategorySlice => ({
        id: category.id,
        name,
        spendingMinor: category.current.spending.minor.toString(),
        previousSpendingMinor: category.previous.spending.minor.toString(),
        shareBps: shareBps(category.current.spending.minor, total),
        transactionCount: category.current.spendingTransactionCount,
        isUncategorized: category.id === UNCATEGORIZED_CATEGORY_ID,
      }),
    ),
    other: rest.length
      ? {
          spendingMinor: restTotal.toString(),
          shareBps: shareBps(restTotal, total),
          categoryCount: rest.length,
        }
      : null,
  };
}

function topChanges(
  categories: readonly DimensionComparison[],
  merchants: readonly DimensionComparison[],
  resolveName: InsightsNameResolver,
): InsightsChange[] {
  const candidates = [
    ...categories.map((entry) => ({ dimension: "category" as const, entry })),
    ...merchants
      .filter((entry) => entry.id !== UNKNOWN_MERCHANT_ID)
      .map((entry) => ({ dimension: "merchant" as const, entry })),
  ];
  return candidates
    .filter(({ entry }) => entry.delta.spending.minor !== 0n)
    .flatMap(({ dimension, entry }) => {
      const name = resolveName(dimension, entry.id);
      if (!name) return [];
      const previous = entry.previous.spending.minor;
      const delta = entry.delta.spending.minor;
      const absolute = delta < 0n ? -delta : delta;
      const change: InsightsChange = {
        dimension,
        id: entry.id,
        name,
        currentMinor: entry.current.spending.minor.toString(),
        previousMinor: previous.toString(),
        deltaMinor: delta.toString(),
        direction: delta > 0n ? "up" : "down",
        percentage: previous > 0n ? ((absolute * 100n + previous / 2n) / previous).toString() : null,
      };
      return [{ change, absolute }];
    })
    .sort(
      (left, right) =>
        compareBigintDescending(left.absolute, right.absolute) ||
        left.change.dimension.localeCompare(right.change.dimension) ||
        left.change.id.localeCompare(right.change.id),
    )
    .slice(0, TOP_CHANGE_LIMIT)
    .map(({ change }) => change);
}

function exclusions(
  transactions: readonly MoneyTransaction[],
  current: Period,
  currency: string,
): InsightsOverview["exclusions"] {
  let transferCount = 0;
  let pendingCount = 0;
  let otherCurrencyCount = 0;
  for (const transaction of currentMoneyTransactions(transactions)) {
    if (!inPeriod(transaction.occurredAt, current)) continue;
    if (transaction.currency !== currency) {
      if (transaction.kind !== "TRANSFER" && transaction.status === "POSTED")
        otherCurrencyCount += 1;
    } else if (transaction.kind === "TRANSFER") {
      transferCount += 1;
    } else if (transaction.status === "PENDING") {
      pendingCount += 1;
    }
  }
  return { transferCount, pendingCount, otherCurrencyCount };
}

function serializeWindow(
  period: Period,
  timeZone: string,
  isPartial: boolean,
): InsightsWindow {
  return {
    start: period.start.toISOString(),
    endExclusive: period.end.toISOString(),
    firstDate: localDateKey(localDateForInstant(period.start, timeZone)),
    lastDate: localDateKey(
      localDateForInstant(new Date(period.end.getTime() - 1), timeZone),
    ),
    dayCount: countCalendarDays(period.start, period.end, timeZone),
    isPartial,
  };
}

function shareBps(value: bigint, total: bigint): number {
  return total > 0n ? Number((value * 10_000n) / total) : 0;
}

function compareBigintDescending(left: bigint, right: bigint): number {
  return left > right ? -1 : left < right ? 1 : 0;
}

function inPeriod(value: Date, period: Period): boolean {
  return value >= period.start && value < period.end;
}

function addLocalDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function localDayStart(date: LocalDate, timeZone: string): Date {
  return periodForLocalDates(
    localDateKey(date),
    localDateKey(addLocalDays(date, 1)),
    timeZone,
  ).start;
}
