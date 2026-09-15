import type { DashboardLabels } from "@/i18n/dashboard-messages";

export type TransactionUiLabels = {
  readonly title: string;
  readonly description: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly filtersLabel: string;
  readonly filterAll: string;
  readonly filterExpense: string;
  readonly filterIncome: string;
  readonly filterTransfer: string;
  readonly filterRefund: string;
  readonly filterCategory: string;
  readonly filterAccount: string;
  readonly filterDate: string;
  readonly filterMore: string;
  readonly filtersAvailableSoon: string;
  readonly sortLabel: string;
  readonly sortNewest: string;
  readonly sortOldest: string;
  readonly sortHighest: string;
  readonly sortLowest: string;
  readonly columnTransaction: string;
  readonly columnCategory: string;
  readonly columnAccount: string;
  readonly columnDate: string;
  readonly columnAmount: string;
  readonly columnStatus: string;
  readonly columnActions: string;
  readonly statusPosted: string;
  readonly statusPending: string;
  readonly uncategorized: string;
  readonly accountUnavailable: string;
  readonly today: string;
  readonly yesterday: string;
  readonly actionsMenu: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly paginationPrevious: string;
  readonly paginationNext: string;
  readonly paginationPage: string;
  readonly paginationSummary: string;
  readonly paginationPerPage: string;
};

export function getTransactionUiLabels(labels: DashboardLabels): TransactionUiLabels {
  return {
    title: labels["transactions.title"],
    description: labels["transactions.description"],
    searchLabel: labels["transactions.search.label"],
    searchPlaceholder: labels["transactions.search.placeholder"],
    filtersLabel: labels["transactions.filters.label"],
    filterAll: labels["transactions.filters.all"],
    filterExpense: labels["transactions.filters.expense"],
    filterIncome: labels["transactions.filters.income"],
    filterTransfer: labels["transactions.filters.transfer"],
    filterRefund: labels["transactions.filters.refund"],
    filterCategory: labels["transactions.filters.category"],
    filterAccount: labels["transactions.filters.account"],
    filterDate: labels["transactions.filters.date"],
    filterMore: labels["transactions.filters.more"],
    filtersAvailableSoon: labels["transactions.filters.availableSoon"],
    sortLabel: labels["transactions.sort.label"],
    sortNewest: labels["transactions.sort.newest"],
    sortOldest: labels["transactions.sort.oldest"],
    sortHighest: labels["transactions.sort.highest"],
    sortLowest: labels["transactions.sort.lowest"],
    columnTransaction: labels["transactions.columns.transaction"],
    columnCategory: labels["transactions.columns.category"],
    columnAccount: labels["transactions.columns.account"],
    columnDate: labels["transactions.columns.date"],
    columnAmount: labels["transactions.columns.amount"],
    columnStatus: labels["transactions.columns.status"],
    columnActions: labels["transactions.columns.actions"],
    statusPosted: labels["transactions.status.posted"],
    statusPending: labels["transactions.status.pending"],
    uncategorized: labels["transactions.uncategorized"],
    accountUnavailable: labels["transactions.account.unavailable"],
    today: labels["transactions.date.today"],
    yesterday: labels["transactions.date.yesterday"],
    actionsMenu: labels["transactions.actions.menu"],
    emptyTitle: labels["transactions.empty.title"],
    emptyDescription: labels["transactions.empty.description"],
    paginationPrevious: labels["transactions.pagination.previous"],
    paginationNext: labels["transactions.pagination.next"],
    paginationPage: labels["transactions.pagination.page"],
    paginationSummary: labels["transactions.pagination.summary"],
    paginationPerPage: labels["transactions.pagination.perPage"],
  };
}
