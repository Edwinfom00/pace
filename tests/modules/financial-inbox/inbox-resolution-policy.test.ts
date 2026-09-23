import assert from "node:assert/strict";
import test from "node:test";

import {
  getInboxResolutionCapabilities,
  type InboxResolutionPolicyInput,
} from "@/modules/financial-inbox/inbox-resolution-policy";
import type { FinancialInboxItemRecord } from "@/modules/financial-inbox/domain";

const workspaceId = "workspace-one";
const createdAt = new Date("2026-09-23T10:00:00.000Z");

function policyInput(overrides: Partial<InboxResolutionPolicyInput> = {}): InboxResolutionPolicyInput {
  const item = overrides.item ?? {
    id: "inbox-category",
    workspaceId,
    transactionId: "transaction-1",
    classificationId: "classification-1",
    recurringPaymentId: null,
    reason: "UNKNOWN_CATEGORY" as const,
    actions: ["CLASSIFY_TRANSACTION", "CREATE_RULE", "DISMISS"],
    status: "OPEN" as const,
    details: {},
    resolvedByUserId: null,
    resolvedAt: null,
    createdAt,
    updatedAt: createdAt,
  };

  return {
    item,
    sourceTransaction: {
      id: "transaction-1",
      workspaceId,
      reversalOfTransactionId: null,
    },
    effectiveTransaction: {
      id: "transaction-1",
      workspaceId,
      kind: "EXPENSE",
      status: "POSTED",
      categoryId: null,
      reversalOfTransactionId: null,
    },
    classification: {
      id: "classification-1",
      workspaceId,
      transactionId: "transaction-1",
      normalizedMerchant: "city taxi",
      suggestedCategoryId: "category-transport",
      appliedCategoryId: null,
      status: "NEEDS_REVIEW",
    },
    suggestedCategory: {
      id: "category-transport",
      workspaceId: null,
      kind: "EXPENSE",
    },
    recurring: null,
    workspaceRole: "OWNER",
    ...overrides,
  };
}

test("a current category suggestion can be accepted or replaced manually", () => {
  const capabilities = getInboxResolutionCapabilities(policyInput());

  assert.equal(capabilities.canAcceptCategorySuggestion, true);
  assert.equal(capabilities.canChooseCategory, true);
  assert.equal(capabilities.canCreateClassificationRule, true);
  assert.deepEqual(capabilities.unresolvedReasons, ["UNKNOWN_CATEGORY"]);
  assert.equal(capabilities.isResolved, false);
});

test("a missing or stale suggestion never prevents a safe manual category choice", () => {
  const noSuggestion = getInboxResolutionCapabilities(policyInput({
    classification: {
      ...policyInput().classification!,
      suggestedCategoryId: null,
    },
    suggestedCategory: null,
  }));
  assert.equal(noSuggestion.canAcceptCategorySuggestion, false);
  assert.equal(noSuggestion.canChooseCategory, true);
  assert.equal(noSuggestion.reasons.ACCEPT_CATEGORY_SUGGESTION, "NO_SUGGESTION");

  const staleSuggestion = getInboxResolutionCapabilities(policyInput({
    suggestedCategory: { id: "category-transport", workspaceId: null, kind: "INCOME" },
  }));
  assert.equal(staleSuggestion.canAcceptCategorySuggestion, false);
  assert.equal(staleSuggestion.canChooseCategory, true);
  assert.equal(staleSuggestion.reasons.ACCEPT_CATEGORY_SUGGESTION, "SUGGESTION_NOT_CURRENT");
});

test("a category already present in current ledger truth resolves the category concern", () => {
  const capabilities = getInboxResolutionCapabilities(policyInput({
    effectiveTransaction: {
      ...policyInput().effectiveTransaction,
      categoryId: "category-food",
    },
  }));

  assert.equal(capabilities.canAcceptCategorySuggestion, false);
  assert.equal(capabilities.canChooseCategory, false);
  assert.equal(capabilities.canDismiss, false);
  assert.equal(capabilities.reasons.CHOOSE_CATEGORY, "CATEGORY_ALREADY_CONFIRMED");
  assert.deepEqual(capabilities.unresolvedReasons, []);
  assert.equal(capabilities.isResolved, true);
});

test("a category decision does not resolve another attention reason on the same source", () => {
  const categoryItem = policyInput().item;
  const transferItem = {
    ...categoryItem,
    id: "inbox-transfer",
    reason: "POSSIBLE_TRANSFER" as const,
    actions: ["REVIEW_TRANSFER", "DISMISS"] as FinancialInboxItemRecord["actions"],
  };
  const capabilities = getInboxResolutionCapabilities(policyInput({
    relatedItems: [categoryItem, transferItem],
  }));

  assert.equal(capabilities.canChooseCategory, true);
  assert.deepEqual(capabilities.unresolvedReasons, ["UNKNOWN_CATEGORY", "POSSIBLE_TRANSFER"]);
  assert.equal(capabilities.isResolved, false);
  assert.deepEqual(capabilities.resolutionRequirements, [
    { reason: "UNKNOWN_CATEGORY", isUnresolved: true, resolution: "CATEGORY_CONFIRMATION" },
    { reason: "POSSIBLE_TRANSFER", isUnresolved: true, resolution: "NO_DIRECT_RESOLUTION" },
  ]);
});

test("transfer and refund records never receive category or type-changing Inbox capabilities", () => {
  for (const kind of ["TRANSFER", "REFUND"] as const) {
    const capabilities = getInboxResolutionCapabilities(policyInput({
      item: { ...policyInput().item, reason: "CLASSIFICATION_REVIEW" },
      effectiveTransaction: {
        ...policyInput().effectiveTransaction,
        kind,
      },
    }));
    assert.equal(capabilities.canAcceptCategorySuggestion, false);
    assert.equal(capabilities.canChooseCategory, false);
    assert.equal(capabilities.reasons.CHOOSE_CATEGORY, "TRANSACTION_TYPE_LOCKED");
  }
});

test("a correction replacement or technical reversal makes the original Inbox source stale", () => {
  const corrected = getInboxResolutionCapabilities(policyInput({
    effectiveTransaction: {
      ...policyInput().effectiveTransaction,
      id: "replacement-transaction",
    },
  }));
  assert.equal(corrected.isStale, true);
  assert.equal(corrected.canChooseCategory, false);
  assert.equal(corrected.reasons.CHOOSE_CATEGORY, "STALE_ITEM");
  assert.equal(corrected.isResolved, true);

  const technicalReversal = getInboxResolutionCapabilities(policyInput({
    sourceTransaction: {
      ...policyInput().sourceTransaction,
      reversalOfTransactionId: "original-transaction",
    },
  }));
  assert.equal(technicalReversal.isStale, true);
  assert.deepEqual(technicalReversal.allowedActions, []);
});

test("recurring decisions stay owned by the recurring policy and settle only when its candidate settles", () => {
  const item = {
    ...policyInput().item,
    id: "inbox-recurring",
    classificationId: null,
    recurringPaymentId: "recurring-1",
    reason: "POSSIBLE_RECURRING" as const,
    actions: ["CONFIRM_RECURRING", "IGNORE_RECURRING"] as FinancialInboxItemRecord["actions"],
  };
  const candidate = {
    id: "recurring-1",
    workspaceId,
    origin: "DETECTED" as const,
    status: "CANDIDATE" as const,
  };
  const capabilities = getInboxResolutionCapabilities(policyInput({ item, recurring: candidate }));
  assert.deepEqual(capabilities.allowedActions, []);
  assert.deepEqual(capabilities.recurring, { recurringId: "recurring-1", actionOwner: "RECURRING" });
  assert.deepEqual(capabilities.unresolvedReasons, ["POSSIBLE_RECURRING"]);

  const settled = getInboxResolutionCapabilities(policyInput({
    item,
    recurring: { ...candidate, status: "CONFIRMED" },
  }));
  assert.equal(settled.isResolved, true);
  assert.deepEqual(settled.unresolvedReasons, []);
});

test("merchant ambiguity points to the canonical transaction-metadata path without inventing merchant actions", () => {
  const capabilities = getInboxResolutionCapabilities(policyInput({
    item: {
      ...policyInput().item,
      reason: "MERCHANT_AMBIGUITY",
      actions: ["DISMISS"] as FinancialInboxItemRecord["actions"],
    },
  }));

  assert.equal(capabilities.canChooseCategory, false);
  assert.deepEqual(capabilities.merchant, {
    transactionId: "transaction-1",
    actionOwner: "TRANSACTION_METADATA",
  });
  assert.deepEqual(capabilities.unresolvedReasons, ["MERCHANT_AMBIGUITY"]);
});

test("viewers receive read-only capabilities and foreign recurring records are not exposed", () => {
  const viewer = getInboxResolutionCapabilities(policyInput({ workspaceRole: "VIEWER" }));
  assert.deepEqual(viewer.allowedActions, []);
  assert.equal(viewer.reasons.CHOOSE_CATEGORY, "READ_ONLY_ROLE");

  const recurringItem = {
    ...policyInput().item,
    classificationId: null,
    recurringPaymentId: "foreign-recurring",
    reason: "POSSIBLE_RECURRING" as const,
    actions: ["CONFIRM_RECURRING"] as FinancialInboxItemRecord["actions"],
  };
  const foreignRecurring = getInboxResolutionCapabilities(policyInput({
    item: recurringItem,
    recurring: {
      id: "foreign-recurring",
      workspaceId: "another-workspace",
      origin: "DETECTED",
      status: "CANDIDATE",
    },
  }));
  assert.equal(foreignRecurring.recurring, null);
  assert.deepEqual(foreignRecurring.unresolvedReasons, []);
});
