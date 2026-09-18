import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMerchant,
  normalizeMerchantRuleKey,
} from "@/modules/financial-inbox/classification";
import { detectRecurringCandidates } from "@/modules/financial-inbox/recurring-detection";
import type { LedgerTransactionRecord } from "@/modules/ledger/domain";

import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_TRANSPORT_ID,
} from "../../support/in-memory-ledger-repository";

test("merchant normalization is Unicode-safe and deterministic user rules outrank AI", () => {
  const ledger = new InMemoryLedgerRepository();
  const categories = [...ledger.categories.values()];
  const decision = classifyMerchant({
    kind: "EXPENSE",
    merchantName: "  YÄNGO*Ride  #102  ",
    existingCategoryId: SYSTEM_GROCERIES_ID,
    existingCategoryIsAuthoritative: true,
    categories,
    userRules: [
      {
        id: "rule-yango",
        workspaceId: "workspace-one",
        normalizedMerchant: "yango",
        categoryId: SYSTEM_TRANSPORT_ID,
        kind: "EXPENSE",
        createdByUserId: "owner",
        updatedByUserId: "owner",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    aiSuggestion: {
      categoryId: SYSTEM_GROCERIES_ID,
      confidence: 0.99,
      explanation: "A grocery-related description was observed.",
    },
  });

  assert.equal(normalizeMerchantRuleKey(" YÄNGO*Ride "), "yango ride");
  assert.equal(decision.source, "USER_RULE");
  assert.equal(decision.categoryId, SYSTEM_TRANSPORT_ID);
  assert.equal(decision.confidence, 1);
  assert.equal(decision.requiresReview, false);
});

test("low-confidence AI suggestions are explainable but always require review", () => {
  const ledger = new InMemoryLedgerRepository();
  const decision = classifyMerchant({
    kind: "EXPENSE",
    merchantName: "City Taxi",
    existingCategoryId: null,
    existingCategoryIsAuthoritative: false,
    categories: [...ledger.categories.values()],
    userRules: [],
    aiSuggestion: {
      categoryId: SYSTEM_TRANSPORT_ID,
      confidence: 0.64,
      explanation: "The merchant may be a taxi provider.",
    },
  });

  assert.equal(decision.source, "AI_SUGGESTION");
  assert.equal(decision.confidence, 0.64);
  assert.equal(decision.requiresReview, true);
  assert.equal(decision.explanation.explanation, "The merchant may be a taxi provider.");
});

test("recurring detection requires similar amounts and a plausible stable cadence", () => {
  const monthly = [
    recurringTransaction("n-1", "2026-01-03", 5_000n),
    recurringTransaction("n-2", "2026-02-02", 5_120n),
    recurringTransaction("n-3", "2026-03-04", 4_980n),
  ];
  const candidates = detectRecurringCandidates(
    monthly.map((transaction) => ({ transaction, normalizedMerchant: "netflix" })),
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.cadenceDays, 30);
  assert.equal(candidates[0]?.typicalAmountMinor, 5_000n);

  const nearDaily = [
    recurringTransaction("d-1", "2026-01-01", 5_000n),
    recurringTransaction("d-2", "2026-01-03", 5_000n),
    recurringTransaction("d-3", "2026-01-05", 5_000n),
  ];
  assert.equal(
    detectRecurringCandidates(nearDaily.map((transaction) => ({ transaction, normalizedMerchant: "corner store" }))).length,
    0,
  );

  const amountDrift = [
    recurringTransaction("a-1", "2026-01-01", 5_000n),
    recurringTransaction("a-2", "2026-02-01", 7_000n),
    recurringTransaction("a-3", "2026-03-03", 5_000n),
  ];
  assert.equal(
    detectRecurringCandidates(amountDrift.map((transaction) => ({ transaction, normalizedMerchant: "streaming" }))).length,
    0,
  );
});

function recurringTransaction(id: string, occurredAt: string, amountMinor: bigint): LedgerTransactionRecord {
  const date = new Date(`${occurredAt}T12:00:00.000Z`);
  return {
    id,
    workspaceId: "workspace-one",
    kind: "EXPENSE",
    status: "POSTED",
    amountMinor,
    currency: "XAF",
    occurredAt: date,
    accountId: "account-one",
    transferAccountId: null,
    categoryId: SYSTEM_GROCERIES_ID,
    merchantId: "merchant-one",
    createdByUserId: "owner",
    paidByUserId: "owner",
    transferGroupId: null,
    refundedTransactionId: null,
    reversalOfTransactionId: null,
    source: {},
    deduplicationFingerprint: id,
    note: null,
    createdAt: date,
    updatedAt: date,
  };
}
