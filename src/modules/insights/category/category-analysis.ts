import {
  calculateTotals,
  comparePeriods,
  currentMoneyTransactions,
  summarizePeriod,
  UNKNOWN_MERCHANT_ID,
  type DimensionComparison,
  type MoneyTransaction,
} from "@/money";
import {
  countCalendarDays,
  localDateForInstant,
  localDateKey,
  type Period,
} from "@/money/period";

import {
  addLocalDays,
  compareBigintDescending,
  insightsWindows,
  metric,
  serializeWindow,
  shareBps,
  spendingTrend,
  type InsightsNameResolver,
} from "../overview/insights-overview";
import type {
  InsightsCurrencyOption,
  InsightsRange,
} from "../overview/insights-overview.types";
import type {
  CategoryAnalysis,
  CategoryAnalysisInsight,
  CategoryAnalysisMerchants,
  CategoryAnalysisRow,
  CategoryAnalysisSubcategory,
  CategoryAnalysisTransaction,
} from "./category-analysis.types";

export interface CategoryAnalysisScope {
  readonly id: string;
  readonly name: string;
  readonly parent: { readonly id: string; readonly name: string } | null;
  readonly children: readonly { readonly id: string; readonly name: string }[];
}

export interface BuildCategoryAnalysisInput {
  readonly transactions: readonly MoneyTransaction[];
  readonly category: CategoryAnalysisScope;
  readonly requestedCurrency: string | null;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly range: InsightsRange;
  readonly periodKey: string | undefined;
  readonly now: Date;
  readonly resolveName: InsightsNameResolver;
}

const MERCHANT_LIMIT = 5;
const TRANSACTION_LIMIT = 12;
const CONCENTRATION_THRESHOLD_BPS = 4_000;

export function categoryScopeIds(
  category: CategoryAnalysisScope,
): ReadonlySet<string> {
  return new Set(
    category.parent
      ? [category.id]
      : [category.id, ...category.children.map((child) => child.id)],
  );
}


export function attributedCategoryId(
  transaction: MoneyTransaction,
  byId: ReadonlyMap<string, MoneyTransaction>,
): string | null {
  let target = transaction;
  if (target.reversalOfTransactionId)
    target = byId.get(target.reversalOfTransactionId) ?? target;
  if (target.kind === "REFUND" && target.refundedTransactionId) {
    target = byId.get(target.refundedTransactionId) ?? target;
  }
  return target.categoryId;
}

export function buildCategoryAnalysis(
  input: BuildCategoryAnalysisInput,
): CategoryAnalysis {
  const windows = insightsWindows(
    input.periodKey,
    input.range,
    input.timeZone,
    input.now,
  );
  const byId = new Map(
    input.transactions.map((transaction) => [transaction.id, transaction]),
  );
  const scopeIds = categoryScopeIds(input.category);
  const inScope = input.transactions.filter((transaction) => {
    const categoryId = attributedCategoryId(transaction, byId);
    return categoryId !== null && scopeIds.has(categoryId);
  });

  const currencies = currencyOptions(
    inScope,
    input.workspaceCurrency,
    windows.current,
  );
  const currency = currencies.some(
    (option) => option.code === input.requestedCurrency,
  )
    ? input.requestedCurrency!
    : input.workspaceCurrency;
  // One report currency only: other currencies are counted, never converted or summed.
  const scoped = inScope.filter(
    (transaction) => transaction.currency === currency,
  );
  const options = { currency };
  const comparison = comparePeriods(
    scoped,
    windows.current,
    windows.previous,
    options,
  );
  const spent = comparison.current.totals.spending.minor;
  const previousSpent = comparison.previous.totals.spending.minor;

  const effective = currentMoneyTransactions(scoped).filter(
    (transaction) =>
      transaction.status === "POSTED" &&
      (transaction.kind === "EXPENSE" || transaction.kind === "REFUND"),
  );
  const currentEntries = effective.filter((transaction) =>
    inPeriod(transaction.occurredAt, windows.current),
  );
  const previousEntries = effective.filter((transaction) =>
    inPeriod(transaction.occurredAt, windows.previous),
  );
  const currentExpenseCount = currentEntries.filter(
    (transaction) => transaction.kind === "EXPENSE",
  ).length;
  const previousExpenseCount = previousEntries.filter(
    (transaction) => transaction.kind === "EXPENSE",
  ).length;

  const workspaceSpending = summarizePeriod(
    input.transactions.filter(
      (transaction) => transaction.currency === currency,
    ),
    windows.current,
    options,
  ).totals.spending.minor;

  const merchants = merchantBreakdown(comparison.merchants, input.resolveName);
  const subcategories = subcategoryBreakdown(
    input.category,
    comparison.categories,
    spent,
  );

  return {
    category: {
      id: input.category.id,
      name: input.category.name,
      parent: input.category.parent,
      childCount: input.category.parent ? 0 : input.category.children.length,
    },
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
      comparison.current.totals.spendingTransactionCount +
        comparison.previous.totals.spendingTransactionCount >
      0,
    kpis: {
      spent: metric(spent, previousSpent, "lower"),
      transactionCount: {
        current: currentExpenseCount,
        previous: previousExpenseCount,
      },
      averageTransaction: metric(
        roundedAverage(spent, currentExpenseCount),
        roundedAverage(previousSpent, previousExpenseCount),
        "lower",
      ),
    },
    shareOfSpendingBps:
      spent > 0n && workspaceSpending > 0n
        ? shareBps(spent, workspaceSpending)
        : 0,
    spendingTrend: spendingTrend(
      scoped,
      windows,
      input.timeZone,
      input.now,
      currency,
    ),
    merchants,
    subcategories,
    transactions: {
      items: contributingTransactions(currentEntries, byId, input),
      totalCount: currentEntries.length,
      refundCount: currentEntries.length - currentExpenseCount,
    },
    insights: categoryInsights({
      merchantComparisons: comparison.merchants,
      merchants,
      subcategories,
      entries: currentEntries,
      byId,
      spent,
      current: windows.current,
      input,
      currency,
    }),
    currencies,
    exclusions: exclusions(inScope, windows.current, currency),
  };
}

function currencyOptions(
  transactions: readonly MoneyTransaction[],
  workspaceCurrency: string,
  current: Period,
): InsightsCurrencyOption[] {
  const counts = new Map<string, number>([[workspaceCurrency, 0]]);
  for (const transaction of currentMoneyTransactions(transactions)) {
    if (transaction.kind === "TRANSFER" || transaction.kind === "INCOME")
      continue;
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

function analysisRow(
  entry: DimensionComparison,
  name: string | null,
  total: bigint,
): CategoryAnalysisRow {
  const current = entry.current.spending.minor;
  const previous = entry.previous.spending.minor;
  const delta = current - previous;
  return {
    id: entry.id,
    name,
    currentMinor: current.toString(),
    previousMinor: previous.toString(),
    deltaMinor: delta.toString(),
    direction: delta > 0n ? "up" : delta < 0n ? "down" : "neutral",
    percentage: changePercentage(delta, previous),
    shareBps: current > 0n && total > 0n ? shareBps(current, total) : 0,
    transactionCount: entry.current.spendingTransactionCount,
  };
}

function merchantBreakdown(
  merchants: readonly DimensionComparison[],
  resolveName: InsightsNameResolver,
): CategoryAnalysisMerchants {
  const spending = merchants
    .filter((entry) => entry.current.spending.minor > 0n)
    .sort(
      (left, right) =>
        compareBigintDescending(
          left.current.spending.minor,
          right.current.spending.minor,
        ) || left.id.localeCompare(right.id),
    );
  const total = spending.reduce(
    (sum, entry) => sum + entry.current.spending.minor,
    0n,
  );
  const visible =
    spending.length > MERCHANT_LIMIT + 1
      ? spending.slice(0, MERCHANT_LIMIT)
      : spending;
  const rest = spending.slice(visible.length);
  const restTotal = rest.reduce(
    (sum, entry) => sum + entry.current.spending.minor,
    0n,
  );
  return {
    items: visible.map((entry) =>
      analysisRow(
        entry,
        entry.id === UNKNOWN_MERCHANT_ID
          ? null
          : resolveName("merchant", entry.id),
        total,
      ),
    ),
    other: rest.length
      ? {
          currentMinor: restTotal.toString(),
          shareBps: shareBps(restTotal, total),
          merchantCount: rest.length,
        }
      : null,
  };
}

function subcategoryBreakdown(
  category: CategoryAnalysisScope,
  categories: readonly DimensionComparison[],
  spent: bigint,
): CategoryAnalysisSubcategory[] | null {
  if (category.parent || category.children.length === 0) return null;
  const byId = new Map(categories.map((entry) => [entry.id, entry]));
  const members = [
    { id: category.id, name: category.name, isDirect: true },
    ...category.children.map((child) => ({ ...child, isDirect: false })),
  ];
  return members
    .flatMap((member) => {
      const entry = byId.get(member.id);
      if (
        !entry ||
        (entry.current.spending.minor === 0n &&
          entry.previous.spending.minor === 0n)
      )
        return [];
      return [
        {
          ...analysisRow(entry, member.name, spent),
          isDirect: member.isDirect,
        },
      ];
    })
    .sort(
      (left, right) =>
        compareBigintDescending(
          BigInt(left.currentMinor),
          BigInt(right.currentMinor),
        ) || (left.name ?? "").localeCompare(right.name ?? ""),
    );
}

function contributingTransactions(
  entries: readonly MoneyTransaction[],
  byId: ReadonlyMap<string, MoneyTransaction>,
  input: BuildCategoryAnalysisInput,
): CategoryAnalysisTransaction[] {
  return [...entries]
    .sort(
      (left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )
    .slice(0, TRANSACTION_LIMIT)
    .map((transaction) => {
      const original =
        transaction.kind === "REFUND" && transaction.refundedTransactionId
          ? byId.get(transaction.refundedTransactionId)
          : undefined;
      const categoryId = attributedCategoryId(transaction, byId)!;
      const merchantId = transaction.merchantId ?? original?.merchantId ?? null;
      return {
        id: transaction.id,
        kind: transaction.kind as "EXPENSE" | "REFUND",
        date: localDateKey(
          localDateForInstant(transaction.occurredAt, input.timeZone),
        ),
        signedMinor: (transaction.kind === "REFUND"
          ? -transaction.amountMinor
          : transaction.amountMinor
        ).toString(),
        merchantName: merchantId
          ? input.resolveName("merchant", merchantId)
          : null,
        categoryId,
        categoryName:
          categoryId === input.category.id
            ? null
            : input.resolveName("category", categoryId),
      };
    });
}

interface CategoryInsightsInput {
  readonly merchantComparisons: readonly DimensionComparison[];
  readonly merchants: CategoryAnalysisMerchants;
  readonly subcategories: readonly CategoryAnalysisSubcategory[] | null;
  readonly entries: readonly MoneyTransaction[];
  readonly byId: ReadonlyMap<string, MoneyTransaction>;
  readonly spent: bigint;
  readonly current: Period;
  readonly input: BuildCategoryAnalysisInput;
  readonly currency: string;
}

function categoryInsights(
  context: CategoryInsightsInput,
): CategoryAnalysisInsight[] {
  const insights: CategoryAnalysisInsight[] = [];
  const increase = biggestIncrease(context);
  if (increase) insights.push(increase);

  const topMerchant = context.merchants.items.find(
    (item) => item.name !== null,
  );
  if (
    topMerchant &&
    context.entries.length >= 2 &&
    topMerchant.shareBps >= CONCENTRATION_THRESHOLD_BPS
  ) {
    insights.push({
      kind: "merchantConcentration",
      id: topMerchant.id,
      name: topMerchant.name!,
      shareBps: topMerchant.shareBps,
    });
  }

  const week = strongestWeek(
    context.entries,
    context.current,
    context.input.timeZone,
    context.currency,
  );
  if (week && context.spent > 0n) {
    insights.push({
      kind: "strongestWeek",
      ...week,
      shareBps: shareBps(BigInt(week.spendingMinor), context.spent),
    });
  }

  const largest = context.entries
    .filter((transaction) => transaction.kind === "EXPENSE")
    .sort(
      (left, right) =>
        compareBigintDescending(left.amountMinor, right.amountMinor) ||
        right.occurredAt.getTime() - left.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )[0];
  if (largest) {
    insights.push({
      kind: "largestTransaction",
      transactionId: largest.id,
      date: localDateKey(
        localDateForInstant(largest.occurredAt, context.input.timeZone),
      ),
      amountMinor: largest.amountMinor.toString(),
      merchantName: largest.merchantId
        ? context.input.resolveName("merchant", largest.merchantId)
        : null,
    });
  }
  return insights;
}

function biggestIncrease(
  context: CategoryInsightsInput,
): CategoryAnalysisInsight | null {
  const candidates = [
    ...context.merchantComparisons
      .filter((entry) => entry.id !== UNKNOWN_MERCHANT_ID)
      .flatMap((entry) => {
        const name = context.input.resolveName("merchant", entry.id);
        return name
          ? [
              {
                dimension: "merchant" as const,
                id: entry.id,
                name,
                delta: entry.delta.spending.minor,
                previous: entry.previous.spending.minor,
              },
            ]
          : [];
      }),
    ...(context.subcategories ?? [])
      .filter((row) => !row.isDirect && row.name)
      .map((row) => ({
        dimension: "subcategory" as const,
        id: row.id,
        name: row.name!,
        delta: BigInt(row.deltaMinor),
        previous: BigInt(row.previousMinor),
      })),
  ]
    .filter((candidate) => candidate.delta > 0n)
    .sort(
      (left, right) =>
        compareBigintDescending(left.delta, right.delta) ||
        left.dimension.localeCompare(right.dimension) ||
        left.id.localeCompare(right.id),
    );
  const top = candidates[0];
  if (!top) return null;
  return {
    kind: "biggestIncrease",
    dimension: top.dimension,
    id: top.id,
    name: top.name,
    deltaMinor: top.delta.toString(),
    percentage: changePercentage(top.delta, top.previous),
  };
}

export function weeklySpending(
  entries: readonly MoneyTransaction[],
  period: Period,
  timeZone: string,
  currency: string,
): Array<{ firstDate: string; lastDate: string; spendingMinor: bigint }> {
  return weeklyBuckets(entries, period, timeZone).map((week) => ({
    firstDate: week.firstDate,
    lastDate: week.lastDate,
    spendingMinor: calculateTotals(week.entries, { currency }).spending.minor,
  }));
}

export function weeklyBuckets<T extends Pick<MoneyTransaction, "occurredAt">>(
  entries: readonly T[],
  period: Period,
  timeZone: string,
): Array<{ firstDate: string; lastDate: string; entries: T[] }> {
  const first = localDateForInstant(period.start, timeZone);
  const dayCount = countCalendarDays(period.start, period.end, timeZone);
  if (dayCount <= 0) return [];
  const firstUtc = Date.UTC(first.year, first.month - 1, first.day);
  const offset = (new Date(firstUtc).getUTCDay() + 6) % 7;
  const weekCount = Math.floor((dayCount - 1 + offset) / 7) + 1;
  const buckets: T[][] = Array.from({ length: weekCount }, () => []);
  for (const transaction of entries) {
    if (!inPeriod(transaction.occurredAt, period)) continue;
    const local = localDateForInstant(transaction.occurredAt, timeZone);
    const dayIndex = Math.round(
      (Date.UTC(local.year, local.month - 1, local.day) - firstUtc) /
        86_400_000,
    );
    buckets[Math.floor((dayIndex + offset) / 7)]?.push(transaction);
  }
  return buckets.map((bucket, week) => ({
    firstDate: localDateKey(
      addLocalDays(first, Math.max(0, week * 7 - offset)),
    ),
    lastDate: localDateKey(
      addLocalDays(first, Math.min(dayCount - 1, week * 7 + 6 - offset)),
    ),
    entries: bucket,
  }));
}

function strongestWeek(
  entries: readonly MoneyTransaction[],
  period: Period,
  timeZone: string,
  currency: string,
): { firstDate: string; lastDate: string; spendingMinor: string } | null {
  const weeks = weeklySpending(entries, period, timeZone, currency);
  if (weeks.length < 2) return null;
  const top = weeks.reduce<(typeof weeks)[number] | null>(
    (best, week) =>
      week.spendingMinor > 0n &&
      (!best || week.spendingMinor > best.spendingMinor)
        ? week
        : best,
    null,
  );
  return top
    ? {
        firstDate: top.firstDate,
        lastDate: top.lastDate,
        spendingMinor: top.spendingMinor.toString(),
      }
    : null;
}

function exclusions(
  inScope: readonly MoneyTransaction[],
  current: Period,
  currency: string,
): CategoryAnalysis["exclusions"] {
  let transferCount = 0;
  let pendingCount = 0;
  let otherCurrencyCount = 0;
  for (const transaction of currentMoneyTransactions(inScope)) {
    if (
      !inPeriod(transaction.occurredAt, current) ||
      transaction.kind === "INCOME"
    )
      continue;
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

function roundedAverage(total: bigint, count: number): bigint {
  if (count === 0) return 0n;
  const divisor = BigInt(count);
  const magnitude = total < 0n ? -total : total;
  const rounded = (magnitude * 2n + divisor) / (2n * divisor);
  return total < 0n ? -rounded : rounded;
}

function changePercentage(delta: bigint, previous: bigint): string | null {
  if (previous <= 0n) return null;
  const absolute = delta < 0n ? -delta : delta;
  return ((absolute * 100n + previous / 2n) / previous).toString();
}

function inPeriod(value: Date, period: Period): boolean {
  return value >= period.start && value < period.end;
}
