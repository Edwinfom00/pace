import type { DashboardLabels } from "@/i18n/dashboard-messages";

export type TransactionRefundLabels = {
  readonly title: string;
  readonly sourceExpense: string;
  readonly originalAmount: string;
  readonly amount: string;
  readonly currency: string;
  readonly currencyLocked: string;
  readonly alreadyRefunded: string;
  readonly remaining: string;
  readonly partial: string;
  readonly full: string;
  readonly afterRefund: string;
  readonly refundableRemaining: string;
  readonly refundTo: string;
  readonly accountHelper: string;
  readonly reason: string;
  readonly optional: string;
  readonly note: string;
  readonly notePlaceholder: string;
  readonly returnedItem: string;
  readonly cancelledService: string;
  readonly priceAdjustment: string;
  readonly duplicateCharge: string;
  readonly other: string;
  readonly cancel: string;
  readonly review: string;
  readonly reviewTitle: string;
  readonly reviewDescription: string;
  readonly back: string;
  readonly confirm: string;
  readonly refunding: string;
  readonly refundRecorded: string;
  readonly failed: string;
  readonly sourceChanged: string;
  readonly fullyRefunded: string;
  readonly fullyRefundedState: string;
  readonly notAllowed: string;
  readonly reloadLatest: string;
  readonly amountRequired: string;
  readonly amountPositive: string;
  readonly amountInvalid: string;
  readonly amountExceeds: string;
  readonly accountRequired: string;
  readonly accountUnavailable: string;
  readonly invalidCurrency: string;
  readonly accountPlaceholder: string;
  readonly accountSearch: string;
  readonly accountNoResults: string;
  readonly accountEmptyTitle: string;
  readonly accountEmptyDescription: string;
  readonly accountLoading: string;
  readonly accountLoadError: string;
  readonly accountCurrencyMismatch: string;
  readonly viewRefund: string;
};

export function getTransactionRefundLabels(labels: DashboardLabels): TransactionRefundLabels {
  return {
    title: labels["transactions.refund.title"],
    sourceExpense: labels["transactions.refund.sourceExpense"],
    originalAmount: labels["transactions.refund.originalAmount"],
    amount: labels["transactions.refund.amount"],
    currency: labels["transactions.refund.currency"],
    currencyLocked: labels["transactions.refund.currencyLocked"],
    alreadyRefunded: labels["transactions.refund.alreadyRefunded"],
    remaining: labels["transactions.refund.remaining"],
    partial: labels["transactions.refund.partial"],
    full: labels["transactions.refund.full"],
    afterRefund: labels["transactions.refund.afterRefund"],
    refundableRemaining: labels["transactions.refund.refundableRemaining"],
    refundTo: labels["transactions.refund.refundTo"],
    accountHelper: labels["transactions.refund.accountHelper"],
    reason: labels["transactions.refund.reason"],
    optional: labels["transactions.refund.optional"],
    note: labels["transactions.refund.note"],
    notePlaceholder: labels["transactions.refund.notePlaceholder"],
    returnedItem: labels["transactions.refund.reason.returnedItem"],
    cancelledService: labels["transactions.refund.reason.cancelledService"],
    priceAdjustment: labels["transactions.refund.reason.priceAdjustment"],
    duplicateCharge: labels["transactions.refund.reason.duplicateCharge"],
    other: labels["transactions.refund.reason.other"],
    cancel: labels["transactions.refund.cancel"],
    review: labels["transactions.refund.review"],
    reviewTitle: labels["transactions.refund.reviewTitle"],
    reviewDescription: labels["transactions.refund.reviewDescription"],
    back: labels["transactions.refund.back"],
    confirm: labels["transactions.refund.confirm"],
    refunding: labels["transactions.refund.refunding"],
    refundRecorded: labels["transactions.refund.refundRecorded"],
    failed: labels["transactions.refund.failed"],
    sourceChanged: labels["transactions.refund.sourceChanged"],
    fullyRefunded: labels["transactions.refund.fullyRefunded"],
    fullyRefundedState: labels["transactions.refund.fullyRefundedState"],
    notAllowed: labels["transactions.refund.notAllowed"],
    reloadLatest: labels["transactions.refund.reloadLatest"],
    amountRequired: labels["transactions.refund.amountRequired"],
    amountPositive: labels["transactions.refund.amountPositive"],
    amountInvalid: labels["transactions.refund.amountInvalid"],
    amountExceeds: labels["transactions.refund.amountExceeds"],
    accountRequired: labels["transactions.refund.accountRequired"],
    accountUnavailable: labels["transactions.refund.accountUnavailable"],
    invalidCurrency: labels["transactions.refund.invalidCurrency"],
    accountPlaceholder: labels["transactions.refund.accountPlaceholder"],
    accountSearch: labels["transactions.refund.accountSearch"],
    accountNoResults: labels["transactions.refund.accountNoResults"],
    accountEmptyTitle: labels["transactions.refund.accountEmptyTitle"],
    accountEmptyDescription: labels["transactions.refund.accountEmptyDescription"],
    accountLoading: labels["transactions.refund.accountLoading"],
    accountLoadError: labels["transactions.refund.accountLoadError"],
    accountCurrencyMismatch: labels["transactions.refund.accountCurrencyMismatch"],
    viewRefund: labels["transactions.refund.viewRefund"],
  };
}
