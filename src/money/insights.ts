import { createHash } from "node:crypto";

import {
  calculateDailyPace,
  comparePeriods,
  currentMoneyTransactions,
  type MoneyTransaction,
} from "./engine";
import { calendarMonthPeriod, type Period } from "./period";

export const INSIGHT_TYPES = [
  "CATEGORY_SPIKE",
  "CATEGORY_DROP",
  "MERCHANT_SPIKE",
  "SPENDING_PACE_HIGH",
  "SPENDING_PACE_LOW",
  "BUDGET_AT_RISK",
  "BUDGET_EXCEEDED",
  "RECURRING_PRICE_INCREASE",
  "NEW_RECURRING_PAYMENT",
  "POTENTIAL_SAVINGS",
  "GOAL_OFF_TRACK",
  "GOAL_ON_TRACK",
  "UNUSUAL_TRANSACTION",
  "MONTH_OVER_MONTH_CHANGE",
] as const;

export type InsightType = (typeof INSIGHT_TYPES)[number];

export const INSIGHT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

export type InsightData = Readonly<Record<string, string | number | boolean | null>>;

export interface InsightCandidate {
  readonly type: InsightType;
  readonly severity: InsightSeverity;
  readonly data: InsightData;
  readonly period: Period;
  readonly source: "MONEY_ENGINE";
  readonly fingerprint: string;
  readonly expiresAt: Date | null;
}

export interface InsightBudget {
  readonly id: string;
  readonly scope: "OVERALL" | "CATEGORY";
  readonly categoryId: string | null;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly status: "ACTIVE" | "ARCHIVED";
  readonly startsOn: Date;
  readonly endsOn: Date | null;
}

export interface InsightGoal {
  readonly id: string;
  readonly name: string;
  readonly targetAmountMinor: bigint;
  readonly currentSavedMinor: bigint;
  readonly currency: string;
  readonly targetDate: Date | null;
  readonly status: "ACTIVE" | "COMPLETED" | "PAUSED" | "ARCHIVED";
  readonly createdAt: Date;
}

export interface InsightRecurringPayment {
  readonly id: string;
  readonly normalizedMerchant: string;
  readonly typicalAmountMinor: bigint;
  readonly currency: string;
  readonly cadenceDays: number;
  readonly sampleTransactionIds: readonly string[];
  readonly status: "CANDIDATE" | "CONFIRMED" | "IGNORED";
  readonly firstOccurredAt: Date;
  readonly lastOccurredAt: Date;
}

export interface FinancialInsightInput {
  readonly currency: string;
  readonly timeZone: string;
  readonly now: Date;
  readonly transactions: readonly MoneyTransaction[];
  readonly budgets: readonly InsightBudget[];
  readonly goals: readonly InsightGoal[];
  readonly recurringPayments: readonly InsightRecurringPayment[];
  readonly merchantNames?: Readonly<Record<string, string>>;
}

const ONE_HUNDRED_BPS = 10_000n;
const SPIKE_BPS = 12_500n;
const DROP_BPS = 7_500n;
const BUDGET_RISK_BPS = 8_000n;
const PACE_HIGH_BPS = 11_000n;
const PACE_LOW_BPS = 8_000n;
const RECURRING_INCREASE_BPS = 11_000n;
const UNUSUAL_MULTIPLIER = 3n;
const MILLIS_PER_DAY = 86_400_000;


export function deriveInsightCandidates(input: FinancialInsightInput): InsightCandidate[] {
  assertValidInput(input);
  // Exclude append-only correction history from financial observations.
  const transactions = currentMoneyTransactions(input.transactions);
  const currentPeriod = calendarMonthPeriod(input.now, input.timeZone);
  const previousPeriod = calendarMonthPeriod(input.now, input.timeZone, -1);
  const comparison = comparePeriods(transactions, currentPeriod, previousPeriod, {
    currency: input.currency,
  });
  const current = comparison.current;
  const candidates: InsightCandidate[] = [];

  for (const category of comparison.categories) {
    const currentSpend = category.current.spending.minor;
    const previousSpend = category.previous.spending.minor;
    if (previousSpend <= 0n || currentSpend < 0n) continue;
    const ratio = ratioBps(currentSpend, previousSpend);
    if (ratio >= SPIKE_BPS) {
      const severity = ratio >= 20_000n ? "CRITICAL" : "WARNING";
      candidates.push(
        candidate("CATEGORY_SPIKE", severity, currentPeriod, `category:${category.id}`, {
          categoryId: category.id,
          currentMinor: currentSpend.toString(),
          previousMinor: previousSpend.toString(),
          changeMinor: (currentSpend - previousSpend).toString(),
          changeBps: ratio.toString(),
          currency: input.currency,
        }),
      );
      candidates.push(
        candidate("POTENTIAL_SAVINGS", severity, currentPeriod, `category:${category.id}`, {
          categoryId: category.id,
          currentMinor: currentSpend.toString(),
          baselineMinor: previousSpend.toString(),
          potentialSavingsMinor: (currentSpend - previousSpend).toString(),
          changeBps: ratio.toString(),
          currency: input.currency,
        }),
      );
    } else if (currentSpend > 0n && ratio <= DROP_BPS) {
      candidates.push(
        candidate("CATEGORY_DROP", "INFO", currentPeriod, `category:${category.id}`, {
          categoryId: category.id,
          currentMinor: currentSpend.toString(),
          previousMinor: previousSpend.toString(),
          changeMinor: (currentSpend - previousSpend).toString(),
          changeBps: ratio.toString(),
          currency: input.currency,
        }),
      );
    }
  }

  for (const merchant of comparison.merchants) {
    const currentSpend = merchant.current.spending.minor;
    const previousSpend = merchant.previous.spending.minor;
    if (previousSpend <= 0n || currentSpend < 0n) continue;
    const ratio = ratioBps(currentSpend, previousSpend);
    if (ratio >= SPIKE_BPS) {
      candidates.push(
        candidate("MERCHANT_SPIKE", ratio >= 20_000n ? "CRITICAL" : "WARNING", currentPeriod, `merchant:${merchant.id}`, {
          merchantId: merchant.id,
          merchantName: input.merchantNames?.[merchant.id] ?? null,
          currentMinor: currentSpend.toString(),
          previousMinor: previousSpend.toString(),
          changeMinor: (currentSpend - previousSpend).toString(),
          changeBps: ratio.toString(),
          currency: input.currency,
        }),
      );
    }
  }

  const currentSpend = current.totals.spending.minor;
  const previousSpend = comparison.previous.totals.spending.minor;
  if (previousSpend > 0n && currentSpend >= 0n) {
    const ratio = ratioBps(currentSpend, previousSpend);
    if (ratio >= SPIKE_BPS || ratio <= DROP_BPS) {
      candidates.push(
        candidate("MONTH_OVER_MONTH_CHANGE", ratio >= SPIKE_BPS ? "WARNING" : "INFO", currentPeriod, "overall", {
          direction: ratio >= SPIKE_BPS ? "UP" : "DOWN",
          currentMinor: currentSpend.toString(),
          previousMinor: previousSpend.toString(),
          changeMinor: (currentSpend - previousSpend).toString(),
          changeBps: ratio.toString(),
          currency: input.currency,
        }),
      );
    }
  }

  const activeBudgets = input.budgets.filter((budget) => isBudgetActiveForPeriod(budget, currentPeriod));
  for (const budget of activeBudgets) {
    assertCurrency(input.currency, budget.currency, `budget ${budget.id}`);
    const spent = budget.scope === "OVERALL"
      ? currentSpend
      : current.categories.find((summary) => summary.id === budget.categoryId)?.spending.minor ?? 0n;
    const usedBps = ratioBps(spent, budget.amountMinor);
    const budgetData = {
      budgetId: budget.id,
      scope: budget.scope,
      categoryId: budget.categoryId,
      spentMinor: spent.toString(),
      budgetMinor: budget.amountMinor.toString(),
      remainingMinor: (budget.amountMinor - spent).toString(),
      usedBps: usedBps.toString(),
      currency: input.currency,
    };
    if (spent >= budget.amountMinor) {
      candidates.push(candidate("BUDGET_EXCEEDED", "CRITICAL", currentPeriod, `budget:${budget.id}`, budgetData));
    } else if (usedBps >= BUDGET_RISK_BPS) {
      candidates.push(candidate("BUDGET_AT_RISK", "WARNING", currentPeriod, `budget:${budget.id}`, budgetData));
    }
  }

  const overallBudget = activeBudgets.find((budget) => budget.scope === "OVERALL");
  if (overallBudget) {
    const pace = calculateDailyPace(transactions, currentPeriod, input.timeZone, {
      currency: input.currency,
      now: input.now,
    });
    if (pace.elapsedDayCount >= 2) {
      const expectedSpend = (overallBudget.amountMinor * BigInt(pace.elapsedDayCount)) / BigInt(pace.totalDayCount);
      if (expectedSpend > 0n) {
        const paceBps = ratioBps(currentSpend, expectedSpend);
        const data = {
          budgetId: overallBudget.id,
          spentMinor: currentSpend.toString(),
          expectedMinor: expectedSpend.toString(),
          budgetMinor: overallBudget.amountMinor.toString(),
          paceBps: paceBps.toString(),
          elapsedDayCount: pace.elapsedDayCount,
          totalDayCount: pace.totalDayCount,
          currency: input.currency,
        };
        if (paceBps >= PACE_HIGH_BPS) {
          candidates.push(candidate("SPENDING_PACE_HIGH", paceBps >= 13_000n ? "CRITICAL" : "WARNING", currentPeriod, "overall", data));
        } else if (paceBps <= PACE_LOW_BPS) {
          candidates.push(candidate("SPENDING_PACE_LOW", "INFO", currentPeriod, "overall", data));
        }
      }
    }
  }

  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  for (const recurring of input.recurringPayments) {
    if (recurring.status === "IGNORED") continue;
    assertCurrency(input.currency, recurring.currency, `recurring payment ${recurring.id}`);
    const samples = recurring.sampleTransactionIds
      .map((id) => transactionById.get(id))
      .filter((transaction): transaction is MoneyTransaction => Boolean(transaction))
      .filter((transaction) => transaction.kind === "EXPENSE" && transaction.status === "POSTED")
      .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
    const latest = samples.at(-1);
    const earlier = samples.slice(0, -1).map((transaction) => transaction.amountMinor);
    if (latest && earlier.length >= 2) {
      const baseline = median(earlier);
      const ratio = ratioBps(latest.amountMinor, baseline);
      if (ratio >= RECURRING_INCREASE_BPS) {
        candidates.push(
          candidate("RECURRING_PRICE_INCREASE", "WARNING", currentPeriod, `recurring:${recurring.id}:${latest.id}`, {
            recurringPaymentId: recurring.id,
            transactionId: latest.id,
            merchant: recurring.normalizedMerchant,
            currentMinor: latest.amountMinor.toString(),
            baselineMinor: baseline.toString(),
            changeMinor: (latest.amountMinor - baseline).toString(),
            changeBps: ratio.toString(),
            currency: input.currency,
          }),
        );
      }
    }
    if (recurring.status === "CANDIDATE" && inPeriod(recurring.lastOccurredAt, currentPeriod)) {
      candidates.push(
        candidate("NEW_RECURRING_PAYMENT", "INFO", currentPeriod, `recurring:${recurring.id}`, {
          recurringPaymentId: recurring.id,
          merchant: recurring.normalizedMerchant,
          typicalAmountMinor: recurring.typicalAmountMinor.toString(),
          cadenceDays: recurring.cadenceDays,
          firstOccurredAt: recurring.firstOccurredAt.toISOString(),
          lastOccurredAt: recurring.lastOccurredAt.toISOString(),
          currency: input.currency,
        }),
      );
    }
  }

  for (const goal of input.goals) {
    if (goal.status !== "ACTIVE" || !goal.targetDate || goal.targetDate <= goal.createdAt) continue;
    assertCurrency(input.currency, goal.currency, `goal ${goal.id}`);
    const totalDays = Math.max(1, Math.ceil((goal.targetDate.getTime() - goal.createdAt.getTime()) / MILLIS_PER_DAY));
    const elapsedDays = Math.min(totalDays, Math.max(0, Math.ceil((input.now.getTime() - goal.createdAt.getTime()) / MILLIS_PER_DAY)));
    if (elapsedDays === 0) continue;
    const expectedSaved = (goal.targetAmountMinor * BigInt(elapsedDays)) / BigInt(totalDays);
    const paceBps = expectedSaved === 0n ? ONE_HUNDRED_BPS : ratioBps(goal.currentSavedMinor, expectedSaved);
    const data = {
      goalId: goal.id,
      goalName: goal.name,
      currentSavedMinor: goal.currentSavedMinor.toString(),
      expectedSavedMinor: expectedSaved.toString(),
      targetMinor: goal.targetAmountMinor.toString(),
      remainingMinor: (goal.targetAmountMinor - goal.currentSavedMinor).toString(),
      paceBps: paceBps.toString(),
      targetDate: goal.targetDate.toISOString(),
      currency: input.currency,
    };
    if (goal.currentSavedMinor < expectedSaved) {
      candidates.push(candidate("GOAL_OFF_TRACK", "WARNING", currentPeriod, `goal:${goal.id}`, data));
    } else {
      candidates.push(candidate("GOAL_ON_TRACK", "INFO", currentPeriod, `goal:${goal.id}`, data));
    }
  }

  const unusualStart = new Date(input.now.getTime() - 7 * MILLIS_PER_DAY);
  const baselineStart = new Date(input.now.getTime() - 97 * MILLIS_PER_DAY);
  const expenses = transactions.filter(
    (transaction) => transaction.kind === "EXPENSE" && transaction.status === "POSTED",
  );
  for (const transaction of expenses.filter((entry) => entry.occurredAt >= unusualStart && entry.occurredAt <= input.now)) {
    const historical = expenses
      .filter(
        (entry) =>
          entry.id !== transaction.id &&
          entry.occurredAt >= baselineStart &&
          entry.occurredAt < unusualStart &&
          entry.categoryId === transaction.categoryId,
      )
      .map((entry) => entry.amountMinor);
    if (historical.length < 3) continue;
    const baseline = median(historical);
    if (transaction.amountMinor >= baseline * UNUSUAL_MULTIPLIER) {
      candidates.push(
        candidate("UNUSUAL_TRANSACTION", "WARNING", currentPeriod, `transaction:${transaction.id}`, {
          transactionId: transaction.id,
          categoryId: transaction.categoryId,
          merchantId: transaction.merchantId,
          amountMinor: transaction.amountMinor.toString(),
          baselineMinor: baseline.toString(),
          multipleBps: ratioBps(transaction.amountMinor, baseline).toString(),
          currency: input.currency,
        }),
      );
    }
  }

  return candidates.sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
}

function candidate(
  type: InsightType,
  severity: InsightSeverity,
  period: Period,
  identity: string,
  data: InsightData,
): InsightCandidate {
  return {
    type,
    severity,
    data,
    period,
    source: "MONEY_ENGINE",
    fingerprint: createHash("sha256")
      .update(`pace-insight-v1|${type}|${period.start.toISOString()}|${identity}`)
      .digest("hex"),
    expiresAt: new Date(period.end),
  };
}

function ratioBps(value: bigint, baseline: bigint): bigint {
  if (baseline <= 0n) throw new Error("Insight baselines must be positive.");
  return (value * ONE_HUNDRED_BPS) / baseline;
}

function median(values: readonly bigint[]): bigint {
  if (values.length === 0) throw new Error("A median requires at least one value.");
  const sorted = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2n;
}

function inPeriod(value: Date, period: Period): boolean {
  return value >= period.start && value < period.end;
}

function isBudgetActiveForPeriod(budget: InsightBudget, period: Period): boolean {
  return budget.status === "ACTIVE" && budget.startsOn < period.end && (!budget.endsOn || budget.endsOn >= period.start);
}

function assertCurrency(expected: string, actual: string, label: string): void {
  if (expected !== actual) throw new Error(`Insight ${label} currency does not match the workspace currency.`);
}

function assertValidInput(input: FinancialInsightInput): void {
  if (!Number.isFinite(input.now.getTime())) throw new Error("Insight input now must be a valid instant.");
  for (const transaction of input.transactions) assertCurrency(input.currency, transaction.currency, `transaction ${transaction.id}`);
}
