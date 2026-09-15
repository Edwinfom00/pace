import assert from "node:assert/strict";
import test from "node:test";

import type { MoneyTransaction } from "@/money";
import { periodForLocalDates } from "@/money/period";
import {
  buildOverviewFinancialSummary,
  overviewPeriodFromKey,
} from "@/modules/overview/domain/overview-financial-summary";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import { parseOverviewFilter } from "@/modules/overview/domain/overview.types";
import { nextOverviewFilterFromKey } from "@/modules/overview/ui/components/overview-filters";
import { shiftOverviewPeriodKey } from "@/modules/overview/ui/components/overview-period-controls";
import { visibleOverviewChartDays } from "@/modules/overview/ui/components/spending-pace-chart";

const timeZone = "UTC";
const february = periodForLocalDates("2026-02-01", "2026-03-01", timeZone);
const now = new Date("2026-02-14T12:00:00.000Z");

function entry(
  id: string,
  kind: MoneyTransaction["kind"],
  amountMinor: bigint,
  occurredOn: string,
): MoneyTransaction {
  return {
    id,
    kind,
    status: "POSTED",
    amountMinor,
    currency: "XAF",
    occurredAt: new Date(`${occurredOn}T12:00:00.000Z`),
    categoryId: kind === "TRANSFER" ? null : "category",
    merchantId: null,
    refundedTransactionId: kind === "REFUND" ? "expense-1" : null,
  };
}

const transactions = [
  entry("expense-1", "EXPENSE", 100_000n, "2026-02-01"),
  entry("refund-1", "REFUND", 30_000n, "2026-02-03"),
  entry("income-current", "INCOME", 50_000n, "2026-02-04"),
  entry("transfer-current", "TRANSFER", 25_000n, "2026-02-05"),
  entry("expense-previous", "EXPENSE", 100_000n, "2026-01-05"),
  entry("income-previous", "INCOME", 100_000n, "2026-01-05"),
  entry("transfer-previous", "TRANSFER", 10_000n, "2026-01-06"),
  entry("expense-december", "EXPENSE", 80_000n, "2025-12-10"),
  entry("expense-november", "EXPENSE", 120_000n, "2025-11-18"),
] as const;

function summary(filter: "ALL" | "EXPENSE" | "INCOME" | "TRANSFER" = "ALL") {
  return buildOverviewFinancialSummary({
    filter,
    currency: "XAF",
    locale: "fr-CM",
    now,
    period: february,
    timeZone,
    transactions,
  });
}

test("ALL and EXPENSE use Money Engine spending, excluding transfers and applying refunds", () => {
  const all = summary();
  const expense = summary("EXPENSE");

  assert.equal(all.primary.minor, "70000");
  assert.equal(expense.primary.minor, "70000");
  assert.equal(all.primary.trend?.direction, "down");
  assert.equal(all.primary.trend?.sentiment, "positive");
  assert.equal(all.primary.trend?.percentage, "30");
  assert.equal(all.pace.minor, "5000");
  assert.equal(all.expectedMonth.minor, "140000");
});

test("INCOME and TRANSFER retain their own semantics and never fabricate a spending pace", () => {
  const income = summary("INCOME");
  const transfer = summary("TRANSFER");

  assert.equal(income.primary.minor, "50000");
  assert.equal(income.primary.trend?.direction, "down");
  assert.equal(income.primary.trend?.sentiment, "negative");
  assert.equal(income.pace.availability, "not-applicable");
  assert.equal(income.spendingPace.availability, "not-applicable");
  assert.equal(transfer.primary.minor, "25000");
  assert.equal(transfer.pace.availability, "not-applicable");
  assert.equal(transfer.expectedMonth.availability, "not-applicable");
});

test("cumulative chart keeps every selected-month day, stops actual data after today, and exposes a real current-day marker", () => {
  const pace = summary().spendingPace;

  assert.equal(pace.points.length, 28);
  assert.equal(pace.currentDay, 14);
  assert.equal(pace.points[0]?.actualMinor, "100000");
  assert.equal(pace.points[1]?.actualMinor, "100000");
  assert.equal(pace.points[2]?.actualMinor, "70000");
  assert.equal(pace.points[13]?.actualMinor, "70000");
  assert.equal(pace.points[14]?.actualMinor, null);
  assert.equal(pace.points.every((point) => point.typicalMinor !== undefined), true);
});

test("month lengths, historical periods, and future periods do not create false today markers", () => {
  const leap = overviewPeriodFromKey("2024-02", timeZone, now);
  const april = overviewPeriodFromKey("2026-04", timeZone, now);
  const historical = buildOverviewFinancialSummary({
    filter: "ALL",
    currency: "XAF",
    locale: "fr-CM",
    now,
    period: leap,
    timeZone,
    transactions,
  });
  const future = buildOverviewFinancialSummary({
    filter: "ALL",
    currency: "XAF",
    locale: "fr-CM",
    now,
    period: april,
    timeZone,
    transactions,
  });

  assert.equal(historical.spendingPace.points.length, 29);
  assert.equal(historical.spendingPace.currentDay, null);
  assert.equal(future.spendingPace.points.length, 30);
  assert.equal(future.spendingPace.currentDay, null);
});

test("filter parsing and keyboard selection preserve the four stable filter values", () => {
  assert.equal(parseOverviewFilter(undefined), "ALL");
  assert.equal(parseOverviewFilter("EXPENSE"), "EXPENSE");
  assert.equal(parseOverviewFilter("INCOME"), "INCOME");
  assert.equal(parseOverviewFilter("TRANSFER"), "TRANSFER");
  assert.equal(nextOverviewFilterFromKey("ALL", "ArrowRight"), "EXPENSE");
  assert.equal(nextOverviewFilterFromKey("ALL", "ArrowLeft"), "TRANSFER");
  assert.equal(nextOverviewFilterFromKey("INCOME", "Home"), "ALL");
  assert.equal(nextOverviewFilterFromKey("EXPENSE", "End"), "TRANSFER");
});

test("month controls preserve a stable YYYY-MM URL period across year boundaries", () => {
  assert.equal(shiftOverviewPeriodKey("2026-01", -1), "2025-12");
  assert.equal(shiftOverviewPeriodKey("2026-12", 1), "2027-01");
});

test("bigint-safe presentation follows the workspace locale and chart ticks reduce density without deleting data", () => {
  assert.equal(formatOverviewMoney(428_500n, "XAF", "fr-CM"), "428 500 FCFA");
  assert.equal(formatOverviewMoney(42_850n, "EUR", "fr-FR"), "428,50 €");
  assert.equal(formatOverviewMoney(42_850n, "USD", "en-US"), "$428.50");
  assert.deepEqual(visibleOverviewChartDays(31, false), [1, 5, 10, 15, 20, 25, 31]);
  assert.deepEqual(visibleOverviewChartDays(31, true), [1, 10, 20, 31]);
});
