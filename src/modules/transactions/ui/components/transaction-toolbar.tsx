import type { TransactionUiLabels } from "../transaction-ui-labels";
import { TransactionFilterBar } from "./transaction-filter-bar";
import { TransactionSortControl } from "./transaction-sort-control";

export function TransactionToolbar({ labels }: { readonly labels: TransactionUiLabels }) {
  return (
    <section aria-label={labels.filtersLabel} className="flex flex-col gap-2.5 border-y border-[#edf0f4] py-3.5 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
      <div className="min-w-0 flex-1">
        <TransactionFilterBar labels={labels} />
      </div>
      <TransactionSortControl labels={labels} />
    </section>
  );
}
