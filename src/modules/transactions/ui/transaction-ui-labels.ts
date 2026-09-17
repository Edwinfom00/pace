import type { DashboardLabels } from "@/i18n/dashboard-messages";
import type { TransactionFormValidationErrorCode } from "../schemas/transaction-form.schema";

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
  readonly accountLoading: string;
  readonly accountLoadError: string;
  readonly categoryLoading: string;
  readonly categoryLoadError: string;
  readonly categoryEmpty: string;
  readonly paginationPrevious: string;
  readonly paginationNext: string;
  readonly paginationPage: string;
  readonly paginationSummary: string;
  readonly paginationPerPage: string;
  readonly formAmount: string;
  readonly formAmountExpenseHelper: string;
  readonly formAmountIncomeHelper: string;
  readonly formAmountTransferHelper: string;
  readonly formCurrency: string;
  readonly formCurrencySearch: string;
  readonly formCurrencyEmpty: string;
  readonly validation: Readonly<Record<TransactionFormValidationErrorCode, string>>;
  readonly formMerchant: string;
  readonly formMerchantPlaceholder: string;
  readonly formMerchantHelper: string;
  readonly formSource: string;
  readonly formSourcePlaceholder: string;
  readonly formSourceHelper: string;
  readonly formCategory: string;
  readonly formCategoryPlaceholder: string;
  readonly formCategoryHelper: string;
  readonly formCategorySearch: string;
  readonly formAccount: string;
  readonly formAccountPlaceholder: string;
  readonly formAccountHelper: string;
  readonly formAccountIncomeHelper: string;
  readonly formFromAccount: string;
  readonly formFromAccountPlaceholder: string;
  readonly formToAccount: string;
  readonly formToAccountPlaceholder: string;
  readonly formAccountUnavailable: string;
  readonly formAccountSearch: string;
  readonly formDate: string;
  readonly formTime: string;
  readonly formOptional: string;
  readonly formTimePlaceholder: string;
  readonly formNote: string;
  readonly formNotePlaceholder: string;
  readonly formTipTitle: string;
  readonly formTipExpense: string;
  readonly formTipIncome: string;
  readonly formTipTransfer: string;
  readonly actionRemove: string;
  readonly actionCancel: string;
  readonly actionAddExpense: string;
  readonly actionSavingExpense: string;
  readonly actionAddIncome: string;
  readonly actionSavingIncome: string;
  readonly actionTransferMoney: string;
  readonly actionTransferring: string;
  readonly expenseCreated: string;
  readonly expenseCreateErrorGeneric: string;
  readonly incomeCreated: string;
  readonly incomeCreateErrorGeneric: string;
  readonly transferCreated: string;
  readonly transferCreateErrorGeneric: string;
  readonly accountsEmptyTitle: string;
  readonly accountsEmptyDescription: string;
  readonly accountsCreate: string;
  readonly accountsCreateFirst: string;
  readonly accountsSearchNoResults: string;
  readonly accountCreateTitle: string;
  readonly accountCreateSubtitle: string;
  readonly accountCreateBackToExpense: string;
  readonly accountCreateBackToTransfer: string;
  readonly accountCreatePending: string;
  readonly accountCreateSuccess: string;
  readonly accountCreateErrorGeneric: string;
  readonly accountCreateErrorWorkspaceForbidden: string;
  readonly accountCreateErrorWorkspaceChanged: string;
  readonly accountCreateErrorName: string;
  readonly accountCreateErrorType: string;
  readonly accountCreateErrorCurrency: string;
  readonly accountCreateErrorOpeningBalance: string;
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
    accountLoading: labels["transactions.accounts.loading"],
    accountLoadError: labels["transactions.accounts.error"],
    categoryLoading: labels["transactions.categories.loading"],
    categoryLoadError: labels["transactions.categories.error"],
    categoryEmpty: labels["transactions.categories.empty"],
    paginationPrevious: labels["transactions.pagination.previous"],
    paginationNext: labels["transactions.pagination.next"],
    paginationPage: labels["transactions.pagination.page"],
    paginationSummary: labels["transactions.pagination.summary"],
    paginationPerPage: labels["transactions.pagination.perPage"],
    formAmount: labels["transactions.form.amount"],
    formAmountExpenseHelper: labels["transactions.form.amountExpenseHelper"],
    formAmountIncomeHelper: labels["transactions.form.amountIncomeHelper"],
    formAmountTransferHelper: labels["transactions.form.amountTransferHelper"],
    formCurrency: labels["transactions.form.currency"],
    formCurrencySearch: labels["transactions.form.currencySearch"],
    formCurrencyEmpty: labels["transactions.form.currencyEmpty"],
    validation: {
      "transactions.validation.amountRequired": labels["transactions.validation.amountRequired"],
      "transactions.validation.amountInvalid": labels["transactions.validation.amountInvalid"],
      "transactions.validation.amountPositive": labels["transactions.validation.amountPositive"],
      "transactions.validation.currencyRequired": labels["transactions.validation.currencyRequired"],
      "transactions.validation.currencyUnsupported": labels["transactions.validation.currencyUnsupported"],
      "transactions.validation.accountRequired": labels["transactions.validation.accountRequired"],
      "transactions.validation.accountUnavailable": labels["transactions.validation.accountUnavailable"],
      "transactions.validation.categoryUnavailable": labels["transactions.validation.categoryUnavailable"],
      "transactions.validation.dateRequired": labels["transactions.validation.dateRequired"],
      "transactions.validation.invalidDate": labels["transactions.validation.invalidDate"],
      "transactions.validation.invalidTime": labels["transactions.validation.invalidTime"],
      "transactions.validation.noteTooLong": labels["transactions.validation.noteTooLong"],
      "transactions.validation.optionalTextBlank": labels["transactions.validation.optionalTextBlank"],
      "transactions.validation.optionalTextTooLong": labels["transactions.validation.optionalTextTooLong"],
      "transactions.validation.fromAccountRequired": labels["transactions.validation.fromAccountRequired"],
      "transactions.validation.toAccountRequired": labels["transactions.validation.toAccountRequired"],
      "transactions.validation.sameTransferAccount": labels["transactions.validation.sameTransferAccount"],
      "transactions.validation.crossCurrencyTransferUnsupported": labels["transactions.validation.crossCurrencyTransferUnsupported"],
    },
    formMerchant: labels["transactions.form.merchant"],
    formMerchantPlaceholder: labels["transactions.form.merchantPlaceholder"],
    formMerchantHelper: labels["transactions.form.merchantHelper"],
    formSource: labels["transactions.form.source"],
    formSourcePlaceholder: labels["transactions.form.sourcePlaceholder"],
    formSourceHelper: labels["transactions.form.sourceHelper"],
    formCategory: labels["transactions.form.category"],
    formCategoryPlaceholder: labels["transactions.form.categoryPlaceholder"],
    formCategoryHelper: labels["transactions.form.categoryHelper"],
    formCategorySearch: labels["transactions.form.categorySearch"],
    formAccount: labels["transactions.form.account"],
    formAccountPlaceholder: labels["transactions.form.accountPlaceholder"],
    formAccountHelper: labels["transactions.form.accountHelper"],
    formAccountIncomeHelper: labels["transactions.form.accountIncomeHelper"],
    formFromAccount: labels["transactions.form.fromAccount"],
    formFromAccountPlaceholder: labels["transactions.form.fromAccountPlaceholder"],
    formToAccount: labels["transactions.form.toAccount"],
    formToAccountPlaceholder: labels["transactions.form.toAccountPlaceholder"],
    formAccountUnavailable: labels["transactions.form.accountUnavailable"],
    formAccountSearch: labels["transactions.form.accountSearch"],
    formDate: labels["transactions.form.date"],
    formTime: labels["transactions.form.time"],
    formOptional: labels["transactions.form.optional"],
    formTimePlaceholder: labels["transactions.form.timePlaceholder"],
    formNote: labels["transactions.form.note"],
    formNotePlaceholder: labels["transactions.form.notePlaceholder"],
    formTipTitle: labels["transactions.form.tip.title"],
    formTipExpense: labels["transactions.form.tip.expense"],
    formTipIncome: labels["transactions.form.tip.income"],
    formTipTransfer: labels["transactions.form.tip.transfer"],
    actionRemove: labels["transactions.actions.remove"],
    actionCancel: labels["transactions.actions.cancel"],
    actionAddExpense: labels["transactions.actions.addExpense"],
    actionSavingExpense: labels["transactions.actions.savingExpense"],
    actionAddIncome: labels["transactions.actions.addIncome"],
    actionSavingIncome: labels["transactions.actions.savingIncome"],
    actionTransferMoney: labels["transactions.actions.transferMoney"],
    actionTransferring: labels["transactions.actions.transferring"],
    expenseCreated: labels["transactions.feedback.expenseCreated"],
    expenseCreateErrorGeneric: labels["transactions.errors.expenseCreateFailed"],
    incomeCreated: labels["transactions.feedback.incomeCreated"],
    incomeCreateErrorGeneric: labels["transactions.errors.incomeCreateFailed"],
    transferCreated: labels["transactions.feedback.transferCreated"],
    transferCreateErrorGeneric: labels["transactions.errors.transferCreateFailed"],
    accountsEmptyTitle: labels["accounts.empty.title"],
    accountsEmptyDescription: labels["accounts.empty.description"],
    accountsCreate: labels["accounts.actions.create"],
    accountsCreateFirst: labels["accounts.actions.createFirst"],
    accountsSearchNoResults: labels["accounts.search.noResults"],
    accountCreateTitle: labels["accounts.create.title"],
    accountCreateSubtitle: labels["accounts.create.subtitle"],
    accountCreateBackToExpense: labels["accounts.create.backToExpense"],
    accountCreateBackToTransfer: labels["accounts.create.backToTransfer"],
    accountCreatePending: labels["accounts.create.pending"],
    accountCreateSuccess: labels["accounts.create.success"],
    accountCreateErrorGeneric: labels["accounts.create.errorGeneric"],
    accountCreateErrorWorkspaceForbidden: labels["accounts.create.errorWorkspaceForbidden"],
    accountCreateErrorWorkspaceChanged: labels["accounts.create.errorWorkspaceChanged"],
    accountCreateErrorName: labels["accounts.create.errorName"],
    accountCreateErrorType: labels["accounts.create.errorType"],
    accountCreateErrorCurrency: labels["accounts.create.errorCurrency"],
    accountCreateErrorOpeningBalance: labels["accounts.create.errorOpeningBalance"],
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
