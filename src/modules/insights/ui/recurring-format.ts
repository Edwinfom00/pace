import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import {
  formatOverviewDate,
  minorToChartValue,
} from "@/modules/overview/domain/overview-formatters";

import { INSIGHTS_RANGE_MONTHS } from "../overview/insights-overview.types";
import type {
  InsightsRecurring,
  RecurringActualMonth,
  RecurringAnalyticsSignal,
  RecurringHorizon,
} from "../recurring/insights-recurring.types";
import {
  formatInsightsMoney,
  formatInsightsMonth,
  formatInsightsShare,
} from "./insights-format";
import {
  recurringDetailHref,
  type InsightsQueryState,
} from "./insights-links";

export function recurringQueryState(
  recurring: InsightsRecurring,
): InsightsQueryState & { readonly horizon: RecurringHorizon } {
  return {
    periodKey: recurring.periodKey,
    range: recurring.range,
    currency: recurring.currency,
    workspaceCurrency: recurring.workspaceCurrency,
    horizon: recurring.horizon,
  };
}

export function recurringItemName(
  name: string | null,
  labels: DashboardLabels,
): string {
  return name ?? labels["insights.recurring.unnamed"];
}

export interface RecurringShareChartDatum extends RecurringActualMonth {
  readonly label: string;
  readonly recurring: number | null;
  readonly other: number | null;
}

export function recurringShareChartData(
  months: readonly RecurringActualMonth[],
  currency: string,
  locale: string,
): RecurringShareChartDatum[] {
  const value = (month: RecurringActualMonth, minor: string) =>
    month.isFuture ? null : minorToChartValue(minor, currency);
  return months.map((month) => ({
    ...month,
    label: formatInsightsMonth(month.month, locale).replace(".", ""),
    recurring: value(month, month.recurringSpendingMinor),
    other: value(month, month.otherSpendingMinor),
  }));
}

export function hasRecurringActuals(
  months: readonly RecurringActualMonth[],
): boolean {
  return months.some(
    (month) =>
      month.recurringSpendingMinor !== "0" ||
      month.recurringIncomeMinor !== "0",
  );
}

export function recurringTrendSummary(
  recurring: InsightsRecurring,
  labels: DashboardLabels,
): string {
  return formatDashboardLabel(labels, "insights.recurring.trend.summary", {
    months: INSIGHTS_RANGE_MONTHS[recurring.range],
    amount: formatInsightsMoney(
      recurring.actual.spending.minor,
      recurring.currency,
      recurring.locale,
    ),
    share: formatInsightsShare(recurring.actual.shareBps, recurring.locale),
  });
}

export function recurringStatusLines(
  recurring: InsightsRecurring,
  labels: DashboardLabels,
): string[] {
  const { counts } = recurring;
  return [
    formatDashboardLabel(labels, "insights.recurring.status.active", {
      count: counts.active,
    }),
    ...(counts.paused
      ? [
          formatDashboardLabel(labels, "insights.recurring.status.paused", {
            count: counts.paused,
          }),
        ]
      : []),
    ...(counts.ignored
      ? [
          formatDashboardLabel(labels, "insights.recurring.status.ignored", {
            count: counts.ignored,
          }),
        ]
      : []),
    ...(counts.needsReview
      ? [
          formatDashboardLabel(labels, "insights.recurring.status.needsReview", {
            count: counts.needsReview,
          }),
        ]
      : []),
  ];
}

export function upcomingWeekHeight(peakShareBps: number): string {
  return `${Math.max(peakShareBps > 0 ? 6 : 0, Math.min(100, peakShareBps / 100))}%`;
}

export interface RecurringSignalCopy {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly href: string | null;
}

export function recurringSignalCopy(
  signal: RecurringAnalyticsSignal,
  recurring: InsightsRecurring,
  labels: DashboardLabels,
  workspaceSlug: string,
): RecurringSignalCopy {
  const money = (minor: string) =>
    formatInsightsMoney(minor, recurring.currency, recurring.locale);
  switch (signal.kind) {
    case "recurringIncrease":
      return {
        id: signal.kind,
        title: labels["insights.recurring.signals.recurringIncrease.title"],
        body: formatDashboardLabel(
          labels,
          "insights.recurring.signals.recurringIncrease.body",
          { amount: money(signal.deltaMinor), percent: signal.percentage },
        ),
        href: null,
      };
    case "priceIncrease":
      return {
        id: `${signal.kind}:${signal.recurringId}`,
        title: labels["insights.recurring.signals.priceIncrease.title"],
        body: [
          formatDashboardLabel(
            labels,
            "insights.recurring.signals.priceIncrease.body",
            {
              name: recurringItemName(signal.name, labels),
              amount: money(signal.deltaMinor),
              percent: signal.percentage,
            },
          ),
          ...(signal.count > 1
            ? [
                formatDashboardLabel(
                  labels,
                  "insights.recurring.signals.priceIncrease.more",
                  { count: signal.count },
                ),
              ]
            : []),
        ].join(" "),
        href: recurringDetailHref(workspaceSlug, signal.recurringId),
      };
    case "overdue":
      return {
        id: `${signal.kind}:${signal.recurringId}`,
        title: labels["insights.recurring.signals.overdue.title"],
        body: [
          formatDashboardLabel(
            labels,
            "insights.recurring.signals.overdue.body",
            {
              name: recurringItemName(signal.name, labels),
              date: formatOverviewDate(signal.lastDate, recurring.locale),
            },
          ),
          ...(signal.count > 1
            ? [
                formatDashboardLabel(
                  labels,
                  "insights.recurring.signals.overdue.more",
                  { count: signal.count },
                ),
              ]
            : []),
        ].join(" "),
        href: recurringDetailHref(workspaceSlug, signal.recurringId),
      };
    case "needsReview":
      return {
        id: signal.kind,
        title: labels["insights.recurring.signals.needsReview.title"],
        body: formatDashboardLabel(
          labels,
          "insights.recurring.signals.needsReview.body",
          { count: signal.count },
        ),
        href: `/w/${workspaceSlug}/recurring?filter=NEEDS_REVIEW`,
      };
  }
}

export function recurringNotes(
  recurring: InsightsRecurring,
  labels: DashboardLabels,
): string[] {
  const { exclusions } = recurring;
  return [
    labels["insights.recurring.notes.actual"],
    labels["insights.recurring.notes.projected"],
    formatDashboardLabel(labels, "insights.rail.notes.transfers", {
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
    ...(recurring.currencies.length > 1 || exclusions.otherCurrencyCount
      ? [
          formatDashboardLabel(labels, "insights.rail.notes.currency", {
            currency: recurring.currency,
            count: exclusions.otherCurrencyCount,
          }),
        ]
      : []),
    ...(recurring.counts.otherCurrency
      ? [
          formatDashboardLabel(labels, "insights.recurring.status.otherCurrency", {
            count: recurring.counts.otherCurrency,
          }),
        ]
      : []),
  ];
}
