import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { formatSystemCategory } from "@/modules/transactions/ui/transaction-detail-labels";

import type { InboxDetailActivityEvent, InboxItemDetail } from "../inbox-item-detail";
import type { InboxReason } from "../domain";

export type InboxDetailLabels = {
  readonly back: string;
  readonly breadcrumb: string;
  readonly status: { readonly open: string; readonly resolved: string; readonly dismissed: string };
  readonly transactionInformation: string;
  readonly currentClassification: string;
  readonly classification: {
    readonly confirmed: string;
    readonly uncertain: string;
    readonly uncategorized: string;
    readonly uncertainDescription: string;
    readonly uncategorizedDescription: string;
  };
  readonly suggestion: string;
  readonly suggestionDescription: string;
  readonly confidence: Readonly<Record<NonNullable<InboxItemDetail["suggestion"]>["confidence"], string>>;
  readonly whyAttention: string;
  readonly reason: Readonly<Record<InboxReason, { readonly title: string; readonly description: string }>>;
  readonly similarTransactions: string;
  readonly similarEmpty: string;
  readonly context: string;
  readonly account: string;
  readonly source: string;
  readonly recurring: string;
  readonly notes: string;
  readonly notesEmpty: string;
  readonly activity: string;
  readonly activityEvent: Readonly<Record<InboxDetailActivityEvent, string>>;
  readonly field: { readonly date: string; readonly time: string; readonly amount: string; readonly type: string; readonly status: string; readonly merchant: string; readonly category: string; readonly account: string; readonly reference: string; readonly transactionId: string };
  readonly transactionKind: { readonly EXPENSE: string; readonly INCOME: string; readonly TRANSFER: string; readonly REFUND: string };
  readonly transactionStatus: { readonly PENDING: string; readonly POSTED: string };
  readonly sourceValue: { readonly IMPORT: string; readonly MANUAL: string; readonly AGENT: string; readonly BANK_SYNC: string };
  readonly technical: string;
  readonly notFound: { readonly eyebrow: string; readonly title: string; readonly description: string };
  readonly loading: string;
  readonly errorTitle: string;
  readonly systemCategory: (category: { readonly name: string; readonly systemKey: string | null }) => string;
};

export function getInboxDetailLabels(labels: DashboardLabels): InboxDetailLabels {
  return {
    back: labels["inbox.detail.back"],
    breadcrumb: labels["inbox.detail.breadcrumb"],
    status: {
      open: labels["inbox.detail.status.open"],
      resolved: labels["inbox.status.resolved"],
      dismissed: labels["inbox.detail.status.dismissed"],
    },
    transactionInformation: labels["inbox.detail.transactionInformation"],
    currentClassification: labels["inbox.detail.currentClassification"],
    classification: {
      confirmed: labels["inbox.detail.classification.confirmed"],
      uncertain: labels["inbox.detail.classification.uncertain"],
      uncategorized: labels["inbox.detail.noCategory"],
      uncertainDescription: labels["inbox.detail.classification.uncertainDescription"],
      uncategorizedDescription: labels["inbox.detail.noCategoryDescription"],
    },
    suggestion: labels["inbox.detail.suggestion"],
    suggestionDescription: labels["inbox.detail.suggestionDescription"],
    confidence: { HIGH: labels["inbox.detail.confidence.high"], REVIEW: labels["inbox.detail.confidence.review"] },
    whyAttention: labels["inbox.detail.whyAttention"],
    reason: {
      UNKNOWN_CATEGORY: { title: labels["inbox.reason.unknownCategory"], description: labels["inbox.detail.reason.unknownCategory"] },
      POSSIBLE_TRANSFER: { title: labels["inbox.reason.possibleTransfer"], description: labels["inbox.detail.reason.possibleTransfer"] },
      POSSIBLE_RECURRING: { title: labels["inbox.reason.possibleRecurring"], description: labels["inbox.detail.reason.possibleRecurring"] },
      MERCHANT_AMBIGUITY: { title: labels["inbox.reason.merchantAmbiguity"], description: labels["inbox.detail.reason.merchantAmbiguity"] },
      CLASSIFICATION_REVIEW: { title: labels["inbox.reason.classificationReview"], description: labels["inbox.detail.reason.classificationReview"] },
    },
    similarTransactions: labels["inbox.detail.similarTransactions"],
    similarEmpty: labels["inbox.detail.similarEmpty"],
    context: labels["inbox.detail.context"],
    account: labels["transactions.detail.field.account"],
    source: labels["transactions.detail.field.source"],
    recurring: labels["inbox.detail.recurring"],
    notes: labels["inbox.detail.notes"],
    notesEmpty: labels["inbox.detail.notesEmpty"],
    activity: labels["inbox.detail.activity"],
    activityEvent: {
      INBOX_ITEM_CREATED: labels["inbox.detail.activity.added"],
      CLASSIFICATION_REVIEW_CREATED: labels["inbox.detail.activity.classificationSuggested"],
      RECURRING_CANDIDATE_DETECTED: labels["inbox.detail.activity.recurringDetected"],
    },
    field: {
      date: labels["transactions.detail.field.date"],
      time: labels["transactions.detail.field.time"],
      amount: labels["inbox.detail.field.amount"],
      type: labels["inbox.detail.transactionType"],
      status: labels["transactions.detail.field.status"],
      merchant: labels["transactions.detail.field.merchant"],
      category: labels["transactions.detail.field.category"],
      account: labels["transactions.detail.field.account"],
      reference: labels["transactions.detail.field.reference"],
      transactionId: labels["transactions.detail.technical.transactionId"],
    },
    transactionKind: {
      EXPENSE: labels["transactions.detail.kind.expense"],
      INCOME: labels["transactions.detail.kind.income"],
      TRANSFER: labels["transactions.detail.kind.transfer"],
      REFUND: labels["transactions.detail.kind.refund"],
    },
    transactionStatus: { PENDING: labels["transactions.status.pending"], POSTED: labels["transactions.status.posted"] },
    sourceValue: {
      IMPORT: labels["transactions.detail.origin.import"],
      MANUAL: labels["transactions.detail.origin.manual"],
      AGENT: labels["transactions.detail.origin.agent"],
      BANK_SYNC: labels["transactions.detail.origin.bankSync"],
    },
    technical: labels["inbox.detail.technical"],
    notFound: {
      eyebrow: labels["inbox.detail.notFound.eyebrow"],
      title: labels["inbox.detail.notFound.title"],
      description: labels["inbox.detail.notFound.description"],
    },
    loading: labels["inbox.detail.loading"],
    errorTitle: labels["inbox.detail.errorTitle"],
    systemCategory: (category) => formatSystemCategory(labels, category),
  };
}
