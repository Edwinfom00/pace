import type { DashboardLabels } from "@/i18n/dashboard-messages";
import type { TransactionActionReason } from "@/modules/transactions/domain/transaction-action-policy";

export type TransactionDetailActionLabels = {
  readonly title: string;
  readonly edit: string;
  readonly createRefund: string;
  readonly comingSoon: string;
  readonly unavailable: Readonly<Record<TransactionActionReason, string>>;
};

export function getTransactionDetailActionLabels(labels: DashboardLabels): TransactionDetailActionLabels {
  return {
    title: labels["transactions.actions.detail.title"],
    edit: labels["transactions.actions.detail.edit"],
    createRefund: labels["transactions.actions.detail.createRefund"],
    comingSoon: labels["transactions.actions.detail.comingSoon"],
    unavailable: {
      READ_ONLY_ROLE: labels["transactions.actions.unavailable.readOnly"],
      TRANSACTION_NOT_POSTED: labels["transactions.actions.unavailable.notPosted"],
      IMPORTED_TRANSACTION_RESTRICTED: labels["transactions.actions.unavailable.imported"],
      TRANSFER_REQUIRES_REVERSAL: labels["transactions.actions.unavailable.transferEdit"],
      REFUND_IMMUTABLE: labels["transactions.actions.unavailable.refundImmutable"],
      REFUND_NOT_APPLICABLE: labels["transactions.actions.unavailable.refundNotApplicable"],
      REFUND_REQUIRES_CATEGORY: labels["transactions.actions.unavailable.refundRequiresCategory"],
      REFUND_FULLY_ISSUED: labels["transactions.actions.unavailable.refundFullyIssued"],
      REVERSAL_NOT_SUPPORTED: labels["transactions.actions.unavailable.reversalUnsupported"],
      DELETE_NOT_SUPPORTED: labels["transactions.actions.unavailable.deleteUnsupported"],
    },
  };
}
