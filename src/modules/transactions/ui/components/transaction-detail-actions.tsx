import type { ReactNode } from "react";
import { Pencil, RefreshCw } from "lucide-react";

import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";
import type { TransactionCategoryOption } from "@/modules/transactions/domain/transaction-category-options";

import type { TransactionDetailActionLabels } from "../transaction-detail-action-labels";
import type { TransactionEditLabels } from "../transaction-edit-labels";
import { EditTransactionDialog } from "./edit-transaction-dialog";

export function TransactionDetailActions({
  categories,
  editLabels,
  locale,
  timeZone,
  transaction,
  labels,
  workspaceId,
}: {
  readonly categories: readonly TransactionCategoryOption[];
  readonly editLabels: TransactionEditLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly transaction: TransactionDetailData;
  readonly labels: TransactionDetailActionLabels;
  readonly workspaceId: string;
}) {
  const editReason = transaction.capabilities.reasons.edit;
  const refundReason = transaction.capabilities.reasons.refund;

  return (
    <section aria-labelledby="transaction-actions-heading" className="rounded-[13px] border border-[#e6eaf0] bg-white p-4 sm:p-4.5">
      <h2 className="text-[17px] font-semibold tracking-tight text-[#101a35]" id="transaction-actions-heading">{labels.title}</h2>
      <div className="mt-3 space-y-2">
        {transaction.capabilities.canEdit ? (
          <EditTransactionDialog
            categories={categories}
            labels={editLabels}
            locale={locale}
            timeZone={timeZone}
            transaction={transaction}
            workspaceId={workspaceId}
          />
        ) : (
          <ActionUnavailable
            icon={<Pencil aria-hidden className="size-4" />}
            label={labels.edit}
            reason={editReason ? labels.unavailable[editReason] : labels.comingSoon}
          />
        )}
        {transaction.kind === "EXPENSE" ? (
          <ActionUnavailable
            icon={<RefreshCw aria-hidden className="size-4" />}
            label={labels.createRefund}
            reason={refundReason ? labels.unavailable[refundReason] : labels.comingSoon}
          />
        ) : null}
      </div>
    </section>
  );
}

function ActionUnavailable({
  icon,
  label,
  reason,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly reason: string;
}) {
  return (
    <div>
      <button
        className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[#e2e7ef] bg-white text-[13px] font-medium text-[#8a96a8]"
        disabled
        type="button"
      >
        {icon}{label}
      </button>
      <p className="mt-1.5 text-[12px] leading-5 text-[#71809a]">{reason}</p>
    </div>
  );
}
