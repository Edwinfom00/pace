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
};


export function getTransactionCapabilities({
  transaction,
  workspaceRole,
  refundedAmountMinor,
}: TransactionActionPolicyInput): TransactionCapabilities {
  const canManageLedger = canPerformWorkspaceAction(workspaceRole, "manage_ledger");
  const canViewTechnicalDetails = canPerformWorkspaceAction(workspaceRole, "read");

  if (!canManageLedger) {
    return {
      canEdit: false,
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
  const refundReason = getRefundReason(transaction, refundedAmountMinor);

  return {
    canEdit: editReason === null,
    canRefund: refundReason === null,
    // Ledger transactions are append-only. The current model does not yet have
    // a reversal representation that can preserve the original transaction.
    canReverse: false,
    // Transactions have no draft/delete/archive lifecycle in the ledger.
    canDelete: false,
    canViewTechnicalDetails,
    reasons: {
      ...(editReason ? { edit: editReason } : {}),
      ...(refundReason ? { refund: refundReason } : {}),
      reverse: "REVERSAL_NOT_SUPPORTED",
      delete: "DELETE_NOT_SUPPORTED",
    },
  };
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
): TransactionActionReason | null {
  if (transaction.status !== "POSTED") return "TRANSACTION_NOT_POSTED";
  if (transaction.kind !== "EXPENSE") return "REFUND_NOT_APPLICABLE";
  if (!transaction.categoryId) return "REFUND_REQUIRES_CATEGORY";
  if (refundedAmountMinor >= transaction.amountMinor) return "REFUND_FULLY_ISSUED";
  return null;
}

function isImportedTransaction(transaction: TransactionActionPolicyInput["transaction"]): boolean {
  return transaction.source.provider === "pace-import";
}
