import type {
  TransactionFilterOptions,
  TransactionListItem,
  TransactionListState,
  TransactionListSummary,
  TransactionPaginationState,
} from "../../types/transaction-ui.types";
import { transactionListHref } from "../../domain/transaction-list-url";
import {
  TransactionNavigationLoadingSurface,
  TransactionNavigationProvider,
} from "../components/transaction-navigation";
import { TransactionsAskPace } from "../components/transactions-ask-pace";
import { TransactionsDataTable } from "../components/transactions-data-table";
import { TransactionSummaryCards } from "../components/transaction-summary-cards";
import { TransactionCreateControl } from "../components/transaction-create-control";
import { TransactionImportLink } from "../components/transaction-import-link";
import type { TransactionUiLabels } from "../transaction-ui-labels";
import type { TransactionAccountOptionsState } from "../../domain/transaction-account-options";
import type { TransactionCategoryOptionsState } from "../../domain/transaction-category-options";
import type { CurrencyCode } from "@/money/currency";

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
  summary,
  accountOptions,
  categoryOptions,
  defaultCurrency,
  workspaceId,
  workspaceSlug,
  language,
  canImport = false,
  loading = false,
}: {
  readonly transactions: readonly TransactionListItem[];
  readonly labels: TransactionUiLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly pagination: TransactionPaginationState;
  readonly filterState: TransactionListState;
  readonly filterOptions: TransactionFilterOptions;
  readonly amountSortingAvailable: boolean;
  readonly summary: TransactionListSummary | null;
  readonly accountOptions: TransactionAccountOptionsState;
  readonly categoryOptions: TransactionCategoryOptionsState;
  readonly defaultCurrency: CurrencyCode;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly language: "en" | "fr" | "de";
  readonly canImport?: boolean;
  readonly loading?: boolean;
}) {
  const pathname = `/w/${workspaceSlug}/transactions`;
  const totalCount = pagination.totalCount;
  const exportHref = transactionListHref(`/api/workspaces/${workspaceId}/transactions/export`, { ...filterState, page: 1, pageSize: undefined });
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
      <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-3 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[32px]">{labels.title}</h1>
              {totalCount > 0 ? (
                <span className="rounded-[8px] bg-[#eef2f7] px-2.5 py-0.5 text-[14px] font-semibold tabular-nums text-[#34405d]">{totalCount}</span>
              ) : null}
            </div>
            <p className="mt-1 text-[14px] text-[#71809a]">{labels.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TransactionsAskPace language={language} locale={locale} pageContext={pageContext} timeZone={timeZone} workspaceId={workspaceId} />
            {canImport ? <TransactionImportLink label={labels.actionImport} workspaceSlug={workspaceSlug} /> : null}
            <TransactionCreateControl
              accountOptions={accountOptions}
              categoryOptions={categoryOptions}
              defaultCurrency={defaultCurrency}
              key={workspaceId}
              labels={labels}
              language={language}
              locale={locale}
              timeZone={timeZone}
              workspaceId={workspaceId}
            />
          </div>
        </header>
        <TransactionNavigationLoadingSurface label={labels.loading}>
          <TransactionsDataTable
            amountSortingAvailable={amountSortingAvailable}
            exportHref={exportHref}
            filterOptions={filterOptions}
            labels={labels}
            loading={loading}
            locale={locale}
            now={now}
            pagination={pagination}
            pathname={pathname}
            state={filterState}
            summary={summary ? <TransactionSummaryCards labels={labels} locale={locale} summary={summary} totalCount={totalCount} /> : null}
            timeZone={timeZone}
            transactions={transactions}
          />
        </TransactionNavigationLoadingSurface>
      </main>
    </TransactionNavigationProvider>
  );
}
