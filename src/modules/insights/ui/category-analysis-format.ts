import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { formatOverviewDate } from "@/modules/overview/domain/overview-formatters";
import { transactionListHref } from "@/modules/transactions/domain/transaction-list-url";

import type {
  CategoryAnalysis,
  CategoryAnalysisInsight,
} from "../category/category-analysis.types";
import {
  formatInsightsMoney,
  formatInsightsShare,
  formatInsightsWindow,
} from "./insights-format";
import {
  insightsCategoryHref,
  type InsightsQueryState,
} from "./insights-links";

export interface CategoryInsightCopy {
  readonly id: string;
  readonly kind: CategoryAnalysisInsight["kind"];
  readonly title: string;
  readonly body: string;
  readonly href: string | null;
}

export function categoryQueryState(
  analysis: CategoryAnalysis,
): InsightsQueryState {
  return {
    periodKey: analysis.periodKey,
    range: analysis.range,
    currency: analysis.currency,
    workspaceCurrency: analysis.workspaceCurrency,
  };
}

export function categoryInsightCopy(
  insight: CategoryAnalysisInsight,
  analysis: CategoryAnalysis,
  labels: DashboardLabels,
  workspaceSlug: string,
): CategoryInsightCopy {
  const money = (minor: string) =>
    formatInsightsMoney(minor, analysis.currency, analysis.locale);
  const share = (bps: number) => formatInsightsShare(bps, analysis.locale);
  switch (insight.kind) {
    case "biggestIncrease":
      return {
        id: `${insight.kind}:${insight.dimension}:${insight.id}`,
        kind: insight.kind,
        title: labels["insights.category.insights.biggestIncrease.title"],
        body: formatDashboardLabel(
          labels,
          insight.percentage === null
            ? "insights.category.insights.biggestIncrease.bodyNew"
            : "insights.category.insights.biggestIncrease.body",
          {
            name: insight.name,
            amount: money(insight.deltaMinor),
            percent: insight.percentage ?? "",
          },
        ),
        href:
          insight.dimension === "subcategory"
            ? insightsCategoryHref(
                workspaceSlug,
                insight.id,
                categoryQueryState(analysis),
              )
            : null,
      };
    case "merchantConcentration":
      return {
        id: `${insight.kind}:${insight.id}`,
        kind: insight.kind,
        title: labels["insights.category.insights.merchantConcentration.title"],
        body: formatDashboardLabel(
          labels,
          "insights.category.insights.merchantConcentration.body",
          {
            name: insight.name,
            share: share(insight.shareBps),
          },
        ),
        href: null,
      };
    case "strongestWeek":
      return {
        id: `${insight.kind}:${insight.firstDate}`,
        kind: insight.kind,
        title: labels["insights.category.insights.strongestWeek.title"],
        body: formatDashboardLabel(
          labels,
          "insights.category.insights.strongestWeek.body",
          {
            period: formatInsightsWindow(insight, analysis.locale),
            amount: money(insight.spendingMinor),
            share: share(insight.shareBps),
          },
        ),
        href: null,
      };
    case "largestTransaction":
      return {
        id: `${insight.kind}:${insight.transactionId}`,
        kind: insight.kind,
        title: labels["insights.category.insights.largestTransaction.title"],
        body: formatDashboardLabel(
          labels,
          insight.merchantName
            ? "insights.category.insights.largestTransaction.body"
            : "insights.category.insights.largestTransaction.bodyNoMerchant",
          {
            amount: money(insight.amountMinor),
            merchant: insight.merchantName ?? "",
            date: formatOverviewDate(insight.date, analysis.locale),
          },
        ),
        href: `/w/${workspaceSlug}/transactions/${insight.transactionId}`,
      };
  }
}

export function categoryAnalysisNotes(
  analysis: CategoryAnalysis,
  labels: DashboardLabels,
): string[] {
  const { exclusions } = analysis;
  return [
    ...(analysis.subcategories
      ? [labels["insights.category.notes.children"]]
      : []),
    formatDashboardLabel(labels, "insights.category.notes.transfers", {
      count: exclusions.transferCount,
    }),
    labels["insights.rail.notes.refunds"],
    ...(exclusions.pendingCount
      ? [
          formatDashboardLabel(labels, "insights.rail.notes.pending", {
            count: exclusions.pendingCount,
          }),
        ]
      : []),
    labels["insights.rail.notes.recurring"],
    ...(analysis.currencies.length > 1 || exclusions.otherCurrencyCount
      ? [
          formatDashboardLabel(labels, "insights.rail.notes.currency", {
            currency: analysis.currency,
            count: exclusions.otherCurrencyCount,
          }),
        ]
      : []),
  ];
}

export function categoryTransactionsHref(
  analysis: CategoryAnalysis,
  workspaceSlug: string,
): string | null {
  if (analysis.subcategories) return null;
  return transactionListHref(`/w/${workspaceSlug}/transactions`, {
    kind: "ALL",
    search: "",
    sort: "NEWEST",
    page: 1,
    categoryId: analysis.category.id,
    from: analysis.current.firstDate,
    to: analysis.current.lastDate,
  });
}
