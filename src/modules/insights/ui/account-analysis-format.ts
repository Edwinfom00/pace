import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import type { LedgerAccountType } from "@/modules/ledger/domain";
import {
  formatOverviewDate,
  minorToChartValue,
} from "@/modules/overview/domain/overview-formatters";
import { transactionListHref } from "@/modules/transactions/domain/transaction-list-url";

import type {
  AccountAnalysis,
  AccountAnalysisInsight,
  AccountBalancePoint,
  AccountMovementKind,
} from "../account/account-analysis.types";
import {
  formatInsightsMoney,
  formatInsightsShare,
  formatInsightsWindow,
} from "./insights-format";
import type { InsightsQueryState } from "./insights-links";

export interface AccountInsightCopy {
  readonly id: string;
  readonly kind: AccountAnalysisInsight["kind"];
  readonly title: string;
  readonly body: string;
  readonly href: string | null;
}

export function accountQueryState(
  analysis: AccountAnalysis,
): InsightsQueryState {
  return {
    periodKey: analysis.periodKey,
    range: analysis.range,
    currency: analysis.currency,
    workspaceCurrency: analysis.workspaceCurrency,
  };
}

export function accountTypeLabel(
  type: LedgerAccountType,
  labels: DashboardLabels,
): string {
  const keys = {
    CASH: "accounts.type.cash.label",
    CHECKING: "accounts.type.checking.label",
    SAVINGS: "accounts.type.savings.label",
    CREDIT_CARD: "accounts.type.creditCard.label",
    MOBILE_MONEY: "accounts.type.mobileMoney.label",
    OTHER: "accounts.type.other.label",
  } as const;
  return labels[keys[type]];
}

export function accountMovementLabel(
  movement: AccountMovementKind,
  labels: DashboardLabels,
): string {
  return labels[`insights.account.movement.${movement}`];
}

export function formatSignedMoney(
  minor: string,
  currency: string,
  locale: string,
): string {
  const formatted = formatInsightsMoney(minor, currency, locale);
  return minor.startsWith("-") || minor === "0" ? formatted : `+${formatted}`;
}

export function accountInsightCopy(
  insight: AccountAnalysisInsight,
  analysis: AccountAnalysis,
  labels: DashboardLabels,
  workspaceSlug: string,
): AccountInsightCopy {
  const money = (minor: string) =>
    formatInsightsMoney(minor, analysis.currency, analysis.locale);
  const share = (bps: number) => formatInsightsShare(bps, analysis.locale);
  switch (insight.kind) {
    case "strongestOutflowWeek":
      return {
        id: `${insight.kind}:${insight.firstDate}`,
        kind: insight.kind,
        title: labels["insights.account.insights.strongestOutflowWeek.title"],
        body: formatDashboardLabel(
          labels,
          "insights.account.insights.strongestOutflowWeek.body",
          {
            period: formatInsightsWindow(insight, analysis.locale),
            amount: money(insight.outflowMinor),
            share: share(insight.shareBps),
          },
        ),
        href: null,
      };
    case "unusualMovement":
      return {
        id: `${insight.kind}:${insight.transactionId}`,
        kind: insight.kind,
        title: labels["insights.account.insights.unusualMovement.title"],
        body: formatDashboardLabel(
          labels,
          insight.direction === "inflow"
            ? "insights.account.insights.unusualMovement.inflow"
            : "insights.account.insights.unusualMovement.outflow",
          {
            amount: money(insight.amountMinor),
            date: formatOverviewDate(insight.date, analysis.locale),
            multiple: new Intl.NumberFormat(analysis.locale).format(
              insight.multiple,
            ),
            counterparty:
              insight.counterpartyName ??
              labels["insights.account.counterparties.unknown"],
          },
        ),
        href: `/w/${workspaceSlug}/transactions/${insight.transactionId}`,
      };
    case "recurringConcentration":
      return {
        id: insight.kind,
        kind: insight.kind,
        title: labels["insights.account.insights.recurringConcentration.title"],
        body: formatDashboardLabel(
          labels,
          "insights.account.insights.recurringConcentration.body",
          {
            count: new Intl.NumberFormat(analysis.locale).format(
              insight.payeeCount,
            ),
            amount: money(insight.amountMinor),
            share: share(insight.shareBps),
          },
        ),
        href: null,
      };
    case "lowestBalance":
      return {
        id: `${insight.kind}:${insight.date}`,
        kind: insight.kind,
        title: labels["insights.account.insights.lowestBalance.title"],
        body: formatDashboardLabel(
          labels,
          "insights.account.insights.lowestBalance.body",
          {
            amount: money(insight.balanceMinor),
            date: formatOverviewDate(insight.date, analysis.locale),
          },
        ),
        href: null,
      };
  }
}

export function accountAnalysisNotes(
  analysis: AccountAnalysis,
  labels: DashboardLabels,
): string[] {
  const { exclusions } = analysis;
  return [
    labels["insights.account.notes.movement"],
    formatDashboardLabel(labels, "insights.account.notes.transfers", {
      count: analysis.transactions.transferCount,
    }),
    labels["insights.rail.notes.refunds"],
    ...(exclusions.pendingCount
      ? [
          formatDashboardLabel(labels, "insights.rail.notes.pending", {
            count: exclusions.pendingCount,
          }),
        ]
      : []),
    formatDashboardLabel(
      labels,
      exclusions.otherCurrencyCount
        ? "insights.account.notes.otherCurrency"
        : "insights.account.notes.currency",
      { currency: analysis.currency, count: exclusions.otherCurrencyCount },
    ),
  ];
}

export function accountTransactionsHref(
  analysis: AccountAnalysis,
  workspaceSlug: string,
): string {
  return transactionListHref(`/w/${workspaceSlug}/transactions`, {
    kind: "ALL",
    search: "",
    sort: "NEWEST",
    page: 1,
    accountId: analysis.account.id,
    from: analysis.current.firstDate,
    to: analysis.current.lastDate,
  });
}

export interface BalanceChartDatum extends AccountBalancePoint {
  readonly balance: number | null;
}

export function balanceChartData(
  points: readonly AccountBalancePoint[],
  currency: string,
): BalanceChartDatum[] {
  return points.map((point) => ({
    ...point,
    balance:
      point.balanceMinor === null
        ? null
        : minorToChartValue(point.balanceMinor, currency),
  }));
}
