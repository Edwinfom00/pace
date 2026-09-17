import type { TransactionUiLabels } from "../transaction-ui-labels";
import type { TransactionListItem, TransactionRowAction } from "../../types/transaction-ui.types";
import { TransactionTableRow } from "./transaction-table-row";

export function TransactionTable({
  transactions,
  labels,
  locale,
  timeZone,
  now,
  getRowActions,
  getDetailHref,
}: {
  readonly transactions: readonly TransactionListItem[];
  readonly labels: TransactionUiLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly getRowActions?: (transaction: TransactionListItem) => readonly TransactionRowAction[];
  readonly getDetailHref?: (transaction: TransactionListItem) => string;
}) {
  return (
    <div className="hidden overflow-hidden rounded-[12px] border border-[#e7ebf1] bg-white md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#e7ebf1] bg-[#fcfdff]">
              <th className="min-w-[235px] px-4 py-3 text-[11px] font-medium tracking-[-0.01em] text-[#71809a] sm:px-5" scope="col">
                {labels.columnTransaction}
              </th>
              <th className="px-3 py-3 text-[11px] font-medium tracking-[-0.01em] text-[#71809a]" scope="col">
                {labels.columnCategory}
              </th>
              <th className="hidden px-3 py-3 text-[11px] font-medium tracking-[-0.01em] text-[#71809a] xl:table-cell" scope="col">
                {labels.columnAccount}
              </th>
              <th className="px-3 py-3 text-[11px] font-medium tracking-[-0.01em] text-[#71809a]" scope="col">
                {labels.columnDate}
              </th>
              <th className="px-3 py-3 text-right text-[11px] font-medium tracking-[-0.01em] text-[#71809a]" scope="col">
                {labels.columnAmount}
              </th>
              <th className="hidden px-3 py-3 text-[11px] font-medium tracking-[-0.01em] text-[#71809a] xl:table-cell" scope="col">
                {labels.columnStatus}
              </th>
              <th className="w-11 px-2 py-3 sm:px-3">
                <span className="sr-only">{labels.columnActions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <TransactionTableRow
                actions={getRowActions?.(transaction)}
                key={transaction.id}
                labels={labels}
                locale={locale}
                now={now}
                timeZone={timeZone}
                transaction={transaction}
                detailHref={getDetailHref?.(transaction)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
