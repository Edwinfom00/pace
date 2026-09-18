import { toCurrencyCode, type CurrencyCode } from "./currency";
import {
  money,
  subtract,
  sum,
  zero,
  type CurrencyConversionStrategy,
  type Money,
} from "./money";
import {
  countCalendarDays,
  createPeriod,
  localDateForInstant,
  localDateKey,
  type Period,
} from "./period";

export type MoneyTransactionKind = "EXPENSE" | "INCOME" | "TRANSFER" | "REFUND";
export type MoneyTransactionStatus = "PENDING" | "POSTED";

export interface MoneyTransaction {
  readonly id: string;
  readonly kind: MoneyTransactionKind;
  readonly status: MoneyTransactionStatus;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly occurredAt: Date;
  readonly categoryId: string | null;
  readonly merchantId: string | null;
  readonly refundedTransactionId: string | null;
  readonly reversalOfTransactionId?: string | null;
}

export interface MoneyEngineOptions {
  readonly statuses?: readonly MoneyTransactionStatus[];
  readonly currency?: CurrencyCode | string;
  readonly conversion?: CurrencyConversionStrategy;
}

export interface Totals {
  readonly currency: CurrencyCode;
  readonly income: Money;
  readonly spending: Money;
  readonly net: Money;
  readonly incomeTransactionCount: number;
  readonly spendingTransactionCount: number;
}

export interface DimensionSummary extends Totals {
  readonly id: string;
}

export interface PeriodSummary {
  readonly period: Period;
  readonly totals: Totals;
  readonly categories: readonly DimensionSummary[];
  readonly merchants: readonly DimensionSummary[];
}

export interface TotalsComparison {
  readonly income: Money;
  readonly spending: Money;
  readonly net: Money;
}

export interface DimensionComparison {
  readonly id: string;
  readonly current: DimensionSummary;
  readonly previous: DimensionSummary;
  readonly delta: TotalsComparison;
}

export interface PeriodComparison {
  readonly current: PeriodSummary;
  readonly previous: PeriodSummary;
  readonly totals: TotalsComparison;
  readonly categories: readonly DimensionComparison[];
  readonly merchants: readonly DimensionComparison[];
}

export interface DailyPace {
  readonly period: Period;
  readonly timeZone: string;
  readonly asOf: Date;
  readonly elapsedDayCount: number;
  readonly totalDayCount: number;
  readonly remainingDayCount: number;
  readonly spending: Money;
  readonly spendingPerElapsedDay: Money | null;
}

export const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";
export const UNKNOWN_MERCHANT_ID = "__unknown_merchant__";

export function calculateTotals(
  transactions: readonly MoneyTransaction[],
  options: MoneyEngineOptions = {},
): Totals {
  const target = resolveTargetCurrency(transactions, options);
  return calculateTotalsInCurrency(selectIncluded(transactions, options), target, options);
}

export function summarizePeriod(
  transactions: readonly MoneyTransaction[],
  period: Period,
  options: MoneyEngineOptions = {},
): PeriodSummary {
  const validatedPeriod = createPeriod(period.start, period.end);
  const target = resolveTargetCurrency(transactions, options);
  return summarizePeriodInCurrency(transactions, validatedPeriod, target, options);
}

export function comparePeriods(
  transactions: readonly MoneyTransaction[],
  currentPeriod: Period,
  previousPeriod: Period,
  options: MoneyEngineOptions = {},
): PeriodComparison {
  const currentRange = createPeriod(currentPeriod.start, currentPeriod.end);
  const previousRange = createPeriod(previousPeriod.start, previousPeriod.end);
  const target = resolveTargetCurrency(transactions, options);
  const current = summarizePeriodInCurrency(transactions, currentRange, target, options);
  const previous = summarizePeriodInCurrency(transactions, previousRange, target, options);

  return {
    current,
    previous,
    totals: subtractTotals(current.totals, previous.totals),
    categories: compareDimensions(current.categories, previous.categories, target),
    merchants: compareDimensions(current.merchants, previous.merchants, target),
  };
}

export function calculateDailyPace(
  transactions: readonly MoneyTransaction[],
  period: Period,
  timeZone: string,
  options: MoneyEngineOptions & { now?: Date } = {},
): DailyPace {
  const validatedPeriod = createPeriod(period.start, period.end);
  const target = resolveTargetCurrency(transactions, options);
  const now = options.now ? new Date(options.now) : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("The daily-pace asOf instant must be valid.");

  const totalDayCount = countCalendarDays(validatedPeriod.start, validatedPeriod.end, timeZone);
  const asOf = now < validatedPeriod.start ? validatedPeriod.start : now > validatedPeriod.end ? validatedPeriod.end : now;
  const elapsedDayCount = elapsedCalendarDayCount(validatedPeriod, now, timeZone, totalDayCount);
  const totals = summarizePeriodInCurrency(transactions, validatedPeriod, target, options).totals;

  return {
    period: validatedPeriod,
    timeZone,
    asOf,
    elapsedDayCount,
    totalDayCount,
    remainingDayCount: totalDayCount - elapsedDayCount,
    spending: totals.spending,
    spendingPerElapsedDay:
      elapsedDayCount === 0
        ? null
        : money(target, totals.spending.minor / BigInt(elapsedDayCount)),
  };
}


export function currentMoneyTransactions<T extends MoneyTransaction>(transactions: readonly T[]): T[] {
  const reversedIds = new Set(
    transactions.flatMap((transaction) =>
      transaction.reversalOfTransactionId == null ? [] : [transaction.reversalOfTransactionId],
    ),
  );
  return transactions.filter(
    (transaction) => transaction.reversalOfTransactionId == null && !reversedIds.has(transaction.id),
  );
}

function summarizePeriodInCurrency(
  transactions: readonly MoneyTransaction[],
  period: Period,
  target: CurrencyCode,
  options: MoneyEngineOptions,
): PeriodSummary {
  const included = selectIncluded(transactions, options).filter(
    (transaction) => transaction.occurredAt >= period.start && transaction.occurredAt < period.end,
  );

  return {
    period,
    totals: calculateTotalsInCurrency(included, target, options),
    categories: summarizeDimension(included, transactions, "categoryId", target, options),
    merchants: summarizeDimension(included, transactions, "merchantId", target, options),
  };
}

function calculateTotalsInCurrency(
  transactions: readonly MoneyTransaction[],
  target: CurrencyCode,
  options: MoneyEngineOptions,
): Totals {
  const incomeValues: Money[] = [];
  const spendingValues: Money[] = [];
  let incomeTransactionCount = 0;
  let spendingTransactionCount = 0;

  for (const transaction of transactions) {
    if (transaction.kind === "TRANSFER") continue;
    const value = money(transaction.currency, transaction.amountMinor);
    if (transaction.kind === "INCOME") {
      incomeValues.push(value);
      incomeTransactionCount += 1;
    } else if (transaction.kind === "EXPENSE") {
      spendingValues.push(value);
      spendingTransactionCount += 1;
    } else if (transaction.kind === "REFUND") {
      spendingValues.push(money(value.currency, -value.minor));
      spendingTransactionCount += 1;
    }
  }

  const income = sum(incomeValues, { currency: target, conversion: options.conversion });
  const spending = sum(spendingValues, { currency: target, conversion: options.conversion });
  return {
    currency: target,
    income,
    spending,
    net: subtract(income, spending),
    incomeTransactionCount,
    spendingTransactionCount,
  };
}

function summarizeDimension(
  included: readonly MoneyTransaction[],
  allTransactions: readonly MoneyTransaction[],
  dimension: "categoryId" | "merchantId",
  target: CurrencyCode,
  options: MoneyEngineOptions,
): DimensionSummary[] {
  const originals = new Map(allTransactions.map((transaction) => [transaction.id, transaction]));
  const grouped = new Map<string, MoneyTransaction[]>();

  for (const transaction of included) {
    if (transaction.kind === "TRANSFER") continue;
    const id = attributedDimensionId(transaction, originals, dimension);
    const bucket = grouped.get(id) ?? [];
    bucket.push(transaction);
    grouped.set(id, bucket);
  }

  return [...grouped.entries()]
    .map(([id, values]) => ({ id, ...calculateTotalsInCurrency(values, target, options) }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function attributedDimensionId(
  transaction: MoneyTransaction,
  originals: ReadonlyMap<string, MoneyTransaction>,
  dimension: "categoryId" | "merchantId",
): string {
  if (transaction.kind === "REFUND") {
    const original = transaction.refundedTransactionId
      ? originals.get(transaction.refundedTransactionId)
      : undefined;
    if (!original || original.kind !== "EXPENSE") {
      throw new Error("Refund transactions must reference an expense present in the ledger input.");
    }
    return original[dimension] ?? fallbackDimensionId(dimension);
  }
  return transaction[dimension] ?? fallbackDimensionId(dimension);
}

function fallbackDimensionId(dimension: "categoryId" | "merchantId"): string {
  return dimension === "categoryId" ? UNCATEGORIZED_CATEGORY_ID : UNKNOWN_MERCHANT_ID;
}

function compareDimensions(
  current: readonly DimensionSummary[],
  previous: readonly DimensionSummary[],
  currency: CurrencyCode,
): DimensionComparison[] {
  const currentById = new Map(current.map((entry) => [entry.id, entry]));
  const previousById = new Map(previous.map((entry) => [entry.id, entry]));
  const ids = new Set([...currentById.keys(), ...previousById.keys()]);

  return [...ids]
    .map((id) => {
      const currentValue = currentById.get(id) ?? emptyDimension(id, currency);
      const previousValue = previousById.get(id) ?? emptyDimension(id, currency);
      return {
        id,
        current: currentValue,
        previous: previousValue,
        delta: subtractTotals(currentValue, previousValue),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function emptyDimension(id: string, currency: CurrencyCode): DimensionSummary {
  const empty = zero(currency);
  return {
    id,
    currency,
    income: empty,
    spending: empty,
    net: empty,
    incomeTransactionCount: 0,
    spendingTransactionCount: 0,
  };
}

function subtractTotals(current: Totals, previous: Totals): TotalsComparison {
  return {
    income: subtract(current.income, previous.income),
    spending: subtract(current.spending, previous.spending),
    net: subtract(current.net, previous.net),
  };
}

function selectIncluded(
  transactions: readonly MoneyTransaction[],
  options: MoneyEngineOptions,
): MoneyTransaction[] {
  const statuses = new Set(options.statuses ?? ["POSTED"]);
  return currentMoneyTransactions(transactions).filter((transaction) => {
    if (!statuses.has(transaction.status)) return false;
    if (!Number.isFinite(transaction.occurredAt.getTime())) {
      throw new Error(`Transaction ${transaction.id} has an invalid occurredAt instant.`);
    }
    if (transaction.amountMinor <= 0n) {
      throw new Error(`Transaction ${transaction.id} must have a positive minor-unit amount.`);
    }
    return true;
  });
}

function resolveTargetCurrency(
  transactions: readonly MoneyTransaction[],
  options: MoneyEngineOptions,
): CurrencyCode {
  if (options.currency) return toCurrencyCode(options.currency);
  const candidate = selectIncluded(transactions, options).find(
    (transaction) => transaction.kind !== "TRANSFER",
  );
  if (!candidate) {
    throw new Error("A report currency is required when no income, expense, or refund is available.");
  }
  return toCurrencyCode(candidate.currency);
}

function elapsedCalendarDayCount(
  period: Period,
  now: Date,
  timeZone: string,
  totalDayCount: number,
): number {
  if (now <= period.start) return 0;
  if (now >= period.end) return totalDayCount;

  const startDay = localDateForInstant(period.start, timeZone);
  const currentDay = localDateForInstant(now, timeZone);
  const startDayAtUtc = Date.parse(`${localDateKey(startDay)}T00:00:00.000Z`);
  const currentDayAtUtc = Date.parse(`${localDateKey(currentDay)}T00:00:00.000Z`);
  return Math.min(totalDayCount, Math.max(1, Math.floor((currentDayAtUtc - startDayAtUtc) / 86_400_000) + 1));
}
