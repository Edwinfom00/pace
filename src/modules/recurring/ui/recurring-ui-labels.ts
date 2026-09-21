import { formatDashboardLabel, type DashboardLabels } from "@/i18n/dashboard-messages";
import type { RecurringPaymentStatus } from "@/modules/financial-inbox/domain";

import type { RecurringOverviewFilter } from "../domain/recurring-overview";

export type RecurringUiLabels = {
  readonly title: string;
  readonly subtitle: string;
  readonly listTitle: string;
  readonly filtersLabel: string;
  readonly filters: Readonly<Record<RecurringOverviewFilter, string>>;
  readonly summary: {
    readonly confirmedOutflows: string;
    readonly confirmedOutflowsDescription: string;
    readonly expectedUpcoming: string;
    readonly expectedUpcomingDescription: string;
    readonly detected: string;
    readonly confirmed: string;
    readonly needsReview: string;
  };
  readonly amountTypical: string;
  readonly cadenceEveryDays: string;
  readonly nextExpected: string;
  readonly account: string;
  readonly category: string;
  readonly status: Readonly<Record<RecurringPaymentStatus, string>>;
  readonly upcoming: {
    readonly title: string;
    readonly description: string;
    readonly empty: string;
  };
  readonly projectionNotice: string;
  readonly empty: Readonly<Record<RecurringOverviewFilter, { readonly title: string; readonly description: string }>>;
  readonly errorTitle: string;
  readonly errorRetry: string;
  readonly filterLoading: string;
};

export function getRecurringUiLabels(labels: DashboardLabels): RecurringUiLabels {
  return {
    title: labels["recurring.title"],
    subtitle: labels["recurring.subtitle"],
    listTitle: labels["recurring.list.title"],
    filtersLabel: labels["recurring.filters.label"],
    filters: {
      ALL: labels["recurring.filters.all"],
      CONFIRMED: labels["recurring.filters.confirmed"],
      NEEDS_REVIEW: labels["recurring.filters.needsReview"],
      IGNORED: labels["recurring.filters.ignored"],
    },
    summary: {
      confirmedOutflows: labels["recurring.summary.confirmedOutflows"],
      confirmedOutflowsDescription: labels["recurring.summary.confirmedOutflowsDescription"],
      expectedUpcoming: labels["recurring.summary.expectedUpcoming"],
      expectedUpcomingDescription: labels["recurring.summary.expectedUpcomingDescription"],
      detected: labels["recurring.summary.detected"],
      confirmed: labels["recurring.summary.confirmed"],
      needsReview: labels["recurring.summary.needsReview"],
    },
    amountTypical: labels["recurring.amount.typical"],
    cadenceEveryDays: formatDashboardLabel(labels, "recurring.cadence.everyDays", { days: "{days}" }),
    nextExpected: labels["recurring.nextExpected"],
    account: labels["recurring.account"],
    category: labels["recurring.category"],
    status: {
      CANDIDATE: labels["recurring.status.candidate"],
      CONFIRMED: labels["recurring.status.confirmed"],
      IGNORED: labels["recurring.status.ignored"],
    },
    upcoming: {
      title: labels["recurring.upcoming.title"],
      description: labels["recurring.upcoming.description"],
      empty: labels["recurring.upcoming.empty"],
    },
    projectionNotice: labels["recurring.projectionNotice"],
    empty: {
      ALL: { title: labels["recurring.empty.all.title"], description: labels["recurring.empty.all.description"] },
      CONFIRMED: { title: labels["recurring.empty.confirmed.title"], description: labels["recurring.empty.confirmed.description"] },
      NEEDS_REVIEW: { title: labels["recurring.empty.needsReview.title"], description: labels["recurring.empty.needsReview.description"] },
      IGNORED: { title: labels["recurring.empty.ignored.title"], description: labels["recurring.empty.ignored.description"] },
    },
    errorTitle: labels["recurring.error.title"],
    errorRetry: labels["recurring.error.retry"],
    filterLoading: labels["shared.loading.filter"],
  };
}
