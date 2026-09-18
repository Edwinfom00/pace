import type { DashboardLabels } from "@/i18n/dashboard-messages";

export type TransactionEditLabels = {
  readonly title: string;
  readonly subtitle: string;
  readonly readOnly: string;
  readonly save: string;
  readonly saving: string;
  readonly noChanges: string;
  readonly concurrentModification: string;
  readonly reload: string;
  readonly failed: string;
  readonly notAllowed: string;
  readonly clearCategory: string;
  readonly clearTime: string;
  readonly counterpartyTooLong: string;
  readonly noteTooLong: string;
  readonly cancel: string;
  readonly amount: string;
  readonly account: string;
  readonly fromAccount: string;
  readonly toAccount: string;
  readonly accountUnavailable: string;
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
};

export function getTransactionEditLabels(labels: DashboardLabels): TransactionEditLabels {
  return {
    title: labels["transactions.edit.title"],
    subtitle: labels["transactions.edit.subtitle"],
    readOnly: labels["transactions.edit.readOnly"],
    save: labels["transactions.edit.save"],
    saving: labels["transactions.edit.saving"],
    noChanges: labels["transactions.edit.noChanges"],
    concurrentModification: labels["transactions.edit.concurrentModification"],
    reload: labels["transactions.edit.reload"],
    failed: labels["transactions.edit.failed"],
    notAllowed: labels["transactions.edit.notAllowed"],
    clearCategory: labels["transactions.edit.clearCategory"],
    clearTime: labels["transactions.edit.clearTime"],
    counterpartyTooLong: labels["transactions.edit.counterpartyTooLong"],
    noteTooLong: labels["transactions.edit.noteTooLong"],
    cancel: labels["transactions.actions.cancel"],
    amount: labels["transactions.form.amount"],
    account: labels["transactions.form.account"],
    fromAccount: labels["transactions.form.fromAccount"],
    toAccount: labels["transactions.form.toAccount"],
    accountUnavailable: labels["transactions.account.unavailable"],
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
  };
}
