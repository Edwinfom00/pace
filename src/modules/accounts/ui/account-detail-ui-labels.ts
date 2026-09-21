import type { DashboardLabels } from "@/i18n/dashboard-messages";
import type { LedgerAccountType } from "@/modules/ledger/domain";

import type { AccountDetailChartRange, AccountDetailStatus } from "../domain/account-detail";

export type AccountDetailUiLabels = {
  readonly back: string;
  readonly currentBalance: string;
  readonly availableBalance: string;
  readonly inflows: string;
  readonly outflows: string;
  readonly netTransfers: string;
  readonly transactions: string;
  readonly balanceHistory: string;
  readonly balanceHistoryDescription: string;
  readonly chartRange: Readonly<Record<AccountDetailChartRange, string>>;
  readonly chartSummary: string;
  readonly information: string;
  readonly type: string;
  readonly currency: string;
  readonly status: string;
  readonly createdAt: string;
  readonly quickSummary: string;
  readonly thisMonth: string;
  readonly transactionCount: string;
  readonly topCategories: string;
  readonly topCategoriesEmpty: string;
  readonly recentTransactions: string;
  readonly recentTransactionsEmpty: string;
  readonly viewAllTransactions: string;
  readonly transfer: string;
  readonly transferFrom: string;
  readonly transferTo: string;
  readonly loadingHistory: string;
  readonly notFoundTitle: string;
  readonly notFoundDescription: string;
  readonly statusValues: Readonly<Record<AccountDetailStatus, string>>;
  readonly typeValues: Readonly<Record<LedgerAccountType, string>>;
  readonly management: {
    readonly actions: {
      readonly edit: string;
      readonly archive: string;
      readonly restore: string;
      readonly more: string;
      readonly cancel: string;
      readonly close: string;
    };
    readonly archivedDescription: string;
    readonly edit: {
      readonly title: string;
      readonly description: string;
      readonly name: string;
      readonly type: string;
      readonly currency: string;
      readonly currencyLocked: string;
      readonly typeLocked: string;
      readonly typeTransitionLocked: string;
      readonly readOnly: string;
      readonly save: string;
      readonly saving: string;
      readonly noChanges: string;
      readonly invalidName: string;
      readonly nameTooLong: string;
      readonly failed: string;
      readonly notAllowed: string;
      readonly conflict: string;
      readonly reloadLatest: string;
    };
    readonly archive: {
      readonly title: string;
      readonly description: string;
      readonly currentBalance: string;
      readonly historyPreserved: string;
      readonly confirm: string;
      readonly archiving: string;
      readonly success: string;
      readonly failed: string;
    };
    readonly restore: {
      readonly title: string;
      readonly description: string;
      readonly confirm: string;
      readonly restoring: string;
      readonly success: string;
      readonly failed: string;
    };
  };
  readonly columns: {
    readonly transaction: string;
    readonly category: string;
    readonly date: string;
    readonly amount: string;
    readonly status: string;
  };
  readonly posted: string;
  readonly pending: string;
  readonly uncategorized: string;
  readonly today: string;
  readonly yesterday: string;
};

export function getAccountDetailUiLabels(labels: DashboardLabels): AccountDetailUiLabels {
  return {
    back: labels["accounts.detail.back"],
    currentBalance: labels["accounts.detail.currentBalance"],
    availableBalance: labels["accounts.detail.availableBalance"],
    inflows: labels["accounts.detail.inflows"],
    outflows: labels["accounts.detail.outflows"],
    netTransfers: labels["accounts.detail.netTransfers"],
    transactions: labels["accounts.detail.transactions"],
    balanceHistory: labels["accounts.detail.balanceHistory"],
    balanceHistoryDescription: labels["accounts.detail.balanceHistoryDescription"],
    chartRange: {
      "7d": labels["accounts.detail.last7Days"],
      "30d": labels["accounts.detail.last30Days"],
      "3m": labels["accounts.detail.last3Months"],
      "1y": labels["accounts.detail.lastYear"],
    },
    chartSummary: labels["accounts.detail.chartSummary"],
    information: labels["accounts.detail.information"],
    type: labels["accounts.detail.type"],
    currency: labels["accounts.detail.currency"],
    status: labels["accounts.detail.status"],
    createdAt: labels["accounts.detail.createdAt"],
    quickSummary: labels["accounts.detail.quickSummary"],
    thisMonth: labels["accounts.detail.thisMonth"],
    transactionCount: labels["accounts.detail.transactionCount"],
    topCategories: labels["accounts.detail.topCategories"],
    topCategoriesEmpty: labels["accounts.detail.topCategoriesEmpty"],
    recentTransactions: labels["accounts.detail.recentTransactions"],
    recentTransactionsEmpty: labels["accounts.detail.recentTransactionsEmpty"],
    viewAllTransactions: labels["accounts.detail.viewAllTransactions"],
    transfer: labels["accounts.detail.transfer"],
    transferFrom: labels["accounts.detail.transferFrom"],
    transferTo: labels["accounts.detail.transferTo"],
    loadingHistory: labels["accounts.detail.loadingHistory"],
    notFoundTitle: labels["accounts.detail.notFoundTitle"],
    notFoundDescription: labels["accounts.detail.notFoundDescription"],
    statusValues: {
      ACTIVE: labels["accounts.status.active"],
      ARCHIVED: labels["accounts.status.archived"],
    },
    typeValues: {
      CASH: labels["accounts.type.cash.label"],
      CHECKING: labels["accounts.type.checking.label"],
      SAVINGS: labels["accounts.type.savings.label"],
      CREDIT_CARD: labels["accounts.type.creditCard.label"],
      MOBILE_MONEY: labels["accounts.type.mobileMoney.label"],
      OTHER: labels["accounts.type.other.label"],
    },
    management: {
      actions: {
        edit: labels["accounts.actions.edit"],
        archive: labels["accounts.actions.archive"],
        restore: labels["accounts.actions.restore"],
        more: labels["accounts.actions.more"],
        cancel: labels["accounts.actions.cancel"],
        close: labels["accounts.actions.close"],
      },
      archivedDescription: labels["accounts.status.archivedDescription"],
      edit: {
        title: labels["accounts.edit.title"],
        description: labels["accounts.edit.description"],
        name: labels["accounts.edit.name"],
        type: labels["accounts.edit.type"],
        currency: labels["accounts.edit.currency"],
        currencyLocked: labels["accounts.edit.currencyLocked"],
        typeLocked: labels["accounts.edit.typeLocked"],
        typeTransitionLocked: labels["accounts.edit.typeTransitionLocked"],
        readOnly: labels["accounts.edit.readOnly"],
        save: labels["accounts.edit.save"],
        saving: labels["accounts.edit.saving"],
        noChanges: labels["accounts.edit.noChanges"],
        invalidName: labels["accounts.edit.invalidName"],
        nameTooLong: labels["accounts.edit.nameTooLong"],
        failed: labels["accounts.edit.failed"],
        notAllowed: labels["accounts.edit.notAllowed"],
        conflict: labels["accounts.edit.conflict"],
        reloadLatest: labels["accounts.edit.reloadLatest"],
      },
      archive: {
        title: labels["accounts.archive.title"],
        description: labels["accounts.archive.description"],
        currentBalance: labels["accounts.archive.currentBalance"],
        historyPreserved: labels["accounts.archive.historyPreserved"],
        confirm: labels["accounts.archive.confirm"],
        archiving: labels["accounts.archive.archiving"],
        success: labels["accounts.archive.success"],
        failed: labels["accounts.archive.failed"],
      },
      restore: {
        title: labels["accounts.restore.title"],
        description: labels["accounts.restore.description"],
        confirm: labels["accounts.restore.confirm"],
        restoring: labels["accounts.restore.restoring"],
        success: labels["accounts.restore.success"],
        failed: labels["accounts.restore.failed"],
      },
    },
    columns: {
      transaction: labels["transactions.columns.transaction"],
      category: labels["transactions.columns.category"],
      date: labels["transactions.columns.date"],
      amount: labels["transactions.columns.amount"],
      status: labels["transactions.columns.status"],
    },
    posted: labels["transactions.status.posted"],
    pending: labels["transactions.status.pending"],
    uncategorized: labels["transactions.uncategorized"],
    today: labels["transactions.date.today"],
    yesterday: labels["transactions.date.yesterday"],
  };
}
