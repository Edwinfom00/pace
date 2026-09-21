import type { DashboardLabels } from "@/i18n/dashboard-messages";
import type { LedgerAccountType } from "@/modules/ledger/domain";

export type TransactionEditLabels = {
  readonly title: string;
  readonly subtitle: string;
  readonly readOnly: string;
  readonly currencyLocked: string;
  readonly typeLocked: string;
  readonly save: string;
  readonly saving: string;
  readonly reviewCorrection: string;
  readonly noChanges: string;
  readonly concurrentModification: string;
  readonly reload: string;
  readonly failed: string;
  readonly notAllowed: string;
  readonly financialCorrectionUnavailable: string;
  readonly clearCategory: string;
  readonly clearTime: string;
  readonly counterpartyTooLong: string;
  readonly noteTooLong: string;
  readonly cancel: string;
  readonly amount: string;
  readonly amountInvalid: string;
  readonly amountPositive: string;
  readonly currency: string;
  readonly currencyEmpty: string;
  readonly currencySearch: string;
  readonly account: string;
  readonly fromAccount: string;
  readonly toAccount: string;
  readonly accountUnavailable: string;
  readonly accountValidationUnavailable: string;
  readonly accountPlaceholder: string;
  readonly accountHelper: string;
  readonly accountIncomeHelper: string;
  readonly accountSearch: string;
  readonly accountsEmptyTitle: string;
  readonly accountsEmptyDescription: string;
  readonly accountsNoResults: string;
  readonly accountsCreate: string;
  readonly accountsCreateFirst: string;
  readonly financialAccountUnavailable: string;
  readonly fromAccountRequired: string;
  readonly toAccountRequired: string;
  readonly sameTransferAccount: string;
  readonly crossCurrencyTransferUnsupported: string;
  readonly merchant: string;
  readonly merchantPlaceholder: string;
  readonly merchantHelper: string;
  readonly source: string;
  readonly sourcePlaceholder: string;
  readonly sourceHelper: string;
  readonly category: string;
  readonly categoryPlaceholder: string;
  readonly categoryHelper: string;
  readonly categorySearch: string;
  readonly categoryEmpty: string;
  readonly date: string;
  readonly time: string;
  readonly optional: string;
  readonly timePlaceholder: string;
  readonly note: string;
  readonly notePlaceholder: string;
  readonly invalidDate: string;
  readonly invalidTime: string;
  readonly invalidCategory: string;
  readonly notProvided: string;
  readonly uncategorized: string;
  readonly balance: {
    readonly available: string;
    readonly current: string;
    readonly afterTransaction: string;
    readonly unavailable: string;
    readonly insufficientFunds: string;
    readonly balanceChanged: string;
  };
  readonly accountTypes: Readonly<Record<LedgerAccountType, string>>;
  readonly correction: {
    readonly reviewTitle: string;
    readonly reviewDescription: string;
    readonly before: string;
    readonly after: string;
    readonly reason: string;
    readonly reasonOptional: string;
    readonly reasonDetails: string;
    readonly originalPreserved: string;
    readonly backToEdit: string;
    readonly apply: string;
    readonly applying: string;
    readonly failed: string;
    readonly success: string;
    readonly conflict: string;
    readonly reloadLatest: string;
    readonly notAllowed: string;
    readonly refundLimit: string;
    readonly applyUnavailable: string;
    readonly incorrectAmount: string;
    readonly wrongAccount: string;
    readonly wrongTransferDetails: string;
    readonly other: string;
  };
};

export function getTransactionEditLabels(labels: DashboardLabels): TransactionEditLabels {
  return {
    title: labels["transactions.edit.title"],
    subtitle: labels["transactions.edit.subtitle"],
    readOnly: labels["transactions.edit.readOnly"],
    currencyLocked: labels["transactions.edit.currencyLocked"],
    typeLocked: labels["transactions.edit.typeLocked"],
    save: labels["transactions.edit.save"],
    saving: labels["transactions.edit.saving"],
    reviewCorrection: labels["transactions.correction.review"],
    noChanges: labels["transactions.edit.noChanges"],
    concurrentModification: labels["transactions.edit.concurrentModification"],
    reload: labels["transactions.edit.reload"],
    failed: labels["transactions.edit.failed"],
    notAllowed: labels["transactions.edit.notAllowed"],
    financialCorrectionUnavailable: labels["transactions.correction.unavailable"],
    clearCategory: labels["transactions.edit.clearCategory"],
    clearTime: labels["transactions.edit.clearTime"],
    counterpartyTooLong: labels["transactions.edit.counterpartyTooLong"],
    noteTooLong: labels["transactions.edit.noteTooLong"],
    cancel: labels["transactions.actions.cancel"],
    amount: labels["transactions.form.amount"],
    amountInvalid: labels["transactions.validation.amountInvalid"],
    amountPositive: labels["transactions.validation.amountPositive"],
    currency: labels["transactions.form.currency"],
    currencyEmpty: labels["transactions.form.currencyEmpty"],
    currencySearch: labels["transactions.form.currencySearch"],
    account: labels["transactions.form.account"],
    fromAccount: labels["transactions.form.fromAccount"],
    toAccount: labels["transactions.form.toAccount"],
    accountUnavailable: labels["transactions.validation.accountUnavailable"],
    accountValidationUnavailable: labels["transactions.validation.accountUnavailable"],
    accountPlaceholder: labels["transactions.form.accountPlaceholder"],
    accountHelper: labels["transactions.form.accountHelper"],
    accountIncomeHelper: labels["transactions.form.accountIncomeHelper"],
    accountSearch: labels["transactions.form.accountSearch"],
    accountsEmptyTitle: labels["accounts.empty.title"],
    accountsEmptyDescription: labels["accounts.empty.description"],
    accountsNoResults: labels["accounts.search.noResults"],
    accountsCreate: labels["accounts.actions.create"],
    accountsCreateFirst: labels["accounts.actions.createFirst"],
    financialAccountUnavailable: labels["transactions.correction.accountUnavailable"],
    fromAccountRequired: labels["transactions.validation.fromAccountRequired"],
    toAccountRequired: labels["transactions.validation.toAccountRequired"],
    sameTransferAccount: labels["transactions.validation.sameTransferAccount"],
    crossCurrencyTransferUnsupported: labels["transactions.validation.crossCurrencyTransferUnsupported"],
    merchant: labels["transactions.form.merchant"],
    merchantPlaceholder: labels["transactions.form.merchantPlaceholder"],
    merchantHelper: labels["transactions.form.merchantHelper"],
    source: labels["transactions.form.source"],
    sourcePlaceholder: labels["transactions.form.sourcePlaceholder"],
    sourceHelper: labels["transactions.form.sourceHelper"],
    category: labels["transactions.form.category"],
    categoryPlaceholder: labels["transactions.form.categoryPlaceholder"],
    categoryHelper: labels["transactions.form.categoryHelper"],
    categorySearch: labels["transactions.form.categorySearch"],
    categoryEmpty: labels["transactions.categories.empty"],
    date: labels["transactions.form.date"],
    time: labels["transactions.form.time"],
    optional: labels["transactions.form.optional"],
    timePlaceholder: labels["transactions.form.timePlaceholder"],
    note: labels["transactions.form.note"],
    notePlaceholder: labels["transactions.form.notePlaceholder"],
    invalidDate: labels["transactions.validation.invalidDate"],
    invalidTime: labels["transactions.validation.invalidTime"],
    invalidCategory: labels["transactions.validation.categoryUnavailable"],
    notProvided: labels["transactions.correction.notProvided"],
    uncategorized: labels["transactions.uncategorized"],
    balance: {
      available: labels["accounts.balance.available"],
      current: labels["accounts.balance.current"],
      afterTransaction: labels["accounts.balance.afterTransaction"],
      unavailable: labels["accounts.balance.unavailable"],
      insufficientFunds: labels["transactions.validation.insufficientFunds"],
      balanceChanged: labels["transactions.validation.balanceChanged"],
    },
    accountTypes: {
      CASH: labels["accounts.type.cash.label"],
      CHECKING: labels["accounts.type.checking.label"],
      SAVINGS: labels["accounts.type.savings.label"],
      CREDIT_CARD: labels["accounts.type.creditCard.label"],
      MOBILE_MONEY: labels["accounts.type.mobileMoney.label"],
      OTHER: labels["accounts.type.other.label"],
    },
    correction: {
      reviewTitle: labels["transactions.correction.reviewTitle"],
      reviewDescription: labels["transactions.correction.reviewDescription"],
      before: labels["transactions.correction.before"],
      after: labels["transactions.correction.after"],
      reason: labels["transactions.correction.reason"],
      reasonOptional: labels["transactions.correction.reasonOptional"],
      reasonDetails: labels["transactions.correction.reasonDetails"],
      originalPreserved: labels["transactions.correction.originalPreserved"],
      backToEdit: labels["transactions.correction.backToEdit"],
      apply: labels["transactions.correction.apply"],
      applying: labels["transactions.correction.applying"],
      failed: labels["transactions.correction.failed"],
      success: labels["transactions.correction.success"],
      conflict: labels["transactions.correction.conflict"],
      reloadLatest: labels["transactions.correction.reloadLatest"],
      notAllowed: labels["transactions.correction.notAllowed"],
      refundLimit: labels["transactions.correction.refundLimit"],
      applyUnavailable: labels["transactions.correction.applyUnavailable"],
      incorrectAmount: labels["transactions.correction.incorrectAmount"],
      wrongAccount: labels["transactions.correction.wrongAccount"],
      wrongTransferDetails: labels["transactions.correction.wrongTransferDetails"],
      other: labels["transactions.correction.other"],
    },
  };
}
