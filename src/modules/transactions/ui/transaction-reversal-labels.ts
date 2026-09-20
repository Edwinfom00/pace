import type { DashboardLabels } from "@/i18n/dashboard-messages";

export type TransactionReversalLabels = {
  readonly title: string;
  readonly moreActions: string;
  readonly description: string;
  readonly kind: Readonly<Record<"EXPENSE" | "INCOME" | "TRANSFER", string>>;
  readonly typeAndAmount: string;
  readonly account: string;
  readonly from: string;
  readonly to: string;
  readonly reason: string;
  readonly optional: string;
  readonly duplicateTransaction: string;
  readonly enteredByMistake: string;
  readonly transactionCancelled: string;
  readonly wrongTransaction: string;
  readonly other: string;
  readonly cancel: string;
  readonly review: string;
  readonly reviewTitle: string;
  readonly back: string;
  readonly currentEffect: string;
  readonly afterReversal: string;
  readonly originalPreserved: string;
  readonly confirm: string;
  readonly reversing: string;
  readonly failed: string;
  readonly conflict: string;
  readonly notAllowed: string;
  readonly hasActiveRefunds: string;
  readonly reloadLatest: string;
  readonly currentTransfer: string;
  readonly restored: string;
  readonly financialEffect: string;
  readonly reviewComparison: string;
};

export function getTransactionReversalLabels(labels: DashboardLabels): TransactionReversalLabels {
  return {
    title: labels["transactions.reversal.title"],
    moreActions: labels["transactions.actions.detail.more"],
    description: labels["transactions.reversal.description"],
    kind: {
      EXPENSE: labels["transactions.detail.kind.expense"],
      INCOME: labels["transactions.detail.kind.income"],
      TRANSFER: labels["transactions.detail.kind.transfer"],
    },
    typeAndAmount: labels["transactions.reversal.typeAndAmount"],
    account: labels["transactions.reversal.account"],
    from: labels["transactions.reversal.from"],
    to: labels["transactions.reversal.to"],
    reason: labels["transactions.reversal.reason"],
    optional: labels["transactions.reversal.optional"],
    duplicateTransaction: labels["transactions.reversal.reason.duplicateTransaction"],
    enteredByMistake: labels["transactions.reversal.reason.enteredByMistake"],
    transactionCancelled: labels["transactions.reversal.reason.transactionCancelled"],
    wrongTransaction: labels["transactions.reversal.reason.wrongTransaction"],
    other: labels["transactions.reversal.reason.other"],
    cancel: labels["transactions.reversal.cancel"],
    review: labels["transactions.reversal.review"],
    reviewTitle: labels["transactions.reversal.reviewTitle"],
    back: labels["transactions.reversal.back"],
    currentEffect: labels["transactions.reversal.currentEffect"],
    afterReversal: labels["transactions.reversal.afterEffect"],
    originalPreserved: labels["transactions.reversal.originalPreserved"],
    confirm: labels["transactions.reversal.confirm"],
    reversing: labels["transactions.reversal.reversing"],
    failed: labels["transactions.reversal.failed"],
    conflict: labels["transactions.reversal.conflict"],
    notAllowed: labels["transactions.reversal.notAllowed"],
    hasActiveRefunds: labels["transactions.reversal.hasActiveRefunds"],
    reloadLatest: labels["transactions.reversal.reloadLatest"],
    currentTransfer: labels["transactions.reversal.currentTransfer"],
    restored: labels["transactions.reversal.restored"],
    financialEffect: labels["transactions.reversal.financialEffect"],
    reviewComparison: labels["transactions.reversal.reviewComparison"],
  };
}
