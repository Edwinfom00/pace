import assert from "node:assert/strict";
import test from "node:test";

import type { MoneyTransaction } from "@/money/engine";
import { deriveInsightCandidates, type FinancialInsightInput } from "@/money/insights";

function transaction(
  overrides: Partial<MoneyTransaction> & Pick<MoneyTransaction, "id" | "kind">,
): MoneyTransaction {
  return {
    status: "POSTED",
    amountMinor: 1n,
    currency: "USD",
    occurredAt: new Date("2026-03-10T12:00:00.000Z"),
    categoryId: "groceries",
    merchantId: "market",
    refundedTransactionId: null,
    ...overrides,
  };
}

function input(overrides: Partial<FinancialInsightInput> = {}): FinancialInsightInput {
  return {
    currency: "USD",
    timeZone: "UTC",
    now: new Date("2026-03-15T12:00:00.000Z"),
    transactions: [],
    budgets: [],
    goals: [],
    recurringPayments: [],
    ...overrides,
  };
}

function types(value: FinancialInsightInput): string[] {
  return deriveInsightCandidates(value).map((candidate) => candidate.type);
}

test("M6 derives category and merchant changes plus month-over-month facts deterministically", () => {
  const result = deriveInsightCandidates(
    input({
      transactions: [
        transaction({ id: "previous-grocery", kind: "EXPENSE", amountMinor: 100n, occurredAt: new Date("2026-02-10T12:00:00Z") }),
        transaction({ id: "current-grocery", kind: "EXPENSE", amountMinor: 300n }),
        transaction({ id: "previous-dining", kind: "EXPENSE", amountMinor: 200n, categoryId: "dining", merchantId: "cafe", occurredAt: new Date("2026-02-11T12:00:00Z") }),
        transaction({ id: "current-dining", kind: "EXPENSE", amountMinor: 100n, categoryId: "dining", merchantId: "cafe" }),
      ],
      merchantNames: { market: "Market", cafe: "Cafe" },
    }),
  );
  assert.ok(result.some((candidate) => candidate.type === "CATEGORY_SPIKE" && candidate.data.categoryId === "groceries"));
  assert.ok(result.some((candidate) => candidate.type === "CATEGORY_DROP" && candidate.data.categoryId === "dining"));
  assert.ok(result.some((candidate) => candidate.type === "MERCHANT_SPIKE" && candidate.data.merchantName === "Market"));
  assert.ok(result.some((candidate) => candidate.type === "POTENTIAL_SAVINGS"));
  assert.ok(result.some((candidate) => candidate.type === "MONTH_OVER_MONTH_CHANGE"));
  assert.deepEqual(
    result.map((candidate) => candidate.fingerprint),
    deriveInsightCandidates(input({
      transactions: [
        transaction({ id: "previous-grocery", kind: "EXPENSE", amountMinor: 100n, occurredAt: new Date("2026-02-10T12:00:00Z") }),
        transaction({ id: "current-grocery", kind: "EXPENSE", amountMinor: 300n }),
        transaction({ id: "previous-dining", kind: "EXPENSE", amountMinor: 200n, categoryId: "dining", merchantId: "cafe", occurredAt: new Date("2026-02-11T12:00:00Z") }),
        transaction({ id: "current-dining", kind: "EXPENSE", amountMinor: 100n, categoryId: "dining", merchantId: "cafe" }),
      ],
      merchantNames: { market: "Market", cafe: "Cafe" },
    })).map((candidate) => candidate.fingerprint),
  );
});

test("spending pace and budgets use BigInt thresholds without floating point arithmetic", () => {
  const high = types(input({
    transactions: [transaction({ id: "spend", kind: "EXPENSE", amountMinor: 900n })],
    budgets: [{
      id: "overall", scope: "OVERALL", categoryId: null, amountMinor: 1_000n, currency: "USD", status: "ACTIVE",
      startsOn: new Date("2026-03-01T00:00:00Z"), endsOn: null,
    }],
  }));
  assert.ok(high.includes("BUDGET_AT_RISK"));
  assert.ok(high.includes("SPENDING_PACE_HIGH"));

  const low = types(input({
    transactions: [transaction({ id: "spend", kind: "EXPENSE", amountMinor: 50n })],
    budgets: [{
      id: "overall", scope: "OVERALL", categoryId: null, amountMinor: 1_000n, currency: "USD", status: "ACTIVE",
      startsOn: new Date("2026-03-01T00:00:00Z"), endsOn: null,
    }],
  }));
  assert.ok(low.includes("SPENDING_PACE_LOW"));

  const exceeded = types(input({
    transactions: [transaction({ id: "spend", kind: "EXPENSE", amountMinor: 1_001n })],
    budgets: [{
      id: "category", scope: "CATEGORY", categoryId: "groceries", amountMinor: 1_000n, currency: "USD", status: "ACTIVE",
      startsOn: new Date("2026-03-01T00:00:00Z"), endsOn: null,
    }],
  }));
  assert.ok(exceeded.includes("BUDGET_EXCEEDED"));
});

test("insights ignore original and reversal entries from a correction chain", () => {
  const result = types(input({
    transactions: [
      transaction({ id: "original", kind: "EXPENSE", amountMinor: 10_000n }),
      transaction({ id: "reversal", kind: "EXPENSE", amountMinor: 10_000n, reversalOfTransactionId: "original" }),
      transaction({ id: "replacement", kind: "EXPENSE", amountMinor: 9_000n }),
    ],
    budgets: [{
      id: "overall", scope: "OVERALL", categoryId: null, amountMinor: 10_000n, currency: "USD", status: "ACTIVE",
      startsOn: new Date("2026-03-01T00:00:00Z"), endsOn: null,
    }],
  }));

  assert.ok(result.includes("BUDGET_AT_RISK"));
  assert.equal(result.includes("BUDGET_EXCEEDED"), false);
});

test("recurring pricing, candidate recurring payments, goals, and unusual transactions are deterministic", () => {
  const result = types(input({
    transactions: [
      transaction({ id: "r1", kind: "EXPENSE", amountMinor: 100n, occurredAt: new Date("2026-01-10T12:00:00Z") }),
      transaction({ id: "r2", kind: "EXPENSE", amountMinor: 100n, occurredAt: new Date("2026-02-10T12:00:00Z") }),
      transaction({ id: "r3", kind: "EXPENSE", amountMinor: 140n, occurredAt: new Date("2026-03-10T12:00:00Z") }),
      transaction({ id: "u1", kind: "EXPENSE", amountMinor: 10n, categoryId: "fuel", occurredAt: new Date("2026-01-20T12:00:00Z") }),
      transaction({ id: "u2", kind: "EXPENSE", amountMinor: 12n, categoryId: "fuel", occurredAt: new Date("2026-02-01T12:00:00Z") }),
      transaction({ id: "u3", kind: "EXPENSE", amountMinor: 9n, categoryId: "fuel", occurredAt: new Date("2026-02-20T12:00:00Z") }),
      transaction({ id: "unusual", kind: "EXPENSE", amountMinor: 40n, categoryId: "fuel", occurredAt: new Date("2026-03-13T12:00:00Z") }),
    ],
    recurringPayments: [
      { id: "confirmed", normalizedMerchant: "streaming", typicalAmountMinor: 100n, currency: "USD", cadenceDays: 30, sampleTransactionIds: ["r1", "r2", "r3"], status: "CONFIRMED", firstOccurredAt: new Date("2026-01-10T12:00:00Z"), lastOccurredAt: new Date("2026-03-10T12:00:00Z") },
      { id: "candidate", normalizedMerchant: "gym", typicalAmountMinor: 200n, currency: "USD", cadenceDays: 30, sampleTransactionIds: ["r1", "r2"], status: "CANDIDATE", firstOccurredAt: new Date("2026-02-10T12:00:00Z"), lastOccurredAt: new Date("2026-03-10T12:00:00Z") },
    ],
    goals: [
      { id: "off", name: "Emergency", targetAmountMinor: 1_000n, currentSavedMinor: 100n, currency: "USD", targetDate: new Date("2026-04-01T00:00:00Z"), status: "ACTIVE", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "on", name: "Trip", targetAmountMinor: 1_000n, currentSavedMinor: 900n, currency: "USD", targetDate: new Date("2026-04-01T00:00:00Z"), status: "ACTIVE", createdAt: new Date("2026-01-01T00:00:00Z") },
    ],
  }));
  assert.ok(result.includes("RECURRING_PRICE_INCREASE"));
  assert.ok(result.includes("NEW_RECURRING_PAYMENT"));
  assert.ok(result.includes("GOAL_OFF_TRACK"));
  assert.ok(result.includes("GOAL_ON_TRACK"));
  assert.ok(result.includes("UNUSUAL_TRANSACTION"));
});

test("transfers, refunds, currency mismatches, and local month boundaries remain safe", () => {
  const withRefund = input({
    timeZone: "Africa/Douala",
    now: new Date("2026-03-01T00:30:00.000Z"),
    transactions: [
      transaction({ id: "original", kind: "EXPENSE", amountMinor: 100n, occurredAt: new Date("2026-02-01T12:00:00Z") }),
      transaction({ id: "refund", kind: "REFUND", amountMinor: 80n, refundedTransactionId: "original", categoryId: "wrong", merchantId: "wrong", occurredAt: new Date("2026-03-01T00:15:00Z") }),
      transaction({ id: "transfer", kind: "TRANSFER", amountMinor: 1_000_000_000_000_000_000n, categoryId: null, merchantId: null, occurredAt: new Date("2026-03-01T00:15:00Z") }),
    ],
  });
  assert.equal(types(withRefund).includes("CATEGORY_SPIKE"), false);
  assert.throws(
    () => deriveInsightCandidates(input({ transactions: [transaction({ id: "xaf", kind: "EXPENSE", currency: "XAF" })] })),
    /currency does not match/,
  );
});
