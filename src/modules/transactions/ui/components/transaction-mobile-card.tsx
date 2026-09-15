import type { TransactionUiLabels } from "../transaction-ui-labels";
import type { TransactionListItem, TransactionRowAction } from "../../types/transaction-ui.types";
import { TransactionAccountCell } from "./transaction-account-cell";
import { TransactionAmountCell } from "./transaction-amount-cell";
import { TransactionCategoryBadge } from "./transaction-category-badge";
import { TransactionDateCell } from "./transaction-date-cell";
import { TransactionMerchantCell } from "./transaction-merchant-cell";
import { TransactionRowActions } from "./transaction-row-actions";
import { TransactionStatusBadge } from "./transaction-status-badge";

export function TransactionMobileCard({
  transaction,
  labels,
  locale,
  timeZone,
  now,
  actions,
}: {
  readonly transaction: TransactionListItem;
  readonly labels: TransactionUiLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly actions?: readonly TransactionRowAction[];
}) {
  return (
    <article className="rounded-[12px] border border-[#e7ebf1] bg-white px-4 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <TransactionMerchantCell category={transaction.category} kind={transaction.kind} merchant={transaction.merchant} />
        </div>
        <TransactionAmountCell amount={transaction.amount} kind={transaction.kind} locale={locale} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 pl-11">
        <TransactionCategoryBadge category={transaction.category} uncategorizedLabel={labels.uncategorized} />
        <TransactionStatusBadge pendingLabel={labels.statusPending} postedLabel={labels.statusPosted} status={transaction.status} />
      </div>
      <div className="mt-3 flex min-w-0 items-center border-t border-[#f0f2f5] pt-3 pl-11">
        <TransactionDateCell
          labels={{ today: labels.today, yesterday: labels.yesterday }}
          locale={locale}
          now={now}
          occurredAt={transaction.occurredAt}
          timeZone={timeZone}
        />
        <span aria-hidden="true" className="mx-2 text-[#c0c8d5]">·</span>
        <TransactionAccountCell account={transaction.account} unavailableLabel={labels.accountUnavailable} />
        <span className="ml-auto -mr-1">
          <TransactionRowActions actions={actions} label={labels.actionsMenu} merchantName={transaction.merchant.name} />
        </span>
      </div>
    </article>
  );
}
