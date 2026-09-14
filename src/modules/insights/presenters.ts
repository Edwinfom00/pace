import { getTranslations, toSupportedLanguage, type MessageKey, type SupportedLanguage } from "@/i18n/messages";

import type { InsightRecord } from "./domain";

const TITLE_KEYS = {
  CATEGORY_SPIKE: "insights.type.CATEGORY_SPIKE",
  CATEGORY_DROP: "insights.type.CATEGORY_DROP",
  MERCHANT_SPIKE: "insights.type.MERCHANT_SPIKE",
  SPENDING_PACE_HIGH: "insights.type.SPENDING_PACE_HIGH",
  SPENDING_PACE_LOW: "insights.type.SPENDING_PACE_LOW",
  BUDGET_AT_RISK: "insights.type.BUDGET_AT_RISK",
  BUDGET_EXCEEDED: "insights.type.BUDGET_EXCEEDED",
  RECURRING_PRICE_INCREASE: "insights.type.RECURRING_PRICE_INCREASE",
  NEW_RECURRING_PAYMENT: "insights.type.NEW_RECURRING_PAYMENT",
  POTENTIAL_SAVINGS: "insights.type.POTENTIAL_SAVINGS",
  GOAL_OFF_TRACK: "insights.type.GOAL_OFF_TRACK",
  GOAL_ON_TRACK: "insights.type.GOAL_ON_TRACK",
  UNUSUAL_TRANSACTION: "insights.type.UNUSUAL_TRANSACTION",
  MONTH_OVER_MONTH_CHANGE: "insights.type.MONTH_OVER_MONTH_CHANGE",
} as const satisfies Record<InsightRecord["type"], MessageKey>;

export interface RenderedInsightInput {
  readonly id: string;
  readonly type: InsightRecord["type"];
  readonly severity: InsightRecord["severity"];
  readonly status: InsightRecord["status"];
  readonly title: string;
  readonly titleKey: MessageKey;
  readonly language: SupportedLanguage;
  /** Facts retain their exact Money Engine strings; presentation must not recalculate them. */
  readonly data: InsightRecord["data"];
  readonly suggestedAction: "REVIEW_TRANSACTIONS" | "REVIEW_PLAN";
}

/** Converts a shared workspace fact into a member-language rendering input. */
export function presentInsight(
  insight: InsightRecord,
  preferredLanguage: string | null | undefined,
): RenderedInsightInput {
  const language = toSupportedLanguage(preferredLanguage);
  const titleKey = TITLE_KEYS[insight.type];
  return {
    id: insight.id,
    type: insight.type,
    severity: insight.severity,
    status: insight.status,
    title: getTranslations(language)(titleKey),
    titleKey,
    language,
    data: insight.data,
    suggestedAction: insight.type.includes("BUDGET") || insight.type.startsWith("GOAL_")
      ? "REVIEW_PLAN"
      : "REVIEW_TRANSACTIONS",
  };
}
