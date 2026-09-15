import type { TransactionUiLabels } from "../transaction-ui-labels";
import type { TransactionListItem, TransactionRowAction } from "../../types/transaction-ui.types";
import { TransactionAccountCell } from "./transaction-account-cell";
import { TransactionAmountCell } from "./transaction-amount-cell";
import { TransactionCategoryBadge } from "./transaction-category-badge";
import { TransactionDateCell } from "./transaction-date-cell";
import { TransactionMerchantCell } from "./transaction-merchant-cell";
import { TransactionRowActions } from "./transaction-row-actions";
import { TransactionStatusBadge } from "./transaction-status-badge";

export function TransactionTableRow({
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
    <tr className="group border-b border-[#edf0f4] bg-white transition-colors hover:bg-[#fbfcfe] last:border-b-0">
      <td className="min-w-[235px] px-4 py-3.5 sm:px-5">
        <TransactionMerchantCell category={transaction.category} kind={transaction.kind} merchant={transaction.merchant} />
      </td>
      <td className="px-3 py-3.5">
        <TransactionCategoryBadge category={transaction.category} uncategorizedLabel={labels.uncategorized} />
      </td>
      <td className="hidden px-3 py-3.5 xl:table-cell">
        <TransactionAccountCell account={transaction.account} unavailableLabel={labels.accountUnavailable} />
      </td>
      <td className="px-3 py-3.5">
        <TransactionDateCell
          labels={{ today: labels.today, yesterday: labels.yesterday }}
          locale={locale}
          now={now}
          occurredAt={transaction.occurredAt}
          timeZone={timeZone}
        />
      </td>
      <td className="px-3 py-3.5 text-right">
        <TransactionAmountCell amount={transaction.amount} kind={transaction.kind} locale={locale} />
      </td>
      <td className="hidden px-3 py-3.5 xl:table-cell">
        <TransactionStatusBadge
          pendingLabel={labels.statusPending}
          postedLabel={labels.statusPosted}
          status={transaction.status}
        />
      </td>
      <td className="w-11 px-2 py-3.5 text-right sm:px-3">
        <TransactionRowActions actions={actions} label={labels.actionsMenu} merchantName={transaction.merchant.name} />
      </td>
    </tr>
  );
}
