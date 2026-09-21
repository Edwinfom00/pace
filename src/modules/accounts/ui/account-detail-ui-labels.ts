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
