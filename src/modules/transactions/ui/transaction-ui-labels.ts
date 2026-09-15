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
  readonly filterAllCategories: string;
  readonly filterAllAccounts: string;
  readonly filterFrom: string;
  readonly filterTo: string;
  readonly filterApply: string;
  readonly filterClear: string;
  readonly sortLabel: string;
  readonly sortNewest: string;
  readonly sortOldest: string;
  readonly sortHighest: string;
  readonly sortLowest: string;
  readonly sortAmountUnavailable: string;
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
  readonly emptyNoTransactions: string;
  readonly emptyNoResults: string;
  readonly emptyClearFilters: string;
  readonly unknownMerchant: string;
  readonly errorTitle: string;
  readonly errorRetry: string;
  readonly loading: string;
  readonly paginationPrevious: string;
  readonly paginationNext: string;
  readonly paginationPage: string;
  readonly paginationSummary: string;
  readonly paginationPerPage: string;
  readonly formAmount: string;
  readonly formAmountExpenseHelper: string;
  readonly formCurrency: string;
  readonly formCurrencySearch: string;
  readonly formCurrencyEmpty: string;
  readonly formMerchant: string;
  readonly formMerchantPlaceholder: string;
  readonly formMerchantHelper: string;
  readonly formCategory: string;
  readonly formCategoryPlaceholder: string;
  readonly formCategoryHelper: string;
  readonly formCategorySearch: string;
  readonly formAccount: string;
  readonly formAccountPlaceholder: string;
  readonly formAccountHelper: string;
  readonly formAccountSearch: string;
  readonly accountsEmptyTitle: string;
  readonly accountsEmptyDescription: string;
  readonly accountsCreate: string;
  readonly accountsCreateFirst: string;
  readonly accountsSearchNoResults: string;
  readonly accountCreateTitle: string;
  readonly accountCreateSubtitle: string;
  readonly accountCreateBackToExpense: string;
  readonly accountName: string;
  readonly accountNamePlaceholder: string;
  readonly accountType: string;
  readonly accountTypePlaceholder: string;
  readonly accountTypeSearch: string;
  readonly accountTypeEmpty: string;
  readonly accountCurrency: string;
  readonly accountCurrencyPlaceholder: string;
  readonly accountOpeningBalance: string;
  readonly accountOpeningBalanceOptional: string;
  readonly accountOpeningBalanceHelper: string;
  readonly accountCancel: string;
  readonly accountTypeCash: string;
  readonly accountTypeCashDescription: string;
  readonly accountTypeChecking: string;
  readonly accountTypeCheckingDescription: string;
  readonly accountTypeSavings: string;
  readonly accountTypeSavingsDescription: string;
  readonly accountTypeCreditCard: string;
  readonly accountTypeCreditCardDescription: string;
  readonly accountTypeMobileMoney: string;
  readonly accountTypeMobileMoneyDescription: string;
  readonly accountTypeOther: string;
  readonly accountTypeOtherDescription: string;
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
    filterAllCategories: labels["transactions.filters.allCategories"],
    filterAllAccounts: labels["transactions.filters.allAccounts"],
    filterFrom: labels["transactions.filters.from"],
    filterTo: labels["transactions.filters.to"],
    filterApply: labels["transactions.filters.apply"],
    filterClear: labels["transactions.filters.clear"],
    sortLabel: labels["transactions.sort.label"],
    sortNewest: labels["transactions.sort.newest"],
    sortOldest: labels["transactions.sort.oldest"],
    sortHighest: labels["transactions.sort.highest"],
    sortLowest: labels["transactions.sort.lowest"],
    sortAmountUnavailable: labels["transactions.sort.amountUnavailable"],
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
    emptyNoTransactions: labels["transactions.empty.noTransactions"],
    emptyNoResults: labels["transactions.empty.noResults"],
    emptyClearFilters: labels["transactions.empty.clearFilters"],
    unknownMerchant: labels["transactions.merchant.unknown"],
    errorTitle: labels["transactions.error.title"],
    errorRetry: labels["transactions.error.retry"],
    loading: labels["transactions.loading"],
    paginationPrevious: labels["transactions.pagination.previous"],
    paginationNext: labels["transactions.pagination.next"],
    paginationPage: labels["transactions.pagination.page"],
    paginationSummary: labels["transactions.pagination.summary"],
    paginationPerPage: labels["transactions.pagination.perPage"],
    formAmount: labels["transactions.form.amount"],
    formAmountExpenseHelper: labels["transactions.form.amountExpenseHelper"],
    formCurrency: labels["transactions.form.currency"],
    formCurrencySearch: labels["transactions.form.currencySearch"],
    formCurrencyEmpty: labels["transactions.form.currencyEmpty"],
    formMerchant: labels["transactions.form.merchant"],
    formMerchantPlaceholder: labels["transactions.form.merchantPlaceholder"],
    formMerchantHelper: labels["transactions.form.merchantHelper"],
    formCategory: labels["transactions.form.category"],
    formCategoryPlaceholder: labels["transactions.form.categoryPlaceholder"],
    formCategoryHelper: labels["transactions.form.categoryHelper"],
    formCategorySearch: labels["transactions.form.categorySearch"],
    formAccount: labels["transactions.form.account"],
    formAccountPlaceholder: labels["transactions.form.accountPlaceholder"],
    formAccountHelper: labels["transactions.form.accountHelper"],
    formAccountSearch: labels["transactions.form.accountSearch"],
    accountsEmptyTitle: labels["accounts.empty.title"],
    accountsEmptyDescription: labels["accounts.empty.description"],
    accountsCreate: labels["accounts.actions.create"],
    accountsCreateFirst: labels["accounts.actions.createFirst"],
    accountsSearchNoResults: labels["accounts.search.noResults"],
    accountCreateTitle: labels["accounts.create.title"],
    accountCreateSubtitle: labels["accounts.create.subtitle"],
    accountCreateBackToExpense: labels["accounts.create.backToExpense"],
    accountName: labels["accounts.fields.name"],
    accountNamePlaceholder: labels["accounts.fields.namePlaceholder"],
    accountType: labels["accounts.fields.type"],
    accountTypePlaceholder: labels["accounts.fields.typePlaceholder"],
    accountTypeSearch: labels["accounts.fields.typeSearch"],
    accountTypeEmpty: labels["accounts.fields.typeEmpty"],
    accountCurrency: labels["accounts.fields.currency"],
    accountCurrencyPlaceholder: labels["accounts.fields.currencyPlaceholder"],
    accountOpeningBalance: labels["accounts.fields.openingBalance"],
    accountOpeningBalanceOptional: labels["accounts.fields.openingBalanceOptional"],
    accountOpeningBalanceHelper: labels["accounts.fields.openingBalanceHelper"],
    accountCancel: labels["accounts.actions.cancel"],
    accountTypeCash: labels["accounts.type.cash.label"],
    accountTypeCashDescription: labels["accounts.type.cash.description"],
    accountTypeChecking: labels["accounts.type.checking.label"],
    accountTypeCheckingDescription: labels["accounts.type.checking.description"],
    accountTypeSavings: labels["accounts.type.savings.label"],
    accountTypeSavingsDescription: labels["accounts.type.savings.description"],
    accountTypeCreditCard: labels["accounts.type.creditCard.label"],
    accountTypeCreditCardDescription: labels["accounts.type.creditCard.description"],
    accountTypeMobileMoney: labels["accounts.type.mobileMoney.label"],
    accountTypeMobileMoneyDescription: labels["accounts.type.mobileMoney.description"],
    accountTypeOther: labels["accounts.type.other.label"],
    accountTypeOtherDescription: labels["accounts.type.other.description"],
  };
}
