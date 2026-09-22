import type {
  LedgerCategoryKind,
  LedgerTransactionKind,
  LedgerTransactionRecord,
} from "@/modules/ledger/domain";

export const CLASSIFICATION_SOURCES = [
  "USER_RULE",
  "DETERMINISTIC",
  "AI_SUGGESTION",
  "EXISTING_LEDGER",
  "USER_CORRECTION",
  "UNCLASSIFIED",
] as const;
export type ClassificationSource = (typeof CLASSIFICATION_SOURCES)[number];

export const CLASSIFICATION_STATUSES = ["APPLIED", "NEEDS_REVIEW", "DISMISSED"] as const;
export type ClassificationStatus = (typeof CLASSIFICATION_STATUSES)[number];

export const INBOX_REASONS = [
  "UNKNOWN_CATEGORY",
  "POSSIBLE_TRANSFER",
  "POSSIBLE_RECURRING",
  "MERCHANT_AMBIGUITY",
  "CLASSIFICATION_REVIEW",
] as const;
export type InboxReason = (typeof INBOX_REASONS)[number];

export const INBOX_ACTIONS = [
  "CLASSIFY_TRANSACTION",
  "CREATE_RULE",
  "REVIEW_TRANSFER",
  "CONFIRM_RECURRING",
  "IGNORE_RECURRING",
  "DISMISS",
] as const;
export type InboxAction = (typeof INBOX_ACTIONS)[number];

export const INBOX_ITEM_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
export type InboxItemStatus = (typeof INBOX_ITEM_STATUSES)[number];

export const RECURRING_PAYMENT_STATUSES = ["CANDIDATE", "CONFIRMED", "IGNORED"] as const;
export type RecurringPaymentStatus = (typeof RECURRING_PAYMENT_STATUSES)[number];

export const RECURRING_PAYMENT_ORIGINS = ["DETECTED", "MANUAL"] as const;
export type RecurringPaymentOrigin = (typeof RECURRING_PAYMENT_ORIGINS)[number];

export const RECURRING_PAYMENT_DIRECTIONS = ["EXPENSE", "INCOME"] as const;
export type RecurringPaymentDirection = (typeof RECURRING_PAYMENT_DIRECTIONS)[number];

export interface ClassificationRuleRecord {
  id: string;
  workspaceId: string;
  normalizedMerchant: string;
  categoryId: string;
  kind: LedgerCategoryKind;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionClassificationRecord {
  id: string;
  workspaceId: string;
  transactionId: string;
  merchantName: string | null;
  normalizedMerchant: string | null;
  suggestedCategoryId: string | null;
  appliedCategoryId: string | null;
  source: ClassificationSource;
  confidence: number;
  status: ClassificationStatus;
  explanation: Record<string, unknown>;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinancialInboxItemRecord {
  id: string;
  workspaceId: string;
  transactionId: string;
  classificationId: string | null;
  recurringPaymentId: string | null;
  reason: InboxReason;
  actions: InboxAction[];
  status: InboxItemStatus;
  details: Record<string, unknown>;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecurringPaymentRecord {
  id: string;
  workspaceId: string;
  detectionKey: string;
  normalizedMerchant: string | null;
  displayName: string | null;
  origin: RecurringPaymentOrigin;
  direction: RecurringPaymentDirection;
  accountId: string | null;
  categoryId: string | null;
  currency: string;
  typicalAmountMinor: bigint;
  amountToleranceBps: number;
  cadenceDays: number;
  firstOccurredAt: Date;
  lastOccurredAt: Date;
  nextOccurrenceAt: Date | null;
  sampleTransactionIds: string[];
  status: RecurringPaymentStatus;
  createdByUserId: string | null;
  idempotencyKey: string | null;
  commandFingerprint: string | null;
  confirmedByUserId: string | null;
  confirmedAt: Date | null;
  ignoredByUserId: string | null;
  ignoredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinancialInboxAuditRecord {
  id: string;
  workspaceId: string;
  inboxItemId: string | null;
  classificationId: string | null;
  recurringPaymentId: string | null;
  actorUserId: string | null;
  event: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ClassifiedTransaction {
  transaction: LedgerTransactionRecord;
  classification: TransactionClassificationRecord;
  inboxItems: FinancialInboxItemRecord[];
  recurringCandidate: RecurringPaymentRecord | null;
}

export interface ResolveInboxInput {
  action: InboxAction;
  categoryId?: string;
}

export function isClassifiableTransaction(
  kind: LedgerTransactionKind,
): kind is Extract<LedgerTransactionKind, "EXPENSE" | "INCOME"> {
  return kind === "EXPENSE" || kind === "INCOME";
}
