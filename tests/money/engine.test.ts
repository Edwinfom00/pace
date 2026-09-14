import assert from "node:assert/strict";
import test from "node:test";

import {
  CurrencyMismatchError,
  calculateDailyPace,
  calculateTotals,
  comparePeriods,
  periodForLocalDates,
  summarizePeriod,
  type MoneyTransaction,
} from "@/money";

function transaction(overrides: Partial<MoneyTransaction> & Pick<MoneyTransaction, "id" | "kind">): MoneyTransaction {
  return {
    status: "POSTED",
    amountMinor: 1n,
    currency: "USD",
    occurredAt: new Date("2026-02-01T12:00:00.000Z"),
    categoryId: null,
    merchantId: null,
    refundedTransactionId: null,
    ...overrides,
  };
}

test("totals and summaries exclude transfers and attribute refunds to the original spending", () => {
  const ledger = [
    transaction({
      id: "expense-1",
      kind: "EXPENSE",
      amountMinor: 5_000n,
      categoryId: "groceries",
      merchantId: "market",
    }),
    transaction({
      id: "income-1",
      kind: "INCOME",
      amountMinor: 100_000n,
      categoryId: "salary",
      occurredAt: new Date("2026-02-02T12:00:00.000Z"),
    }),
    transaction({
      id: "transfer-1",
      kind: "TRANSFER",
      amountMinor: 75_000n,
      occurredAt: new Date("2026-02-02T13:00:00.000Z"),
    }),
    transaction({
      id: "refund-1",
      kind: "REFUND",
      amountMinor: 1_200n,
      categoryId: "incorrect-category",
      merchantId: "incorrect-merchant",
      refundedTransactionId: "expense-1",
      occurredAt: new Date("2026-02-03T12:00:00.000Z"),
    }),
    transaction({
      id: "pending-expense",
      kind: "EXPENSE",
      status: "PENDING",
      amountMinor: 999n,
      categoryId: "groceries",
    }),
  ];
  const period = periodForLocalDates("2026-02-01", "2026-02-04", "UTC");
  const summary = summarizePeriod(ledger, period, { currency: "USD" });

  assert.equal(summary.totals.income.minor, 100_000n);
  assert.equal(summary.totals.spending.minor, 3_800n);
  assert.equal(summary.totals.net.minor, 96_200n);
  assert.equal(summary.categories.find((entry) => entry.id === "groceries")?.spending.minor, 3_800n);
  assert.equal(summary.categories.some((entry) => entry.id === "incorrect-category"), false);
  assert.equal(summary.merchants.find((entry) => entry.id === "market")?.spending.minor, 3_800n);
});

test("local periods use IANA time-zone boundaries and daily pace uses calendar days", () => {
  const ledger = [
    transaction({
      id: "douala-boundary",
      kind: "EXPENSE",
      amountMinor: 900n,
      categoryId: "groceries",
      occurredAt: new Date("2026-01-31T23:30:00.000Z"),
    }),
  ];
  const doualaPeriod = periodForLocalDates("2026-02-01", "2026-02-02", "Africa/Douala");
  const utcPeriod = periodForLocalDates("2026-02-01", "2026-02-02", "UTC");

  assert.equal(calculateTotals(ledger.filter((entry) => entry.occurredAt >= doualaPeriod.start && entry.occurredAt < doualaPeriod.end), { currency: "USD" }).spending.minor, 900n);
  assert.equal(calculateTotals(ledger.filter((entry) => entry.occurredAt >= utcPeriod.start && entry.occurredAt < utcPeriod.end), { currency: "USD" }).spending.minor, 0n);

  const pacePeriod = periodForLocalDates("2026-02-01", "2026-02-04", "Africa/Douala");
  const pace = calculateDailyPace(ledger, pacePeriod, "Africa/Douala", {
    currency: "USD",
    now: new Date("2026-02-02T08:00:00.000Z"),
  });
  assert.equal(pace.elapsedDayCount, 2);
  assert.equal(pace.totalDayCount, 3);
  assert.equal(pace.spendingPerElapsedDay?.minor, 450n);
});

test("period comparisons and mixed-currency reports are deterministic and safe", () => {
  const ledger = [
    transaction({ id: "previous", kind: "EXPENSE", amountMinor: 1_000n, categoryId: "groceries" }),
    transaction({
      id: "current",
      kind: "EXPENSE",
      amountMinor: 700n,
      categoryId: "groceries",
      occurredAt: new Date("2026-03-01T12:00:00.000Z"),
    }),
  ];
  const comparison = comparePeriods(
    ledger,
    periodForLocalDates("2026-03-01", "2026-03-02", "UTC"),
    periodForLocalDates("2026-02-01", "2026-02-02", "UTC"),
    { currency: "USD" },
  );
  assert.equal(comparison.totals.spending.minor, -300n);
  assert.equal(comparison.categories[0]?.delta.spending.minor, -300n);

  assert.throws(
    () =>
      calculateTotals([
        transaction({ id: "usd", kind: "EXPENSE", amountMinor: 100n, currency: "USD" }),
        transaction({ id: "xaf", kind: "EXPENSE", amountMinor: 60_000n, currency: "XAF" }),
      ]),
    CurrencyMismatchError,
  );
});
