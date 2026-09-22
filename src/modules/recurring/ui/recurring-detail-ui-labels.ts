import { formatDashboardLabel, type DashboardLabels } from "@/i18n/dashboard-messages";

import type { RecurringDetailTab } from "../domain/recurring-detail";

export type RecurringDetailUiLabels = {
  readonly back: string;
  readonly tabs: Readonly<Record<RecurringDetailTab, string>>;
  readonly amount: string;
  readonly frequency: string;
  readonly nextOccurrence: string;
  readonly lastOccurrence: string;
  readonly details: string;
  readonly name: string;
  readonly type: string;
  readonly outflow: string;
  readonly inflow: string;
  readonly status: string;
  readonly account: string;
  readonly category: string;
  readonly merchant: string;
  readonly startDate: string;
  readonly source: string;
  readonly amountTypical: string;
  readonly cadenceTemplate: string;
  readonly upcomingOccurrences: string;
  readonly recentHistory: string;
  readonly viewAll: string;
  readonly noUpcoming: string;
  readonly noHistory: string;
  readonly noRelated: string;
  readonly about: { readonly title: string; readonly description: string };
  readonly review: { readonly title: string; readonly description: string };
  readonly ignored: { readonly title: string; readonly description: string };
  readonly origin: { readonly deterministic: string; readonly manual: string };
  readonly unavailable: string;
  readonly loading: string;
  readonly notFound: { readonly title: string; readonly description: string; readonly back: string };
};

export function getRecurringDetailUiLabels(labels: DashboardLabels): RecurringDetailUiLabels {
  return {
    back: labels["recurring.detail.back"],
    tabs: {
      overview: labels["recurring.detail.overview"],
      history: labels["recurring.detail.history"],
      upcoming: labels["recurring.detail.upcoming"],
      transactions: labels["recurring.detail.relatedTransactions"],
    },
    amount: labels["recurring.detail.amount"],
    frequency: labels["recurring.detail.frequency"],
    nextOccurrence: labels["recurring.detail.nextOccurrence"],
    lastOccurrence: labels["recurring.detail.lastOccurrence"],
    details: labels["recurring.detail.details"],
    name: labels["recurring.detail.name"],
    type: labels["recurring.detail.type"],
    outflow: labels["recurring.detail.outflow"],
    inflow: labels["recurring.detail.inflow"],
    status: labels["recurring.detail.status"],
    account: labels["recurring.detail.account"],
    category: labels["recurring.detail.category"],
    merchant: labels["recurring.detail.merchant"],
    startDate: labels["recurring.detail.startDate"],
    source: labels["recurring.detail.source"],
    amountTypical: labels["recurring.detail.amountTypical"],
    cadenceTemplate: formatDashboardLabel(labels, "recurring.cadence.everyDays", { days: "{days}" }),
    upcomingOccurrences: labels["recurring.detail.upcomingOccurrences"],
    recentHistory: labels["recurring.detail.recentHistory"],
    viewAll: labels["recurring.detail.viewAll"],
    noUpcoming: labels["recurring.detail.noUpcoming"],
    noHistory: labels["recurring.detail.noHistory"],
    noRelated: labels["recurring.detail.noRelated"],
    about: {
      title: labels["recurring.detail.about.title"],
      description: labels["recurring.detail.about.description"],
    },
    review: {
      title: labels["recurring.detail.review.title"],
      description: labels["recurring.detail.review.description"],
    },
    ignored: {
      title: labels["recurring.detail.ignored.title"],
      description: labels["recurring.detail.ignored.description"],
    },
    origin: {
      deterministic: labels["recurring.detail.origin.deterministic"],
      manual: labels["recurring.detail.origin.manual"],
    },
    unavailable: labels["recurring.detail.unavailable"],
    loading: labels["recurring.detail.loading"],
    notFound: {
      title: labels["recurring.detail.notFound.title"],
      description: labels["recurring.detail.notFound.description"],
      back: labels["recurring.detail.notFound.back"],
    },
  };
}
