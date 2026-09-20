import {
  canPerformWorkspaceAction,
  type WorkspaceRole,
} from "@/authorization/workspace-permissions";
import type { LedgerTransactionRecord } from "@/modules/ledger/domain";

export const TRANSACTION_ACTION_REASONS = [
  "READ_ONLY_ROLE",
  "TRANSACTION_NOT_POSTED",
  "IMPORTED_TRANSACTION_RESTRICTED",
  // Retained for historical action-audit/UI compatibility. The safe-detail
  // editor now permits transfer note/date changes, so policy no longer emits it.
  "TRANSFER_REQUIRES_REVERSAL",
  "REFUND_IMMUTABLE",
  "REFUND_NOT_APPLICABLE",
  "REFUND_REQUIRES_CATEGORY",
  "REFUND_FULLY_ISSUED",
  "REVERSAL_NOT_SUPPORTED",
  "DELETE_NOT_SUPPORTED",
] as const;

export type TransactionActionReason = (typeof TRANSACTION_ACTION_REASONS)[number];

type TransactionFinancialAction = "edit" | "refund" | "reverse" | "delete";

export type TransactionCapabilities = {
  readonly canEdit: boolean;
  /** Financial correction is distinct from safe metadata editing. */
  readonly canCorrectFinancials: boolean;
  readonly canRefund: boolean;
  readonly canReverse: boolean;
  readonly canDelete: boolean;
  readonly canViewTechnicalDetails: boolean;
  readonly reasons: Partial<Record<TransactionFinancialAction, TransactionActionReason>>;
};

export type TransactionActionPolicyInput = {
  readonly transaction: Pick<
    LedgerTransactionRecord,
    "kind" | "status" | "amountMinor" | "categoryId" | "source"
  >;
  readonly workspaceRole: WorkspaceRole;
  /** Includes every existing refund, matching the ledger service's refund limit. */
  readonly refundedAmountMinor: bigint;
  /** A historical original or reversal may never start another correction. */
  readonly isCurrentEffective?: boolean;
};


export function getTransactionCapabilities({
  transaction,
  workspaceRole,
  refundedAmountMinor,
  isCurrentEffective = true,
}: TransactionActionPolicyInput): TransactionCapabilities {
  const canManageLedger = canPerformWorkspaceAction(workspaceRole, "manage_ledger");
  const canViewTechnicalDetails = canPerformWorkspaceAction(workspaceRole, "read");

  if (!canManageLedger) {
    return {
      canEdit: false,
      canCorrectFinancials: false,
      canRefund: false,
      canReverse: false,
      canDelete: false,
      canViewTechnicalDetails,
      reasons: {
        edit: "READ_ONLY_ROLE",
        refund: "READ_ONLY_ROLE",
        reverse: "READ_ONLY_ROLE",
        delete: "READ_ONLY_ROLE",
      },
    };
  }

  const editReason = getEditReason(transaction);
  const refundReason = getRefundReason(transaction, refundedAmountMinor, isCurrentEffective);
  const canCorrectFinancials = isCorrectionAllowed(transaction, isCurrentEffective);
  const reversalReason = getReversalReason(transaction, refundedAmountMinor, isCurrentEffective);

  return {
    canEdit: editReason === null,
    canCorrectFinancials,
    canRefund: refundReason === null,
    canReverse: reversalReason === null,
    // Transactions have no draft/delete/archive lifecycle in the ledger.
    canDelete: false,
    canViewTechnicalDetails,
    reasons: {
      ...(editReason ? { edit: editReason } : {}),
      ...(refundReason ? { refund: refundReason } : {}),
      ...(reversalReason ? { reverse: reversalReason } : {}),
      delete: "DELETE_NOT_SUPPORTED",
    },
  };
}

function isCorrectionAllowed(
  transaction: TransactionActionPolicyInput["transaction"],
  isCurrentEffective: boolean,
): boolean {
  if (!isCurrentEffective || transaction.status !== "POSTED" || isImportedTransaction(transaction)) return false;
  return transaction.kind === "EXPENSE" || transaction.kind === "INCOME" || transaction.kind === "TRANSFER";
}

function getReversalReason(
  transaction: TransactionActionPolicyInput["transaction"],
  refundedAmountMinor: bigint,
  isCurrentEffective: boolean,
): TransactionActionReason | null {
  if (transaction.status !== "POSTED") return "TRANSACTION_NOT_POSTED";
  if (!isCurrentEffective) return "REVERSAL_NOT_SUPPORTED";
  if (isImportedTransaction(transaction)) return "IMPORTED_TRANSACTION_RESTRICTED";
  if (transaction.kind === "REFUND") return "REVERSAL_NOT_SUPPORTED";
  if (transaction.kind === "EXPENSE" && refundedAmountMinor > 0n) return "REVERSAL_NOT_SUPPORTED";
  return null;
}

function getEditReason(transaction: TransactionActionPolicyInput["transaction"]): TransactionActionReason | null {
  if (transaction.status !== "POSTED") return "TRANSACTION_NOT_POSTED";
  if (isImportedTransaction(transaction)) return "IMPORTED_TRANSACTION_RESTRICTED";
  if (transaction.kind === "REFUND") return "REFUND_IMMUTABLE";
  return null;
}

function getRefundReason(
  transaction: TransactionActionPolicyInput["transaction"],
  refundedAmountMinor: bigint,
  isCurrentEffective: boolean,
): TransactionActionReason | null {
  if (transaction.status !== "POSTED") return "TRANSACTION_NOT_POSTED";
  if (!isCurrentEffective) return "REFUND_NOT_APPLICABLE";
  if (transaction.kind !== "EXPENSE") return "REFUND_NOT_APPLICABLE";
  if (!transaction.categoryId) return "REFUND_REQUIRES_CATEGORY";
  if (refundedAmountMinor >= transaction.amountMinor) return "REFUND_FULLY_ISSUED";
  return null;
}

function isImportedTransaction(transaction: TransactionActionPolicyInput["transaction"]): boolean {
  return transaction.source.provider === "pace-import";
}
