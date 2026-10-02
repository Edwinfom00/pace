import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { InboxReason } from "../domain";

const REASON_KEY: Record<InboxReason, string> = {
  UNKNOWN_CATEGORY: "unknownCategory",
  POSSIBLE_TRANSFER: "possibleTransfer",
  POSSIBLE_RECURRING: "possibleRecurring",
  MERCHANT_AMBIGUITY: "merchantAmbiguity",
  CLASSIFICATION_REVIEW: "classificationReview",
};

export function inboxReasonText(
  labels: DashboardLabels,
  group: "reason" | "filter" | "question" | "resolvedNote",
  reason: InboxReason,
): string {
  return labels[`inbox.${group}.${REASON_KEY[reason]}` as keyof DashboardLabels];
}

export function inboxReasonCountText(labels: DashboardLabels, reason: InboxReason, count: number): string {
  const plural = count === 1 ? "one" : "other";
  return labels[`inbox.ai.reason.${REASON_KEY[reason]}.${plural}` as keyof DashboardLabels]
    .replace("{count}", String(count));
}
