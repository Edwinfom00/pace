import {
  currentMoneyTransactions,
  UNCATEGORIZED_CATEGORY_ID,
  UNKNOWN_MERCHANT_ID,
  type MoneyTransaction,
} from "@/money";
import {
  countCalendarDays,
  localDateForInstant,
  localDateKey,
  type Period,
} from "@/money/period";
import type { LedgerAccountType } from "@/modules/ledger/domain";

import { weeklyBuckets } from "../category/category-analysis";
import {
  addLocalDays,
  compareBigintDescending,
  insightsWindows,
  metric,
  serializeWindow,
  shareBps,
  type InsightsNameResolver,
  type InsightsWindows,
} from "../overview/insights-overview";
import type { InsightsRange } from "../overview/insights-overview.types";
import type {
  AccountAnalysis,
  AccountAnalysisCategory,
  AccountAnalysisComposition,
  AccountAnalysisCounterparty,
  AccountAnalysisInsight,
  AccountAnalysisTransaction,
  AccountBalancePoint,
  AccountMovementKind,
  InsightsAccountSummary,
} from "./account-analysis.types";

export interface AccountLedgerEntry extends MoneyTransaction {
  readonly accountId: string | null;
  readonly transferAccountId: string | null;
}

export interface AccountAnalysisAccount {
  readonly id: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly currency: string;
  readonly archivedAt: Date | null;
}

export interface BuildAccountAnalysisInput {
  readonly transactions: readonly AccountLedgerEntry[];
  readonly account: AccountAnalysisAccount;
  readonly balance: {
    readonly currentBalanceMinor: bigint;
    readonly availableBalanceMinor: bigint;
    readonly spendabilityMode: "ZERO_FLOOR" | "UNSUPPORTED";
  };
  readonly openingBalance: {
    readonly amountMinor: bigint;
    readonly occurredAt: Date;
  } | null;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly range: InsightsRange;
  readonly periodKey: string | undefined;
  readonly now: Date;
  readonly resolveName: InsightsNameResolver;
  readonly resolveAccountName: (accountId: string) => string | null;
}

interface AccountMovement {
  readonly entry: AccountLedgerEntry;
  readonly kind: AccountMovementKind;
  readonly signedMinor: bigint;
}

const CATEGORY_LIMIT = 6;
const COUNTERPARTY_LIMIT = 6;
const TRANSACTION_LIMIT = 12;
const UNUSUAL_MINIMUM_MOVEMENTS = 4;
const UNUSUAL_MULTIPLE = 3n;
const RECURRING_THRESHOLD_BPS = 3_000;

export function accountMovement(
  entry: AccountLedgerEntry,
  accountId: string,
): Pick<AccountMovement, "kind" | "signedMinor"> | null {
  if (entry.kind === "TRANSFER") {
    if (entry.accountId === accountId)
      return { kind: "TRANSFER_OUT", signedMinor: -entry.amountMinor };
    if (entry.transferAccountId === accountId)
      return { kind: "TRANSFER_IN", signedMinor: entry.amountMinor };
    return null;
  }
  if (entry.accountId !== accountId) return null;
  if (entry.kind === "EXPENSE")
    return { kind: "EXPENSE", signedMinor: -entry.amountMinor };
  return { kind: entry.kind, signedMinor: entry.amountMinor };
}

function accountMovements(
  effective: readonly AccountLedgerEntry[],
  accountId: string,
  currency: string,
): AccountMovement[] {
  return effective.flatMap((entry) => {
    if (entry.status !== "POSTED" || entry.currency !== currency) return [];
    const movement = accountMovement(entry, accountId);
    return movement ? [{ entry, ...movement }] : [];
  });
}

export function buildAccountAnalysis(
  input: BuildAccountAnalysisInput,
): AccountAnalysis {
  const windows = insightsWindows(
    input.periodKey,
    input.range,
    input.timeZone,
    input.now,
  );
  const { account } = input;
  const currency = account.currency;
  const byId = new Map(
    input.transactions.map((transaction) => [transaction.id, transaction]),
  );
  const effective = currentMoneyTransactions(input.transactions);
  const movements = accountMovements(effective, account.id, currency);
  const current = movements.filter((movement) =>
    inPeriod(movement.entry.occurredAt, windows.current),
  );
  const previous = movements.filter((movement) =>
    inPeriod(movement.entry.occurredAt, windows.previous),
  );
  const currentFlows = flows(current);
  const previousFlows = flows(previous);
  const balance = balanceTrend(movements, input, windows);

  return {
    account: {
      id: account.id,
      name: account.name,
      type: account.type,
      currency,
      status: account.archivedAt ? "ARCHIVED" : "ACTIVE",
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
    hasActivity: current.length + previous.length > 0,
    balances: {
      periodOpeningMinor: balance.openingMinor.toString(),
      periodClosingMinor: balance.closingMinor.toString(),
      currentMinor: input.balance.currentBalanceMinor.toString(),
      availableMinor:
        input.balance.spendabilityMode === "ZERO_FLOOR"
          ? input.balance.availableBalanceMinor.toString()
          : null,
      openingBalance: input.openingBalance
        ? {
            amountMinor: input.openingBalance.amountMinor.toString(),
            date: localDateKey(
              localDateForInstant(
                input.openingBalance.occurredAt,
                input.timeZone,
              ),
            ),
          }
        : null,
    },
    kpis: {
      inflows: metric(currentFlows.inflows, previousFlows.inflows, "higher"),
      outflows: metric(currentFlows.outflows, previousFlows.outflows, "lower"),
      net: metric(
        currentFlows.inflows - currentFlows.outflows,
        previousFlows.inflows - previousFlows.outflows,
        "higher",
      ),
      transactionCount: { current: current.length, previous: previous.length },
    },
    composition: composition(current),
    balanceTrend: {
      hasMovement: balance.hasMovement,
      points: balance.points,
    },
    categories: categoryBreakdown(current, previous, byId, input.resolveName),
    counterparties: counterparties(current, byId, input),
    transactions: {
      items: contributingTransactions(current, byId, input),
      totalCount: current.length,
      transferCount: current.filter(
        (movement) =>
          movement.kind === "TRANSFER_IN" || movement.kind === "TRANSFER_OUT",
      ).length,
    },
    insights: accountInsights({
      current,
      outflows: currentFlows.outflows,
      balance,
      byId,
      input,
      windows,
    }),
    exclusions: exclusions(effective, account.id, currency, windows.current),
  };
}

function flows(movements: readonly AccountMovement[]): {
  inflows: bigint;
  outflows: bigint;
} {
  let inflows = 0n;
  let outflows = 0n;
  for (const { signedMinor } of movements) {
    if (signedMinor > 0n) inflows += signedMinor;
    else outflows -= signedMinor;
  }
  return { inflows, outflows };
}

function composition(
  movements: readonly AccountMovement[],
): AccountAnalysisComposition {
  const totals: Record<AccountMovementKind, bigint> = {
    INCOME: 0n,
    REFUND: 0n,
    TRANSFER_IN: 0n,
    EXPENSE: 0n,
    TRANSFER_OUT: 0n,
  };
  for (const movement of movements)
    totals[movement.kind] += abs(movement.signedMinor);
  return {
    incomeMinor: totals.INCOME.toString(),
    refundsMinor: totals.REFUND.toString(),
    transfersInMinor: totals.TRANSFER_IN.toString(),
    expensesMinor: totals.EXPENSE.toString(),
    transfersOutMinor: totals.TRANSFER_OUT.toString(),
  };
}

interface BalanceTrend {
  readonly openingMinor: bigint;
  readonly closingMinor: bigint;
  readonly hasMovement: boolean;
  readonly points: AccountBalancePoint[];
  readonly lowest: {
    readonly date: string;
    readonly balanceMinor: bigint;
  } | null;
}

// Reversals carry the occurredAt of the entry they reverse, so replaying only
// effective entries reproduces the canonical posted balance on every day.
function balanceTrend(
  movements: readonly AccountMovement[],
  input: BuildAccountAnalysisInput,
  windows: InsightsWindows,
): BalanceTrend {
  const { timeZone } = input;
  const period = windows.currentFull;
  const deltas = new Map<string, bigint>();
  let openingMinor = 0n;
  const apply = (occurredAt: Date, minor: bigint) => {
    if (occurredAt < period.start) {
      openingMinor += minor;
      return;
    }
    if (occurredAt >= period.end) return;
    const key = localDateKey(localDateForInstant(occurredAt, timeZone));
    deltas.set(key, (deltas.get(key) ?? 0n) + minor);
  };
  if (input.openingBalance)
    apply(input.openingBalance.occurredAt, input.openingBalance.amountMinor);
  for (const movement of movements)
    apply(movement.entry.occurredAt, movement.signedMinor);

  const lastActualDate = windows.isPartial
    ? localDateKey(localDateForInstant(input.now, timeZone))
    : null;
  const isFuture = period.start > input.now;
  const first = localDateForInstant(period.start, timeZone);
  const dayCount = countCalendarDays(period.start, period.end, timeZone);
  let running = openingMinor;
  let closingMinor = openingMinor;
  let lowest: BalanceTrend["lowest"] = null;
  const points = Array.from({ length: dayCount }, (_, index) => {
    const date = localDateKey(addLocalDays(first, index));
    if (isFuture || (lastActualDate !== null && date > lastActualDate))
      return { date, balanceMinor: null };
    running += deltas.get(date) ?? 0n;
    closingMinor = running;
    if (!lowest || running < lowest.balanceMinor)
      lowest = { date, balanceMinor: running };
    return { date, balanceMinor: running.toString() };
  });
  return {
    openingMinor,
    closingMinor,
    hasMovement: !isFuture && (openingMinor !== 0n || deltas.size > 0),
    points,
    lowest,
  };
}

function attributedExpense(
  entry: AccountLedgerEntry,
  byId: ReadonlyMap<string, AccountLedgerEntry>,
): AccountLedgerEntry {
  if (entry.kind !== "REFUND" || !entry.refundedTransactionId) return entry;
  return byId.get(entry.refundedTransactionId) ?? entry;
}

function categoryTotals(
  movements: readonly AccountMovement[],
  byId: ReadonlyMap<string, AccountLedgerEntry>,
): Map<string, { spending: bigint; count: number }> {
  const totals = new Map<string, { spending: bigint; count: number }>();
  for (const { entry, kind } of movements) {
    if (kind !== "EXPENSE" && kind !== "REFUND") continue;
    const id =
      attributedExpense(entry, byId).categoryId ?? UNCATEGORIZED_CATEGORY_ID;
    const total = totals.get(id) ?? { spending: 0n, count: 0 };
    total.spending +=
      kind === "EXPENSE" ? entry.amountMinor : -entry.amountMinor;
    total.count += 1;
    totals.set(id, total);
  }
  return totals;
}

function categoryBreakdown(
  current: readonly AccountMovement[],
  previous: readonly AccountMovement[],
  byId: ReadonlyMap<string, AccountLedgerEntry>,
  resolveName: InsightsNameResolver,
): AccountAnalysis["categories"] {
  const previousTotals = categoryTotals(previous, byId);
  const spending = [...categoryTotals(current, byId).entries()]
    .filter(([, total]) => total.spending > 0n)
    .map(([id, total]) => ({
      id,
      name: resolveName("category", id) ?? id,
      ...total,
    }))
    .sort(
      (left, right) =>
        compareBigintDescending(left.spending, right.spending) ||
        left.name.localeCompare(right.name),
    );
  const total = spending.reduce((sum, entry) => sum + entry.spending, 0n);
  const visible =
    spending.length > CATEGORY_LIMIT + 1
      ? spending.slice(0, CATEGORY_LIMIT)
      : spending;
  const rest = spending.slice(visible.length);
  const restTotal = rest.reduce((sum, entry) => sum + entry.spending, 0n);
  return {
    totalMinor: total.toString(),
    items: visible.map(
      (entry): AccountAnalysisCategory => ({
        id: entry.id,
        name: entry.name,
        spendingMinor: entry.spending.toString(),
        previousSpendingMinor: (
          previousTotals.get(entry.id)?.spending ?? 0n
        ).toString(),
        shareBps: shareBps(entry.spending, total),
        transactionCount: entry.count,
        isUncategorized: entry.id === UNCATEGORIZED_CATEGORY_ID,
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

function counterpartyOf(
  movement: AccountMovement,
  byId: ReadonlyMap<string, AccountLedgerEntry>,
): { id: string; kind: "merchant" | "account" } {
  const { entry, kind } = movement;
  if (kind === "TRANSFER_OUT")
    return { id: entry.transferAccountId!, kind: "account" };
  if (kind === "TRANSFER_IN") return { id: entry.accountId!, kind: "account" };
  return {
    id:
      entry.merchantId ??
      attributedExpense(entry, byId).merchantId ??
      UNKNOWN_MERCHANT_ID,
    kind: "merchant",
  };
}

function counterpartyName(
  counterparty: { id: string; kind: "merchant" | "account" },
  input: BuildAccountAnalysisInput,
): string | null {
  if (counterparty.kind === "account")
    return input.resolveAccountName(counterparty.id);
  return counterparty.id === UNKNOWN_MERCHANT_ID
    ? null
    : input.resolveName("merchant", counterparty.id);
}

function counterparties(
  movements: readonly AccountMovement[],
  byId: ReadonlyMap<string, AccountLedgerEntry>,
  input: BuildAccountAnalysisInput,
): AccountAnalysisCounterparty[] {
  const totals = new Map<
    string,
    {
      id: string;
      kind: "merchant" | "account";
      inflow: bigint;
      outflow: bigint;
      count: number;
    }
  >();
  let gross = 0n;
  for (const movement of movements) {
    const counterparty = counterpartyOf(movement, byId);
    const key = `${counterparty.kind}:${counterparty.id}`;
    const total = totals.get(key) ?? {
      ...counterparty,
      inflow: 0n,
      outflow: 0n,
      count: 0,
    };
    if (movement.signedMinor > 0n) total.inflow += movement.signedMinor;
    else total.outflow -= movement.signedMinor;
    total.count += 1;
    gross += abs(movement.signedMinor);
    totals.set(key, total);
  }
  return [...totals.values()]
    .sort(
      (left, right) =>
        compareBigintDescending(
          left.inflow + left.outflow,
          right.inflow + right.outflow,
        ) ||
        left.kind.localeCompare(right.kind) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, COUNTERPARTY_LIMIT)
    .map((total) => ({
      id: total.id,
      kind: total.kind,
      name: counterpartyName(total, input),
      inflowMinor: total.inflow.toString(),
      outflowMinor: total.outflow.toString(),
      shareBps: shareBps(total.inflow + total.outflow, gross),
      transactionCount: total.count,
    }));
}

function newestFirst(left: AccountMovement, right: AccountMovement): number {
  return (
    right.entry.occurredAt.getTime() - left.entry.occurredAt.getTime() ||
    left.entry.id.localeCompare(right.entry.id)
  );
}

function contributingTransactions(
  movements: readonly AccountMovement[],
  byId: ReadonlyMap<string, AccountLedgerEntry>,
  input: BuildAccountAnalysisInput,
): AccountAnalysisTransaction[] {
  return [...movements]
    .sort(newestFirst)
    .slice(0, TRANSACTION_LIMIT)
    .map((movement) => {
      const isTransfer =
        movement.kind === "TRANSFER_IN" || movement.kind === "TRANSFER_OUT";
      const counterparty = counterpartyOf(movement, byId);
      const categoryId = isTransfer
        ? null
        : (attributedExpense(movement.entry, byId).categoryId ??
          UNCATEGORIZED_CATEGORY_ID);
      return {
        id: movement.entry.id,
        movement: movement.kind,
        date: localDateKey(
          localDateForInstant(movement.entry.occurredAt, input.timeZone),
        ),
        signedMinor: movement.signedMinor.toString(),
        merchantName: isTransfer ? null : counterpartyName(counterparty, input),
        counterpartyAccountName: isTransfer
          ? counterpartyName(counterparty, input)
          : null,
        categoryName: categoryId
          ? input.resolveName("category", categoryId)
          : null,
      };
    });
}

function accountInsights({
  balance,
  byId,
  current,
  input,
  outflows,
  windows,
}: {
  readonly current: readonly AccountMovement[];
  readonly outflows: bigint;
  readonly balance: BalanceTrend;
  readonly byId: ReadonlyMap<string, AccountLedgerEntry>;
  readonly input: BuildAccountAnalysisInput;
  readonly windows: InsightsWindows;
}): AccountAnalysisInsight[] {
  const insights: AccountAnalysisInsight[] = [];
  const week = strongestOutflowWeek(current, windows.current, input.timeZone);
  if (week && outflows > 0n)
    insights.push({
      kind: "strongestOutflowWeek",
      firstDate: week.firstDate,
      lastDate: week.lastDate,
      outflowMinor: week.outflow.toString(),
      shareBps: shareBps(week.outflow, outflows),
    });

  const unusual = unusualMovement(current);
  if (unusual)
    insights.push({
      kind: "unusualMovement",
      transactionId: unusual.movement.entry.id,
      date: localDateKey(
        localDateForInstant(unusual.movement.entry.occurredAt, input.timeZone),
      ),
      direction: unusual.movement.signedMinor > 0n ? "inflow" : "outflow",
      amountMinor: abs(unusual.movement.signedMinor).toString(),
      multiple: unusual.multiple,
      counterpartyName: counterpartyName(
        counterpartyOf(unusual.movement, byId),
        input,
      ),
    });

  const recurring = repeatPayees(current);
  if (
    recurring.payeeCount > 0 &&
    outflows > 0n &&
    shareBps(recurring.amount, outflows) >= RECURRING_THRESHOLD_BPS
  )
    insights.push({
      kind: "recurringConcentration",
      payeeCount: recurring.payeeCount,
      amountMinor: recurring.amount.toString(),
      shareBps: shareBps(recurring.amount, outflows),
    });

  if (
    balance.lowest &&
    current.length > 0 &&
    balance.lowest.balanceMinor < balance.openingMinor &&
    balance.lowest.balanceMinor < balance.closingMinor
  )
    insights.push({
      kind: "lowestBalance",
      date: balance.lowest.date,
      balanceMinor: balance.lowest.balanceMinor.toString(),
    });
  return insights;
}

function strongestOutflowWeek(
  movements: readonly AccountMovement[],
  period: Period,
  timeZone: string,
): { firstDate: string; lastDate: string; outflow: bigint } | null {
  const outgoing = movements
    .filter((movement) => movement.signedMinor < 0n)
    .map((movement) => ({
      occurredAt: movement.entry.occurredAt,
      minor: -movement.signedMinor,
    }));
  const weeks = weeklyBuckets(outgoing, period, timeZone);
  if (weeks.length < 2) return null;
  let top: { firstDate: string; lastDate: string; outflow: bigint } | null =
    null;
  for (const week of weeks) {
    const outflow = week.entries.reduce((sum, entry) => sum + entry.minor, 0n);
    if (outflow > 0n && (!top || outflow > top.outflow))
      top = { firstDate: week.firstDate, lastDate: week.lastDate, outflow };
  }
  return top;
}

function unusualMovement(
  movements: readonly AccountMovement[],
): { movement: AccountMovement; multiple: number } | null {
  if (movements.length < UNUSUAL_MINIMUM_MOVEMENTS) return null;
  const sizes = movements
    .map((movement) => abs(movement.signedMinor))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(sizes.length / 2);
  const median =
    sizes.length % 2 === 1
      ? sizes[middle]!
      : (sizes[middle - 1]! + sizes[middle]!) / 2n;
  if (median <= 0n) return null;
  const largest = [...movements].sort(
    (left, right) =>
      compareBigintDescending(abs(left.signedMinor), abs(right.signedMinor)) ||
      newestFirst(left, right),
  )[0]!;
  const size = abs(largest.signedMinor);
  if (size < median * UNUSUAL_MULTIPLE) return null;
  return { movement: largest, multiple: Number(size / median) };
}

function repeatPayees(movements: readonly AccountMovement[]): {
  payeeCount: number;
  amount: bigint;
} {
  const payees = new Map<string, { count: number; amount: bigint }>();
  for (const { entry, kind } of movements) {
    if (kind !== "EXPENSE" || !entry.merchantId) continue;
    const payee = payees.get(entry.merchantId) ?? { count: 0, amount: 0n };
    payee.count += 1;
    payee.amount += entry.amountMinor;
    payees.set(entry.merchantId, payee);
  }
  const repeated = [...payees.values()].filter((payee) => payee.count >= 2);
  return {
    payeeCount: repeated.length,
    amount: repeated.reduce((sum, payee) => sum + payee.amount, 0n),
  };
}

function exclusions(
  effective: readonly AccountLedgerEntry[],
  accountId: string,
  currency: string,
  current: Period,
): AccountAnalysis["exclusions"] {
  let pendingCount = 0;
  let otherCurrencyCount = 0;
  for (const entry of effective) {
    if (
      !inPeriod(entry.occurredAt, current) ||
      !accountMovement(entry, accountId)
    )
      continue;
    if (entry.currency !== currency) {
      if (entry.status === "POSTED") otherCurrencyCount += 1;
    } else if (entry.status === "PENDING") {
      pendingCount += 1;
    }
  }
  return { pendingCount, otherCurrencyCount };
}

export function summarizeAccounts(input: {
  readonly transactions: readonly AccountLedgerEntry[];
  readonly accounts: readonly AccountAnalysisAccount[];
  readonly currency: string;
  readonly period: Period;
  readonly limit: number;
}): InsightsAccountSummary[] {
  const effective = currentMoneyTransactions(input.transactions).filter(
    (entry) => inPeriod(entry.occurredAt, input.period),
  );
  return input.accounts
    .filter((account) => account.currency === input.currency)
    .map((account) => {
      const movements = accountMovements(effective, account.id, input.currency);
      const { inflows, outflows } = flows(movements);
      return { account, inflows, outflows, count: movements.length };
    })
    .filter(({ account, count }) => !account.archivedAt || count > 0)
    .sort(
      (left, right) =>
        compareBigintDescending(
          left.inflows + left.outflows,
          right.inflows + right.outflows,
        ) || left.account.name.localeCompare(right.account.name),
    )
    .slice(0, input.limit)
    .map(({ account, inflows, outflows, count }) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      inflowsMinor: inflows.toString(),
      outflowsMinor: outflows.toString(),
      netMinor: (inflows - outflows).toString(),
      transactionCount: count,
    }));
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function inPeriod(value: Date, period: Period): boolean {
  return value >= period.start && value < period.end;
}
