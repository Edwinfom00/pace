import type { TransactionListItem, TransactionPaginationState } from "../../types/transaction-ui.types";
import { TransactionEmptyState } from "../components/transaction-empty-state";
import { TransactionMobileCard } from "../components/transaction-mobile-card";
import { TransactionPagination } from "../components/transaction-pagination";
import { TransactionTable } from "../components/transaction-table";
import { TransactionTableSkeleton } from "../components/transaction-table-skeleton";
import { TransactionToolbar } from "../components/transaction-toolbar";
import type { TransactionUiLabels } from "../transaction-ui-labels";

export function TransactionsTableView({
  transactions,
  labels,
  locale,
  timeZone,
  now,
  pagination,
  loading = false,
}: {
  readonly transactions: readonly TransactionListItem[];
  readonly labels: TransactionUiLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly pagination?: TransactionPaginationState;
  readonly loading?: boolean;
}) {
  const totalCount = pagination?.totalCount ?? transactions.length;

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">{labels.title}</h1>
            {totalCount > 0 ? <span className="rounded-[7px] bg-[#eef2f7] px-2 py-0.5 text-[12px] font-medium text-[#53627b]">{totalCount}</span> : null}
          </div>
          <p className="mt-1 text-[13px] text-[#71809a]">{labels.description}</p>
        </div>
      </header>
      <TransactionToolbar labels={labels} />
      <section aria-label={labels.title} className="pt-5">
        {loading ? (
          <TransactionTableSkeleton />
        ) : transactions.length === 0 ? (
          <TransactionEmptyState labels={labels} />
        ) : (
          <>
            <TransactionTable labels={labels} locale={locale} now={now} timeZone={timeZone} transactions={transactions} />
            <div className="space-y-2.5 md:hidden">
              {transactions.map((transaction) => (
                <TransactionMobileCard
                  key={transaction.id}
                  labels={labels}
                  locale={locale}
                  now={now}
                  timeZone={timeZone}
                  transaction={transaction}
                />
              ))}
            </div>
            {pagination ? <TransactionPagination labels={labels} pagination={pagination} /> : null}
          </>
        )}
      </section>
    </main>
  );
}
