import type { DashboardLabels } from "@/i18n/dashboard-messages";
import type { InsightCandidate } from "@/money/insights";
import { localDateForInstant, localDateKey } from "@/money/period";
import {
  descriptionForInsight,
  insightPriority,
  toneForInsight,
} from "@/modules/overview/domain/overview-right-rail";
import { transactionListHref } from "@/modules/transactions/domain/transaction-list-url";

import type { InsightsNameResolver } from "./insights-overview";
import type { InsightsDeterministicItem } from "./insights-overview.types";

export const DETERMINISTIC_INSIGHT_LIMIT = 5;

export interface PresentDeterministicInsightsInput {
  readonly candidates: readonly InsightCandidate[];
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceSlug: string;
  readonly resolveName: InsightsNameResolver;
  readonly limit?: number;
}

export function presentDeterministicInsights(
  input: PresentDeterministicInsightsInput,
): InsightsDeterministicItem[] {
  return [...input.candidates]
    .sort((left, right) =>
      insightPriority[left.type] - insightPriority[right.type] ||
      left.fingerprint.localeCompare(right.fingerprint),
    )
    .slice(0, input.limit ?? DETERMINISTIC_INSIGHT_LIMIT)
    .map((candidate) => ({
      id: candidate.fingerprint,
      type: candidate.type,
      tone: toneForInsight(candidate),
      title: input.labels[`insights.type.${candidate.type}`],
      subject: subjectForInsight(candidate, input.resolveName),
      description: descriptionForInsight(candidate, input.labels, input.locale),
      href: hrefForInsight(candidate, input.workspaceSlug, input.timeZone),
    }));
}

function subjectForInsight(candidate: InsightCandidate, resolveName: InsightsNameResolver): string | null {
  const { data } = candidate;
  if (typeof data.categoryId === "string" && candidate.type !== "UNUSUAL_TRANSACTION") {
    return resolveName("category", data.categoryId);
  }
  if (typeof data.merchantName === "string") return data.merchantName;
  if (typeof data.merchantId === "string") return resolveName("merchant", data.merchantId);
  if (typeof data.merchant === "string") return titleCase(data.merchant);
  if (typeof data.goalName === "string") return data.goalName;
  return null;
}

function hrefForInsight(candidate: InsightCandidate, workspaceSlug: string, timeZone: string): string | null {
  const base = `/w/${workspaceSlug}`;
  const { data } = candidate;
  if (candidate.type === "UNUSUAL_TRANSACTION" && typeof data.transactionId === "string") {
    return `${base}/transactions/${data.transactionId}`;
  }
  if (typeof data.recurringPaymentId === "string") return `${base}/recurring/${data.recurringPaymentId}`;
  if (typeof data.goalId === "string") return `${base}/plans/goals/${data.goalId}`;
  if (typeof data.budgetId === "string") return `${base}/plans/budgets/${data.budgetId}`;
  if (typeof data.categoryId === "string" && !data.categoryId.startsWith("__")) {
    return transactionListHref(`${base}/transactions`, {
      kind: "ALL",
      search: "",
      sort: "NEWEST",
      page: 1,
      categoryId: data.categoryId,
      from: localDateKey(localDateForInstant(candidate.period.start, timeZone)),
      to: localDateKey(localDateForInstant(new Date(candidate.period.end.getTime() - 1), timeZone)),
    });
  }
  return null;
}

function titleCase(value: string): string {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}
