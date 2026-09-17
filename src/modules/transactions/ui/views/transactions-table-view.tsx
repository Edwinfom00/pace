import { hasActiveTransactionFilters, transactionListHref } from "../../domain/transaction-list-url";
import type {
  TransactionFilterOptions,
  TransactionFilterState,
  TransactionListItem,
  TransactionPaginationState,
} from "../../types/transaction-ui.types";
import { TransactionEmptyState } from "../components/transaction-empty-state";
import { TransactionMobileCard } from "../components/transaction-mobile-card";
import {
  TransactionNavigationProgress,
  TransactionNavigationProvider,
} from "../components/transaction-navigation";
import { TransactionPagination } from "../components/transaction-pagination";
import { TransactionsAskPace } from "../components/transactions-ask-pace";
import { TransactionTable } from "../components/transaction-table";
import { TransactionTableSkeleton } from "../components/transaction-table-skeleton";
import { TransactionToolbar } from "../components/transaction-toolbar";
import { TransactionCreateControl } from "../components/transaction-create-control";
import type { TransactionUiLabels } from "../transaction-ui-labels";
import type { TransactionAccountOptionsState } from "../../domain/transaction-account-options";
import type { TransactionCategoryOptionsState } from "../../domain/transaction-category-options";

export function TransactionsTableView({
  transactions,
  labels,
  locale,
  timeZone,
  now,
  pagination,
  filterState,
  filterOptions,
  amountSortingAvailable,
  accountOptions,
  categoryOptions,
  defaultCurrency,
  workspaceId,
  workspaceSlug,
  language,
  loading = false,
}: {
  readonly transactions: readonly TransactionListItem[];
  readonly labels: TransactionUiLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly pagination: TransactionPaginationState;
  readonly filterState: TransactionFilterState & { readonly page: number };
  readonly filterOptions: TransactionFilterOptions;
  readonly amountSortingAvailable: boolean;
  readonly accountOptions: TransactionAccountOptionsState;
  readonly categoryOptions: TransactionCategoryOptionsState;
  readonly defaultCurrency: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly language: "en" | "fr" | "de";
  readonly loading?: boolean;
}) {
  const pathname = `/w/${workspaceSlug}/transactions`;
  const filtered = hasActiveTransactionFilters(filterState);
  const totalCount = pagination.totalCount;
  const pageContext = {
    page: "transactions" as const,
    filters: {
      ...(filterState.search ? { search: filterState.search } : {}),
      ...(filterState.kind !== "ALL" ? { type: filterState.kind } : {}),
      ...(filterState.categoryId ? { categoryId: filterState.categoryId } : {}),
      ...(filterState.accountId ? { accountId: filterState.accountId } : {}),
      ...(filterState.from ? { from: filterState.from } : {}),
      ...(filterState.to ? { to: filterState.to } : {}),
      ...(filterState.sort !== "NEWEST" ? { sort: filterState.sort } : {}),
    },
  };

  return (
    <TransactionNavigationProvider>
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">{labels.title}</h1>
            {totalCount > 0 ? <span className="rounded-[7px] bg-[#eef2f7] px-2 py-0.5 text-[12px] font-medium text-[#53627b]">{totalCount}</span> : null}
          </div>
          <p className="mt-1 text-[13px] text-[#71809a]">{labels.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TransactionsAskPace language={language} locale={locale} pageContext={pageContext} timeZone={timeZone} workspaceId={workspaceId} />
          <TransactionCreateControl
            accountOptions={accountOptions}
            categoryOptions={categoryOptions}
            defaultCurrency={defaultCurrency}
            key={workspaceId}
            labels={labels}
            language={language}
            locale={locale}
            timeZone={timeZone}
          />
        </div>
      </header>
      <TransactionToolbar amountSortingAvailable={amountSortingAvailable} labels={labels} locale={locale} options={filterOptions} pathname={pathname} state={filterState} />
      <section aria-label={labels.title} className="pt-5">
        <TransactionNavigationProgress label={labels.loading} />
        {loading ? (
          <TransactionTableSkeleton />
        ) : transactions.length === 0 ? (
          <TransactionEmptyState clearFiltersHref={filtered ? transactionListHref(pathname, { kind: "ALL", page: 1, search: "", sort: "NEWEST" }) : undefined} filtered={filtered} labels={labels} />
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
            <TransactionPagination labels={labels} pagination={pagination} pathname={pathname} state={filterState} />
          </>
        )}
      </section>
    </main>
    </TransactionNavigationProvider>
  );
}
