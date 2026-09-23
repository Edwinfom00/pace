import {
  canPerformWorkspaceAction,
  type WorkspaceRole,
} from "@/authorization/workspace-permissions";
import type {
  LedgerCategoryRecord,
  LedgerTransactionRecord,
} from "@/modules/ledger/domain";

import {
  isClassifiableTransaction,
  type FinancialInboxItemRecord,
  type InboxReason,
  type RecurringPaymentRecord,
  type TransactionClassificationRecord,
} from "./domain";


export const INBOX_RESOLUTION_ACTIONS = [
  "ACCEPT_CATEGORY_SUGGESTION",
  "CHOOSE_CATEGORY",
  "CREATE_CLASSIFICATION_RULE",
  "DISMISS",
] as const;
export type InboxResolutionAction = (typeof INBOX_RESOLUTION_ACTIONS)[number];

export const INBOX_RESOLUTION_ACTION_REASONS = [
  "READ_ONLY_ROLE",
  "ITEM_NOT_OPEN",
  "STALE_ITEM",
  "REASON_NOT_ACTIONABLE",
  "SOURCE_NOT_ACTIONABLE",
  "TRANSACTION_TYPE_LOCKED",
  "CATEGORY_ALREADY_CONFIRMED",
  "NO_SUGGESTION",
  "SUGGESTION_NOT_CURRENT",
  "MERCHANT_REQUIRED",
  "ACTION_NOT_SUPPORTED",
] as const;
export type InboxResolutionActionReason = (typeof INBOX_RESOLUTION_ACTION_REASONS)[number];

export type InboxResolutionRequirement = {
  readonly reason: InboxReason;
  readonly isUnresolved: boolean;
  readonly resolution:
    | "CATEGORY_CONFIRMATION"
    | "RECURRING_DOMAIN_DECISION"
    | "TRANSACTION_METADATA"
    | "NO_DIRECT_RESOLUTION";
};

export type InboxResolutionCapabilities = {
  readonly itemId: string;
  /** True only when every still-relevant reason for this source is gone. */
  readonly isResolved: boolean;
  /** The attached technical source is no longer the current ledger truth. */
  readonly isStale: boolean;
  /** Every remaining source-level attention reason, never inferred in React. */
  readonly unresolvedReasons: readonly InboxReason[];
  readonly resolutionRequirements: readonly InboxResolutionRequirement[];
  readonly canAcceptCategorySuggestion: boolean;
  readonly canChooseCategory: boolean;
  readonly canCreateClassificationRule: boolean;
  /** Only exposed where the existing M4 record explicitly supports dismissal. */
  readonly canDismiss: boolean;
  readonly allowedActions: readonly InboxResolutionAction[];
  readonly reasons: Partial<Record<InboxResolutionAction, InboxResolutionActionReason>>;
  /** A recurring review remains owned by the Recurring action policy. */
  readonly recurring: {
    readonly recurringId: string;
    readonly actionOwner: "RECURRING";
  } | null;
  /** Merchant ambiguity has no Inbox mutation; it points to transaction metadata. */
  readonly merchant: {
    readonly transactionId: string;
    readonly actionOwner: "TRANSACTION_METADATA";
  } | null;
};

export type InboxResolutionPolicyInput = {
  readonly item: FinancialInboxItemRecord;
  /** Other Inbox records attached to the same original transaction, if loaded. */
  readonly relatedItems?: readonly FinancialInboxItemRecord[];
  readonly sourceTransaction: Pick<
    LedgerTransactionRecord,
    "id" | "workspaceId" | "reversalOfTransactionId"
  >;
  readonly effectiveTransaction: Pick<
    LedgerTransactionRecord,
    "id" | "workspaceId" | "kind" | "status" | "categoryId" | "reversalOfTransactionId"
  >;
  readonly classification: Pick<
    TransactionClassificationRecord,
    | "id"
    | "workspaceId"
    | "transactionId"
    | "normalizedMerchant"
    | "suggestedCategoryId"
    | "appliedCategoryId"
    | "status"
  > | null;
  readonly suggestedCategory: Pick<LedgerCategoryRecord, "id" | "workspaceId" | "kind"> | null;
  readonly recurring: Pick<RecurringPaymentRecord, "id" | "origin" | "status"> & {
    /** Detail reads include this; the batched overview join already scopes it. */
    readonly workspaceId?: string;
  } | null;
  readonly workspaceRole: WorkspaceRole;
};


export function getInboxResolutionCapabilities(
  input: InboxResolutionPolicyInput,
): InboxResolutionCapabilities {
  const relatedItems = input.relatedItems ?? [input.item];
  const isStale = isStaleSource(input);
  const unresolvedReasons = uniqueReasons(
    relatedItems.flatMap((item) => isReasonUnresolved(item, input, isStale) ? [item.reason] : []),
  );
  const requirements = relatedItems.map((item) => ({
    reason: item.reason,
    isUnresolved: isReasonUnresolved(item, input, isStale),
    resolution: resolutionRequirement(item.reason),
  }));
  const baseReason = baseActionReason(input, isStale);
  const categoryReason = categoryActionReason(input, baseReason);
  const acceptReason = categoryReason ?? suggestionActionReason(input);
  const createRuleReason = categoryReason ?? classificationRuleReason(input);
  const dismissReason = dismissActionReason(input, baseReason);

  const canAcceptCategorySuggestion = acceptReason === null;
  const canChooseCategory = categoryReason === null;
  const canCreateClassificationRule = createRuleReason === null;
  const canDismiss = dismissReason === null;
  const allowedActions = [
    ...(canAcceptCategorySuggestion ? ["ACCEPT_CATEGORY_SUGGESTION" as const] : []),
    ...(canChooseCategory ? ["CHOOSE_CATEGORY" as const] : []),
    ...(canCreateClassificationRule ? ["CREATE_CLASSIFICATION_RULE" as const] : []),
    ...(canDismiss ? ["DISMISS" as const] : []),
  ];

  return {
    itemId: input.item.id,
    isResolved: unresolvedReasons.length === 0,
    isStale,
    unresolvedReasons,
    resolutionRequirements: uniqueRequirements(requirements),
    canAcceptCategorySuggestion,
    canChooseCategory,
    canCreateClassificationRule,
    canDismiss,
    allowedActions,
    reasons: {
      ...(acceptReason ? { ACCEPT_CATEGORY_SUGGESTION: acceptReason } : {}),
      ...(categoryReason ? { CHOOSE_CATEGORY: categoryReason } : {}),
      ...(createRuleReason ? { CREATE_CLASSIFICATION_RULE: createRuleReason } : {}),
      ...(dismissReason ? { DISMISS: dismissReason } : {}),
    },
    recurring: input.item.reason === "POSSIBLE_RECURRING"
      && input.recurring
      && (input.recurring.workspaceId === undefined || input.recurring.workspaceId === input.item.workspaceId)
      ? { recurringId: input.recurring.id, actionOwner: "RECURRING" }
      : null,
    merchant: input.item.reason === "MERCHANT_AMBIGUITY" && !isStale
      ? { transactionId: input.effectiveTransaction.id, actionOwner: "TRANSACTION_METADATA" }
      : null,
  };
}

function baseActionReason(
  input: InboxResolutionPolicyInput,
  isStale: boolean,
): InboxResolutionActionReason | null {
  if (input.item.status !== "OPEN") return "ITEM_NOT_OPEN";
  if (isStale) return "STALE_ITEM";
  if (!canPerformWorkspaceAction(input.workspaceRole, "manage_ledger")) return "READ_ONLY_ROLE";
  if (!isReasonUnresolved(input.item, input, isStale)) {
    return isCategoryReason(input.item.reason) ? "CATEGORY_ALREADY_CONFIRMED" : "SOURCE_NOT_ACTIONABLE";
  }
  return null;
}

function categoryActionReason(
  input: InboxResolutionPolicyInput,
  baseReason: InboxResolutionActionReason | null,
): InboxResolutionActionReason | null {
  if (!isCategoryReason(input.item.reason)) return "REASON_NOT_ACTIONABLE";
  if (baseReason) return baseReason;
  if (!isClassifiableTransaction(input.effectiveTransaction.kind)) return "TRANSACTION_TYPE_LOCKED";
  if (isCategoryConfirmed(input)) return "CATEGORY_ALREADY_CONFIRMED";
  if (!hasCurrentClassification(input)) return "SOURCE_NOT_ACTIONABLE";
  if (!input.item.actions.includes("CLASSIFY_TRANSACTION")) return "ACTION_NOT_SUPPORTED";
  return null;
}

function suggestionActionReason(input: InboxResolutionPolicyInput): InboxResolutionActionReason | null {
  const classification = input.classification;
  if (!classification?.suggestedCategoryId) return "NO_SUGGESTION";
  if (
    !input.suggestedCategory
    || input.suggestedCategory.id !== classification.suggestedCategoryId
    || input.suggestedCategory.kind !== input.effectiveTransaction.kind
    || (input.suggestedCategory.workspaceId !== null && input.suggestedCategory.workspaceId !== input.item.workspaceId)
  ) {
    return "SUGGESTION_NOT_CURRENT";
  }
  return null;
}

function classificationRuleReason(input: InboxResolutionPolicyInput): InboxResolutionActionReason | null {
  if (!input.classification?.normalizedMerchant) return "MERCHANT_REQUIRED";
  if (!input.item.actions.includes("CREATE_RULE")) return "ACTION_NOT_SUPPORTED";
  return null;
}

function dismissActionReason(
  input: InboxResolutionPolicyInput,
  baseReason: InboxResolutionActionReason | null,
): InboxResolutionActionReason | null {
  if (baseReason) return baseReason;
  return input.item.actions.includes("DISMISS") ? null : "ACTION_NOT_SUPPORTED";
}

function isReasonUnresolved(
  item: FinancialInboxItemRecord,
  input: InboxResolutionPolicyInput,
  isStale: boolean,
): boolean {
  if (item.status !== "OPEN" || isStale) return false;

  switch (item.reason) {
    case "UNKNOWN_CATEGORY":
    case "CLASSIFICATION_REVIEW":
      return !isCategoryConfirmed(input);
    case "POSSIBLE_RECURRING": {
      const recurring = input.recurring;
      return recurring !== null
        && (recurring.workspaceId === undefined || recurring.workspaceId === input.item.workspaceId)
        && recurring.origin === "DETECTED"
        && recurring.status === "CANDIDATE";
    }
    case "POSSIBLE_TRANSFER":
    case "MERCHANT_AMBIGUITY":
      // There is no canonical domain decision for these M4 concerns yet.
      return true;
  }
}

function isCategoryConfirmed(input: InboxResolutionPolicyInput): boolean {
  if (input.effectiveTransaction.categoryId !== null) return true;
  const classification = input.classification;
  return Boolean(
    classification
    && classification.id === input.item.classificationId
    && classification.workspaceId === input.item.workspaceId
    && classification.transactionId === input.effectiveTransaction.id
    && (classification.status === "APPLIED" || classification.status === "DISMISSED"),
  );
}

function hasCurrentClassification(input: InboxResolutionPolicyInput): boolean {
  const classification = input.classification;
  return Boolean(
    classification
    && classification.id === input.item.classificationId
    && classification.workspaceId === input.item.workspaceId
    && classification.transactionId === input.effectiveTransaction.id
    && classification.status === "NEEDS_REVIEW",
  );
}

function isStaleSource(input: InboxResolutionPolicyInput): boolean {
  return input.sourceTransaction.workspaceId !== input.item.workspaceId
    || input.effectiveTransaction.workspaceId !== input.item.workspaceId
    || input.sourceTransaction.id !== input.item.transactionId
    || input.effectiveTransaction.id !== input.sourceTransaction.id
    || input.sourceTransaction.reversalOfTransactionId !== null
    || input.effectiveTransaction.reversalOfTransactionId !== null;
}

function isCategoryReason(reason: InboxReason): boolean {
  return reason === "UNKNOWN_CATEGORY" || reason === "CLASSIFICATION_REVIEW";
}

function resolutionRequirement(reason: InboxReason): InboxResolutionRequirement["resolution"] {
  switch (reason) {
    case "UNKNOWN_CATEGORY":
    case "CLASSIFICATION_REVIEW":
      return "CATEGORY_CONFIRMATION";
    case "POSSIBLE_RECURRING":
      return "RECURRING_DOMAIN_DECISION";
    case "MERCHANT_AMBIGUITY":
      return "TRANSACTION_METADATA";
    case "POSSIBLE_TRANSFER":
      return "NO_DIRECT_RESOLUTION";
  }
}

function uniqueReasons(reasons: readonly InboxReason[]): readonly InboxReason[] {
  return [...new Set(reasons)];
}

function uniqueRequirements(
  requirements: readonly InboxResolutionRequirement[],
): readonly InboxResolutionRequirement[] {
  const seen = new Set<InboxReason>();
  return requirements.filter((requirement) => {
    if (seen.has(requirement.reason)) return false;
    seen.add(requirement.reason);
    return true;
  });
}
