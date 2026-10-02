import {
  calculateTotals,
  comparePeriods,
  currentMoneyTransactions,
  summarizePeriod,
  type MoneyTransaction,
} from "@/money";
import {
  calendarMonthPeriod,
  createPeriod,
  localDateForInstant,
  localDateKey,
  periodForLocalDates,
  type LocalDate,
  type Period,
} from "@/money/period";
import type {
  RecurringPaymentDirection,
  RecurringPaymentLifecycle,
  RecurringPaymentStatus,
} from "@/modules/financial-inbox/domain";
import { projectRecurringPaymentOccurrences } from "@/modules/overview/domain/overview-right-rail";
import { overviewPeriodKey } from "@/modules/overview/domain/overview-financial-summary";

import {
  addLocalDays,
  compareBigintDescending,
  currencyOptions,
  exclusions,
  insightsWindows,
  metric,
  serializeWindow,
  shareBps,
} from "../overview/insights-overview";
import {
  INSIGHTS_RANGE_MONTHS,
  type InsightsCurrencyOption,
} from "../overview/insights-overview.types";
import type { TrendsRange } from "../trends/insights-trends.types";
import {
  RECURRING_HORIZON_DAYS,
  type InsightsRecurring,
  type RecurringActualMonth,
  type RecurringAnalyticsSignal,
  type RecurringFlow,
  type RecurringHorizon,
  type RecurringPriceChange,
  type RecurringStatusCounts,
  type RecurringTopItem,
  type RecurringUpcoming,
  type RecurringUpcomingOccurrence,
} from "./insights-recurring.types";

export interface RecurringAnalyticsPayment {
  readonly id: string;
  readonly displayName: string | null;
  readonly normalizedMerchant: string | null;
  readonly direction: RecurringPaymentDirection;
  readonly status: RecurringPaymentStatus;
  readonly lifecycle: RecurringPaymentLifecycle;
  readonly currency: string;
  readonly typicalAmountMinor: bigint;
  readonly amountToleranceBps: number;
  readonly cadenceDays: number;
  readonly lastOccurredAt: Date;
  readonly nextOccurrenceAt: Date | null;
  readonly sampleTransactionIds: readonly string[];
}

export interface RecurringAnalyticsCorrection {
  readonly originalTransactionId: string;
  readonly reversalTransactionId: string;
  readonly replacementTransactionId: string;
}

export interface BuildInsightsRecurringInput {
  readonly transactions: readonly MoneyTransaction[];
  readonly recurringPayments: readonly RecurringAnalyticsPayment[];
  readonly corrections: readonly RecurringAnalyticsCorrection[];
  readonly merchants: readonly {
    readonly normalizedName: string;
    readonly name: string;
  }[];
  readonly requestedCurrency: string | null;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly range: TrendsRange;
  readonly horizon: RecurringHorizon;
  readonly periodKey: string | undefined;
  readonly now: Date;
}

interface PaymentActuals {
  readonly payment: RecurringAnalyticsPayment;
  readonly name: string | null;
  readonly flow: RecurringFlow;
  readonly entries: readonly MoneyTransaction[];
}

const OUTFLOW_LIMIT = 6;
const INFLOW_LIMIT = 3;
const UPCOMING_LIMIT = 10;
const PRICE_CHANGE_LIMIT = 5;
const RECURRING_INCREASE_PERCENT = 10n;
const OVERDUE_CYCLES = 2;
const OVERDUE_GRACE_DAYS = 3;
const DAY_MS = 86_400_000;

export function buildInsightsRecurring(
  input: BuildInsightsRecurringInput,
): InsightsRecurring {
  const windows = insightsWindows(
    input.periodKey,
    input.range,
    input.timeZone,
    input.now,
  );
  const currencies = withPaymentCurrencies(
    currencyOptions(
      input.transactions,
      input.workspaceCurrency,
      windows.current,
    ),
    input.recurringPayments,
  );
  const currency = currencies.some(
    (option) => option.code === input.requestedCurrency,
  )
    ? input.requestedCurrency!
    : input.workspaceCurrency;

    const scoped = input.transactions.filter(
    (transaction) => transaction.currency === currency,
  );
  const payments = input.recurringPayments.filter(
    (payment) => payment.currency === currency,
  );
  const current = currentMoneyTransactions(scoped);
  const effectiveId = effectiveTransactionResolver(input.corrections);
  const merchantNames = new Map(
    input.merchants.map((merchant) => [merchant.normalizedName, merchant.name]),
  );
  const confirmed = payments
    .filter((payment) => payment.status === "CONFIRMED")
    .map((payment) =>
      paymentActuals(payment, current, effectiveId, merchantNames),
    );
  const options = { currency };
  const recurringSpendingEntries = uniqueEntries(
    confirmed.filter((item) => item.flow === "OUTFLOW"),
  );
  const recurringIncomeEntries = uniqueEntries(
    confirmed.filter((item) => item.flow === "INFLOW"),
  );
  const spendingIn = (period: Period) =>
    calculateTotals(within(recurringSpendingEntries, period), options).spending
      .minor;
  const incomeIn = (period: Period) =>
    calculateTotals(within(recurringIncomeEntries, period), options).income
      .minor;

  const comparison = comparePeriods(
    scoped,
    windows.current,
    windows.previous,
    options,
  );
  const totalSpending = comparison.current.totals.spending.minor;
  const previousTotalSpending = comparison.previous.totals.spending.minor;
  const recurringSpending = spendingIn(windows.current);
  const recurringSpendingPrevious = spendingIn(windows.previous);
  const spendingMetric = metric(
    recurringSpending,
    recurringSpendingPrevious,
    "lower",
  );
  const priceChanges = detectPriceChanges(
    confirmed,
    windows.current,
    input.timeZone,
  );
  const counts = statusCounts(input.recurringPayments, currency);

  return {
    currency,
    workspaceCurrency: input.workspaceCurrency,
    locale: input.locale,
    range: input.range,
    horizon: input.horizon,
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
    hasRecurring: payments.length > 0,
    actual: {
      spending: spendingMetric,
      income: metric(
        incomeIn(windows.current),
        incomeIn(windows.previous),
        "higher",
      ),
      totalSpendingMinor: totalSpending.toString(),
      shareBps: positiveShare(recurringSpending, totalSpending),
      previousShareBps: positiveShare(
        recurringSpendingPrevious,
        previousTotalSpending,
      ),
      paidCount: confirmed.filter(
        (item) =>
          chargesIn(item.entries, item.flow, windows.current).length > 0,
      ).length,
    },
    months: monthBuckets(
      scoped,
      windows.anchorMonth,
      windows.current,
      input.range,
      input.timeZone,
      input.now,
      currency,
      spendingIn,
      incomeIn,
    ),
    upcoming: upcomingCommitments(
      payments,
      merchantNames,
      input.horizon,
      input.timeZone,
      input.now,
    ),
    topItems: {
      outflows: topItems(
        confirmed,
        "OUTFLOW",
        windows.current,
        currency,
        input.timeZone,
      ),
      inflows: topItems(
        confirmed,
        "INFLOW",
        windows.current,
        currency,
        input.timeZone,
      ),
    },
    priceChanges,
    counts,
    signals: recurringSignals(
      spendingMetric,
      priceChanges,
      confirmed,
      counts,
      input.now,
      input.timeZone,
    ),
    currencies,
    exclusions: exclusions(input.transactions, windows.current, currency),
  };
}

function withPaymentCurrencies(
  options: InsightsCurrencyOption[],
  payments: readonly RecurringAnalyticsPayment[],
): InsightsCurrencyOption[] {
  const known = new Set(options.map((option) => option.code));
  const extra = [...new Set(payments.map((payment) => payment.currency))]
    .filter((code) => !known.has(code))
    .sort()
    .map((code) => ({ code, isWorkspaceCurrency: false, transactionCount: 0 }));
  return [...options, ...extra].sort(
    (left, right) =>
      Number(right.isWorkspaceCurrency) - Number(left.isWorkspaceCurrency) ||
      left.code.localeCompare(right.code),
  );
}


export function effectiveTransactionResolver(
  corrections: readonly RecurringAnalyticsCorrection[],
): (id: string) => string {
  const replacements = new Map<string, string>();
  for (const correction of corrections) {
    replacements.set(
      correction.originalTransactionId,
      correction.replacementTransactionId,
    );
    replacements.set(
      correction.reversalTransactionId,
      correction.replacementTransactionId,
    );
  }
  return (id) => {
    let resolved = id;
    const seen = new Set<string>();
    while (replacements.has(resolved) && !seen.has(resolved)) {
      seen.add(resolved);
      resolved = replacements.get(resolved)!;
    }
    return resolved;
  };
}


function paymentActuals(
  payment: RecurringAnalyticsPayment,
  current: readonly MoneyTransaction[],
  effectiveId: (id: string) => string,
  merchantNames: ReadonlyMap<string, string>,
): PaymentActuals {
  const ids = new Set(payment.sampleTransactionIds.map(effectiveId));
  const flow: RecurringFlow =
    payment.direction === "INCOME" ? "INFLOW" : "OUTFLOW";
  const chargeKind = flow === "INFLOW" ? "INCOME" : "EXPENSE";
  const entries = current.filter(
    (transaction) =>
      (transaction.kind === chargeKind && ids.has(transaction.id)) ||
      (flow === "OUTFLOW" &&
        transaction.kind === "REFUND" &&
        transaction.refundedTransactionId !== null &&
        ids.has(transaction.refundedTransactionId)),
  );
  return { payment, name: paymentName(payment, merchantNames), flow, entries };
}

function paymentName(
  payment: RecurringAnalyticsPayment,
  merchantNames: ReadonlyMap<string, string>,
): string | null {
  return (
    payment.displayName ??
    (payment.normalizedMerchant
      ? (merchantNames.get(payment.normalizedMerchant) ??
        payment.normalizedMerchant)
      : null)
  );
}

function uniqueEntries(items: readonly PaymentActuals[]): MoneyTransaction[] {
  const byId = new Map<string, MoneyTransaction>();
  for (const item of items)
    for (const entry of item.entries) byId.set(entry.id, entry);
  return [...byId.values()];
}

function within<T extends MoneyTransaction>(
  entries: readonly T[],
  period: Period,
): T[] {
  return entries.filter((entry) => inPeriod(entry.occurredAt, period));
}

function chargesIn(
  entries: readonly MoneyTransaction[],
  flow: RecurringFlow,
  period: Period | null,
): MoneyTransaction[] {
  const kind = flow === "INFLOW" ? "INCOME" : "EXPENSE";
  return entries
    .filter(
      (entry) =>
        entry.kind === kind &&
        entry.status === "POSTED" &&
        (period === null || inPeriod(entry.occurredAt, period)),
    )
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    );
}

function monthBuckets(
  transactions: readonly MoneyTransaction[],
  anchorMonth: Period,
  current: Period,
  range: TrendsRange,
  timeZone: string,
  now: Date,
  currency: string,
  spendingIn: (period: Period) => bigint,
  incomeIn: (period: Period) => bigint,
): RecurringActualMonth[] {
  const count = INSIGHTS_RANGE_MONTHS[range];
  return Array.from({ length: count }, (_, index) => {
    const month = calendarMonthPeriod(
      anchorMonth.start,
      timeZone,
      index - (count - 1),
    );
    // Months are clipped to the evaluated window, so actual months never contain
    // future-dated entries and always add up to the window totals.
    const end = month.end > current.end ? current.end : month.end;
    const period = end > month.start ? createPeriod(month.start, end) : null;
    const total = period
      ? summarizePeriod(transactions, period, { currency }).totals.spending
          .minor
      : 0n;
    const recurring = period ? spendingIn(period) : 0n;
    const other = total - recurring;
    return {
      month: overviewPeriodKey(month, timeZone),
      recurringSpendingMinor: recurring.toString(),
      otherSpendingMinor: (other > 0n ? other : 0n).toString(),
      totalSpendingMinor: total.toString(),
      recurringIncomeMinor: (period ? incomeIn(period) : 0n).toString(),
      shareBps: positiveShare(recurring, total),
      isPartial: inPeriod(now, month),
      isFuture: period === null,
    };
  });
}

/**
 * Upcoming commitments are informational projections from confirmed, active
 * recurring items. They are never added to actual totals or balances.
 */
function upcomingCommitments(
  payments: readonly RecurringAnalyticsPayment[],
  merchantNames: ReadonlyMap<string, string>,
  horizon: RecurringHorizon,
  timeZone: string,
  now: Date,
): RecurringUpcoming {
  const days = RECURRING_HORIZON_DAYS[horizon];
  const today = localDateForInstant(now, timeZone);
  const lastDay = addLocalDays(today, days - 1);
  const window = periodForLocalDates(
    localDateKey(today),
    localDateKey(addLocalDays(today, days)),
    timeZone,
  );
  const projectable = payments.filter(
    (payment) =>
      payment.status === "CONFIRMED" && payment.lifecycle === "ACTIVE",
  );
  const occurrences: RecurringUpcomingOccurrence[] = projectable
    .flatMap((payment) => {
      const cadence = Math.max(1, Math.floor(payment.cadenceDays));
      return projectRecurringPaymentOccurrences(
        {
          lastOccurredAt: payment.lastOccurredAt.toISOString(),
          nextOccurrenceAt: payment.nextOccurrenceAt?.toISOString() ?? null,
          cadenceDays: payment.cadenceDays,
        },
        now,
        timeZone,
        Math.ceil(days / cadence) + 1,
      )
        .filter((date) => inPeriod(new Date(date), window))
        .map((date) => ({
          recurringId: payment.id,
          name: paymentName(payment, merchantNames),
          flow: (payment.direction === "INCOME"
            ? "INFLOW"
            : "OUTFLOW") as RecurringFlow,
          date: localDay(new Date(date), timeZone),
          amountMinor: payment.typicalAmountMinor.toString(),
          isVariable: payment.amountToleranceBps > 0,
        }));
    })
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        (left.name ?? "").localeCompare(right.name ?? "") ||
        left.recurringId.localeCompare(right.recurringId),
    );

  const sumFlow = (flow: RecurringFlow) =>
    occurrences
      .filter((item) => item.flow === flow)
      .reduce((total, item) => total + BigInt(item.amountMinor), 0n);
  const weekCount = Math.ceil(days / 7);
  const weekly = Array.from({ length: weekCount }, () => ({
    outflow: 0n,
    inflow: 0n,
  }));
  for (const item of occurrences) {
    const offset = dayDifference(today, parseLocalDay(item.date));
    const bucket = weekly[Math.min(weekCount - 1, Math.floor(offset / 7))]!;
    if (item.flow === "OUTFLOW") bucket.outflow += BigInt(item.amountMinor);
    else bucket.inflow += BigInt(item.amountMinor);
  }
  const peak = weekly.reduce(
    (max, week) => (week.outflow > max ? week.outflow : max),
    0n,
  );

  return {
    horizon,
    firstDate: localDateKey(today),
    lastDate: localDateKey(lastDay),
    outflowMinor: sumFlow("OUTFLOW").toString(),
    inflowMinor: sumFlow("INFLOW").toString(),
    occurrenceCount: occurrences.length,
    commitmentCount: new Set(occurrences.map((item) => item.recurringId)).size,
    hasVariableAmounts: occurrences.some((item) => item.isVariable),
    weeks: weekly.map((week, index) => ({
      start: localDateKey(addLocalDays(today, index * 7)),
      outflowMinor: week.outflow.toString(),
      inflowMinor: week.inflow.toString(),
      peakShareBps: week.outflow > 0n ? shareBps(week.outflow, peak) : 0,
    })),
    items: occurrences.slice(0, UPCOMING_LIMIT),
    remainingCount: Math.max(0, occurrences.length - UPCOMING_LIMIT),
  };
}

function topItems(
  confirmed: readonly PaymentActuals[],
  flow: RecurringFlow,
  period: Period,
  currency: string,
  timeZone: string,
): RecurringTopItem[] {
  const ranked = confirmed
    .filter((item) => item.flow === flow)
    .map((item) => {
      const totals = calculateTotals(within(item.entries, period), {
        currency,
      });
      const charges = chargesIn(item.entries, flow, period);
      return {
        item,
        actual: flow === "INFLOW" ? totals.income.minor : totals.spending.minor,
        charges,
      };
    })
    .filter(({ actual }) => actual > 0n)
    .sort(
      (left, right) =>
        compareBigintDescending(left.actual, right.actual) ||
        (left.item.name ?? "").localeCompare(right.item.name ?? "") ||
        left.item.payment.id.localeCompare(right.item.payment.id),
    );
  const total = ranked.reduce((sum, { actual }) => sum + actual, 0n);
  return ranked
    .slice(0, flow === "OUTFLOW" ? OUTFLOW_LIMIT : INFLOW_LIMIT)
    .map(({ item, actual, charges }) => {
      const latest = charges.at(-1) ?? null;
      return {
        id: item.payment.id,
        name: item.name,
        flow,
        status: item.payment.status,
        lifecycle: item.payment.lifecycle,
        actualMinor: actual.toString(),
        typicalAmountMinor: item.payment.typicalAmountMinor.toString(),
        cadenceDays: item.payment.cadenceDays,
        paymentCount: charges.length,
        shareBps: shareBps(actual, total),
        latestTransactionId: latest?.id ?? null,
        latestDate: latest ? localDay(latest.occurredAt, timeZone) : null,
      };
    });
}

/**
 * A price change is only reported when the two latest posted charges of a
 * confirmed item differ beyond its canonical amount tolerance. Fully refunded
 * charges carry no price signal and are skipped.
 */
function detectPriceChanges(
  confirmed: readonly PaymentActuals[],
  period: Period,
  timeZone: string,
): RecurringPriceChange[] {
  return confirmed
    .flatMap((item) => {
      const refunded = new Map<string, bigint>();
      for (const entry of item.entries) {
        if (entry.kind !== "REFUND" || entry.status !== "POSTED") continue;
        const target = entry.refundedTransactionId!;
        refunded.set(target, (refunded.get(target) ?? 0n) + entry.amountMinor);
      }
      const charges = chargesIn(item.entries, item.flow, null).filter(
        (charge) =>
          charge.occurredAt < period.end &&
          (refunded.get(charge.id) ?? 0n) < charge.amountMinor,
      );
      const latest = charges.at(-1);
      const previous = charges.at(-2);
      if (!latest || !previous || !inPeriod(latest.occurredAt, period))
        return [];
      const delta = latest.amountMinor - previous.amountMinor;
      const magnitude = delta < 0n ? -delta : delta;
      const tolerance = BigInt(Math.max(0, item.payment.amountToleranceBps));
      if (
        delta === 0n ||
        previous.amountMinor <= 0n ||
        magnitude * 10_000n <= previous.amountMinor * tolerance
      )
        return [];
      return [
        {
          magnitude,
          change: {
            recurringId: item.payment.id,
            name: item.name,
            flow: item.flow,
            previousMinor: previous.amountMinor.toString(),
            currentMinor: latest.amountMinor.toString(),
            deltaMinor: delta.toString(),
            percentage: roundedPercent(magnitude, previous.amountMinor),
            previousDate: localDay(previous.occurredAt, timeZone),
            changedDate: localDay(latest.occurredAt, timeZone),
            transactionId: latest.id,
            previousTransactionId: previous.id,
          },
        },
      ];
    })
    .sort(
      (left, right) =>
        compareBigintDescending(left.magnitude, right.magnitude) ||
        left.change.recurringId.localeCompare(right.change.recurringId),
    )
    .slice(0, PRICE_CHANGE_LIMIT)
    .map(({ change }) => change);
}

function statusCounts(
  payments: readonly RecurringAnalyticsPayment[],
  currency: string,
): RecurringStatusCounts {
  const scoped = payments.filter((payment) => payment.currency === currency);
  return {
    active: scoped.filter(
      (payment) =>
        payment.status === "CONFIRMED" && payment.lifecycle === "ACTIVE",
    ).length,
    paused: scoped.filter(
      (payment) =>
        payment.status === "CONFIRMED" && payment.lifecycle === "PAUSED",
    ).length,
    ignored: scoped.filter((payment) => payment.status === "IGNORED").length,
    needsReview: scoped.filter((payment) => payment.status === "CANDIDATE")
      .length,
    otherCurrency: payments.length - scoped.length,
  };
}

function recurringSignals(
  spending: InsightsRecurring["actual"]["spending"],
  priceChanges: readonly RecurringPriceChange[],
  confirmed: readonly PaymentActuals[],
  counts: RecurringStatusCounts,
  now: Date,
  timeZone: string,
): RecurringAnalyticsSignal[] {
  const signals: RecurringAnalyticsSignal[] = [];
  const delta = BigInt(spending.deltaMinor);
  const previous = BigInt(spending.previousMinor);
  if (
    delta > 0n &&
    previous > 0n &&
    delta * 100n >= previous * RECURRING_INCREASE_PERCENT
  ) {
    signals.push({
      kind: "recurringIncrease",
      deltaMinor: delta.toString(),
      percentage: roundedPercent(delta, previous),
    });
  }

  const increases = priceChanges.filter(
    (change) => change.flow === "OUTFLOW" && BigInt(change.deltaMinor) > 0n,
  );
  const largest = increases[0];
  if (largest) {
    signals.push({
      kind: "priceIncrease",
      recurringId: largest.recurringId,
      name: largest.name,
      count: increases.length,
      deltaMinor: largest.deltaMinor,
      percentage: largest.percentage,
    });
  }

  const overdue = confirmed
    .filter((item) => item.payment.lifecycle === "ACTIVE")
    .flatMap((item) => {
      const latest = chargesIn(item.entries, item.flow, null)
        .filter((charge) => charge.occurredAt <= now)
        .at(-1);
      if (!latest) return [];
      const cadence = Math.max(1, Math.floor(item.payment.cadenceDays));
      const elapsedDays = Math.floor(
        (now.getTime() - latest.occurredAt.getTime()) / DAY_MS,
      );
      return elapsedDays > cadence * OVERDUE_CYCLES + OVERDUE_GRACE_DAYS
        ? [{ item, latest, elapsedDays }]
        : [];
    })
    .sort(
      (left, right) =>
        right.elapsedDays - left.elapsedDays ||
        left.item.payment.id.localeCompare(right.item.payment.id),
    );
  const stalest = overdue[0];
  if (stalest) {
    signals.push({
      kind: "overdue",
      recurringId: stalest.item.payment.id,
      name: stalest.item.name,
      count: overdue.length,
      lastDate: localDay(stalest.latest.occurredAt, timeZone),
    });
  }

  if (counts.needsReview > 0)
    signals.push({ kind: "needsReview", count: counts.needsReview });
  return signals;
}

function positiveShare(value: bigint, total: bigint): number {
  return value > 0n && total > 0n
    ? Math.min(10_000, shareBps(value, total))
    : 0;
}

function roundedPercent(value: bigint, base: bigint): string {
  return ((value * 100n + base / 2n) / base).toString();
}

function dayDifference(from: LocalDate, to: LocalDate): number {
  return Math.round(
    (Date.UTC(to.year, to.month - 1, to.day) -
      Date.UTC(from.year, from.month - 1, from.day)) /
      DAY_MS,
  );
}

function localDay(value: Date, timeZone: string): string {
  return localDateKey(localDateForInstant(value, timeZone));
}

function parseLocalDay(value: string): LocalDate {
  const [year, month, day] = value.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

function inPeriod(value: Date, period: Period): boolean {
  return value >= period.start && value < period.end;
}
