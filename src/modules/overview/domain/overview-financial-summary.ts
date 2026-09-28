import {
  calculateDailyPace,
  calculateTotals,
  currentMoneyTransactions,
  money,
  sum,
  type MoneyTransaction,
} from "@/money";
import {
  calendarMonthPeriod,
  countCalendarDays,
  createPeriod,
  localDateForInstant,
  localDateKey,
  periodForLocalDates,
  type Period,
} from "@/money/period";

import type {
  OverviewFilter,
  OverviewFinancialSummary,
  OverviewKpiTrend,
  OverviewMetric,
  OverviewSpendingPacePoint,
} from "./overview.types";

export interface BuildOverviewFinancialSummaryInput {
  readonly filter: OverviewFilter;
  /** An optional local date that limits this month's metrics to its completed days. */
  readonly selectedDay?: string | null;
  readonly currency: string;
  readonly locale: string;
  readonly period: Period;
  readonly timeZone: string;
  readonly now: Date;
  readonly transactions: readonly MoneyTransaction[];
}

const POSTED_ONLY = { statuses: ["POSTED"] as const };

/**
 * Derives every Overview financial value from the Money Engine. The DTO only
 * serializes bigint values; presentation and chart pixels are derived later.
 */
export function buildOverviewFinancialSummary(
  input: BuildOverviewFinancialSummaryInput,
): OverviewFinancialSummary {
  const selectedPeriod = input.selectedDay
    ? overviewPeriodThroughDay(input.period, input.selectedDay, input.timeZone)
    : input.period;
  const effectiveNow = input.selectedDay
    ? new Date(selectedPeriod.end.getTime() - 1)
    : input.now;
  const periodTransactions = transactionsInPeriod(input.transactions, selectedPeriod);
  const previousPeriod = calendarMonthPeriod(input.period.start, input.timeZone, -1);
  const comparisonPeriod = input.selectedDay
    ? comparisonPeriodThroughSelectedDay(previousPeriod, selectedPeriod, input.timeZone)
    : previousPeriod;
  const previousTransactions = transactionsInPeriod(input.transactions, comparisonPeriod);
  const currentTotals = calculateTotals(periodTransactions, {
    currency: input.currency,
    ...POSTED_ONLY,
  });
  const previousTotals = calculateTotals(previousTransactions, {
    currency: input.currency,
    ...POSTED_ONLY,
  });
  const comparisonMonth = formatComparisonMonth(previousPeriod, input.locale, input.timeZone);
  const spendingTrend = createTrend(
    currentTotals.spending.minor,
    previousTotals.spending.minor,
    "spending",
    comparisonMonth,
  );
  const incomeTrend = createTrend(
    currentTotals.income.minor,
    previousTotals.income.minor,
    "income",
    comparisonMonth,
  );
  const currentTransfers = transferTotal(periodTransactions, input.currency);
  const previousTransfers = transferTotal(previousTransactions, input.currency);

  const defaultPrimary: OverviewMetric = {
    availability: "value",
    minor: currentTotals.spending.minor.toString(),
    trend: spendingTrend,
  };
  const primary = input.filter === "INCOME"
    ? {
        availability: "value" as const,
        minor: currentTotals.income.minor.toString(),
        trend: incomeTrend,
      }
    : input.filter === "TRANSFER"
      ? {
          availability: "value" as const,
          minor: currentTransfers.toString(),
          trend: createTrend(currentTransfers, previousTransfers, "transfer", comparisonMonth),
        }
      : defaultPrimary;

  const supportsSpendingPace = input.filter === "ALL" || input.filter === "EXPENSE";
  const pace = supportsSpendingPace
    ? calculateDailyPace(periodTransactions, input.period, input.timeZone, {
        currency: input.currency,
        ...POSTED_ONLY,
        now: effectiveNow,
      })
    : null;
  const hasSpending = currentTotals.spending.minor !== 0n;

  return {
    filter: input.filter,
    currency: input.currency,
    locale: input.locale,
    primary,
    pace: supportsSpendingPace
      ? {
          availability: "value",
          minor: (pace?.spendingPerElapsedDay ?? money(input.currency, 0n)).minor.toString(),
        }
      : notApplicable(),
    expectedMonth: !supportsSpendingPace
      ? notApplicable()
      : hasSpending && pace?.spendingPerElapsedDay
        ? {
            availability: "value",
            minor: (pace.spendingPerElapsedDay.minor * BigInt(pace.totalDayCount)).toString(),
          }
        : insufficientData(),
    spendingPace: supportsSpendingPace
      ? buildSpendingPace({ ...input, now: effectiveNow })
      : {
          availability: "not-applicable",
          hasActualSpending: false,
          currentDay: null,
          points: [],
        },
  };
}

function overviewPeriodThroughDay(period: Period, selectedDay: string, timeZone: string): Period {
  const selectedDate = new Date(`${selectedDay}T12:00:00.000Z`);
  const nextDate = new Date(Date.UTC(
    selectedDate.getUTCFullYear(),
    selectedDate.getUTCMonth(),
    selectedDate.getUTCDate() + 1,
  ));
  const end = periodForLocalDates(
    selectedDay,
    localDateKey({
      year: nextDate.getUTCFullYear(),
      month: nextDate.getUTCMonth() + 1,
      day: nextDate.getUTCDate(),
    }),
    timeZone,
  ).end;
  return createPeriod(period.start, end);
}

function comparisonPeriodThroughSelectedDay(
  previousPeriod: Period,
  selectedPeriod: Period,
  timeZone: string,
): Period {
  const elapsedDayCount = countCalendarDays(selectedPeriod.start, selectedPeriod.end, timeZone);
  const previousStart = localDateForInstant(previousPeriod.start, timeZone);
  const previousDayCount = countCalendarDays(previousPeriod.start, previousPeriod.end, timeZone);
  const comparisonEnd = new Date(Date.UTC(
    previousStart.year,
    previousStart.month - 1,
    Math.min(elapsedDayCount, previousDayCount) + 1,
  ));
  return periodForLocalDates(
    localDateKey(previousStart),
    localDateKey({
      year: comparisonEnd.getUTCFullYear(),
      month: comparisonEnd.getUTCMonth() + 1,
      day: comparisonEnd.getUTCDate(),
    }),
    timeZone,
  );
}

export function overviewPeriodFromKey(
  value: string | undefined,
  timeZone: string,
  now: Date,
): Period {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return calendarMonthPeriod(now, timeZone);
  }

  const [year, month] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month!, 1));
  return periodForLocalDates(
    `${value}-01`,
    localDateKey({
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: 1,
    }),
    timeZone,
  );
}

export function overviewPeriodKey(period: Period, timeZone: string): string {
  const start = localDateForInstant(period.start, timeZone);
  return `${start.year.toString().padStart(4, "0")}-${start.month.toString().padStart(2, "0")}`;
}

function buildSpendingPace(input: BuildOverviewFinancialSummaryInput) {
  const points = buildCumulativePoints(input.transactions, input.period, input.timeZone, input.currency);
  const currentDay = currentDayForPeriod(input.period, input.timeZone, input.now);
  const historicalPeriods = [-1, -2, -3].map((offset) =>
    calendarMonthPeriod(input.period.start, input.timeZone, offset),
  );
  const historicalSeries = historicalPeriods.map((period) =>
    buildCumulativePoints(input.transactions, period, input.timeZone, input.currency),
  );
  const currentDayCount = points.length;
  const decorated: OverviewSpendingPacePoint[] = points.map((point, index) => {
    const historicalValues = historicalSeries.map((series) => {
      const relatedIndex = Math.min(
        series.length - 1,
        Math.max(0, Math.ceil(((index + 1) * series.length) / currentDayCount) - 1),
      );
      return series[relatedIndex]!.minor;
    });
    const typical = historicalValues.reduce((total, value) => total + value, 0n) /
      BigInt(historicalValues.length);

    return {
      date: point.date,
      day: index + 1,
      actualMinor: currentDay !== null && index + 1 > currentDay ? null : point.minor.toString(),
      typicalMinor: typical.toString(),
    };
  });

  return {
    availability: "value" as const,
    hasActualSpending: decorated.some((point) => point.actualMinor !== null && point.actualMinor !== "0"),
    currentDay,
    points: decorated,
  };
}

function buildCumulativePoints(
  transactions: readonly MoneyTransaction[],
  period: Period,
  timeZone: string,
  currency: string,
): Array<{ date: string; minor: bigint }> {
  const start = localDateForInstant(period.start, timeZone);
  const count = countCalendarDays(period.start, period.end, timeZone);
  const periodTransactions = transactionsInPeriod(transactions, period);

  return Array.from({ length: count }, (_, index) => {
    const day = new Date(Date.UTC(start.year, start.month - 1, start.day + index));
    const nextDay = new Date(Date.UTC(start.year, start.month - 1, start.day + index + 1));
    const dayKey = localDateKey({
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
    });
    const nextDayKey = localDateKey({
      year: nextDay.getUTCFullYear(),
      month: nextDay.getUTCMonth() + 1,
      day: nextDay.getUTCDate(),
    });
    const dayEnd = periodForLocalDates(dayKey, nextDayKey, timeZone).end;
    const totals = calculateTotals(
      periodTransactions.filter((transaction) => transaction.occurredAt < dayEnd),
      { currency, ...POSTED_ONLY },
    );
    return { date: dayKey, minor: totals.spending.minor };
  });
}

function transactionsInPeriod(transactions: readonly MoneyTransaction[], period: Period) {
  return transactions.filter(
    (transaction) => transaction.occurredAt >= period.start && transaction.occurredAt < period.end,
  );
}

function transferTotal(transactions: readonly MoneyTransaction[], currency: string): bigint {
  const values = currentMoneyTransactions(transactions)
    .filter((transaction) => transaction.kind === "TRANSFER" && transaction.status === "POSTED")
    .map((transaction) => money(transaction.currency, transaction.amountMinor));
  return sum(values, { currency }).minor;
}

function currentDayForPeriod(period: Period, timeZone: string, now: Date): number | null {
  if (now < period.start || now >= period.end) return null;
  return localDateForInstant(now, timeZone).day;
}

function createTrend(
  current: bigint,
  previous: bigint,
  category: "spending" | "income" | "transfer",
  comparisonMonth: string,
): OverviewKpiTrend {
  const direction = current > previous ? "up" : current < previous ? "down" : "neutral";
  const sentiment = category === "spending"
    ? direction === "down" ? "positive" : direction === "up" ? "negative" : "neutral"
    : category === "income"
      ? direction === "up" ? "positive" : direction === "down" ? "negative" : "neutral"
      : "neutral";
  const difference = current >= previous ? current - previous : previous - current;
  const percentage = previous > 0n
    ? ((difference * 100n + previous / 2n) / previous).toString()
    : null;

  return { direction, sentiment, percentage, comparisonMonth };
}

function formatComparisonMonth(period: Period, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", timeZone }).format(period.start);
}

function notApplicable(): OverviewMetric {
  return { availability: "not-applicable", minor: null };
}

function insufficientData(): OverviewMetric {
  return { availability: "insufficient-data", minor: null };
}
