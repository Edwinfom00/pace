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
  readonly create: {
    readonly trigger: string;
    readonly title: string;
    readonly subtitle: string;
    readonly close: string;
    readonly type: string;
    readonly typeExpense: string;
    readonly typeIncome: string;
    readonly name: string;
    readonly namePlaceholder: string;
    readonly amount: string;
    readonly amountHelper: string;
    readonly merchant: string;
    readonly source: string;
    readonly merchantPlaceholder: string;
    readonly sourcePlaceholder: string;
    readonly merchantHelper: string;
    readonly sourceHelper: string;
    readonly frequency: string;
    readonly frequencyPlaceholder: string;
    readonly frequencyWeekly: string;
    readonly frequencyBiweekly: string;
    readonly frequencyMonthly: string;
    readonly frequencyQuarterly: string;
    readonly frequencyYearly: string;
    readonly nextOccurrence: string;
    readonly account: string;
    readonly receivingAccount: string;
    readonly accountPlaceholder: string;
    readonly accountSearch: string;
    readonly accountEmpty: string;
    readonly category: string;
    readonly categoryOptional: string;
    readonly categoryPlaceholder: string;
    readonly categorySearch: string;
    readonly categoryEmpty: string;
    readonly review: string;
    readonly reviewTitle: string;
    readonly reviewDescription: string;
    readonly back: string;
    readonly cancel: string;
    readonly confirm: string;
    readonly adding: string;
    readonly failed: string;
    readonly noAutomaticTransaction: string;
    readonly projectionNotice: string;
    readonly available: string;
    readonly validation: {
      readonly nameRequired: string;
      readonly nameTooLong: string;
      readonly amountRequired: string;
      readonly amountInvalid: string;
      readonly amountPositive: string;
      readonly frequency: string;
      readonly nextOccurrence: string;
      readonly accountRequired: string;
      readonly accountUnavailable: string;
      readonly categoryUnavailable: string;
      readonly identityTooLong: string;
    };
  };
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
    create: {
      trigger: labels["recurring.create.trigger"],
      title: labels["recurring.create.title"],
      subtitle: labels["recurring.create.subtitle"],
      close: labels["recurring.create.close"],
      type: labels["recurring.create.type"],
      typeExpense: labels["recurring.create.type.expense"],
      typeIncome: labels["recurring.create.type.income"],
      name: labels["recurring.create.name"],
      namePlaceholder: labels["recurring.create.namePlaceholder"],
      amount: labels["recurring.create.amount"],
      amountHelper: labels["recurring.create.amountHelper"],
      merchant: labels["recurring.create.merchant"],
      source: labels["recurring.create.source"],
      merchantPlaceholder: labels["recurring.create.merchantPlaceholder"],
      sourcePlaceholder: labels["recurring.create.sourcePlaceholder"],
      merchantHelper: labels["recurring.create.merchantHelper"],
      sourceHelper: labels["recurring.create.sourceHelper"],
      frequency: labels["recurring.create.frequency"],
      frequencyPlaceholder: labels["recurring.create.frequencyPlaceholder"],
      frequencyWeekly: labels["recurring.create.frequency.weekly"],
      frequencyBiweekly: labels["recurring.create.frequency.biweekly"],
      frequencyMonthly: labels["recurring.create.frequency.monthly"],
      frequencyQuarterly: labels["recurring.create.frequency.quarterly"],
      frequencyYearly: labels["recurring.create.frequency.yearly"],
      nextOccurrence: labels["recurring.create.nextOccurrence"],
      account: labels["recurring.create.account"],
      receivingAccount: labels["recurring.create.receivingAccount"],
      accountPlaceholder: labels["recurring.create.accountPlaceholder"],
      accountSearch: labels["recurring.create.accountSearch"],
      accountEmpty: labels["recurring.create.accountEmpty"],
      category: labels["recurring.create.category"],
      categoryOptional: labels["recurring.create.categoryOptional"],
      categoryPlaceholder: labels["recurring.create.categoryPlaceholder"],
      categorySearch: labels["recurring.create.categorySearch"],
      categoryEmpty: labels["recurring.create.categoryEmpty"],
      review: labels["recurring.create.review"],
      reviewTitle: labels["recurring.create.reviewTitle"],
      reviewDescription: labels["recurring.create.reviewDescription"],
      back: labels["recurring.create.back"],
      cancel: labels["recurring.create.cancel"],
      confirm: labels["recurring.create.confirm"],
      adding: labels["recurring.create.adding"],
      failed: labels["recurring.create.failed"],
      noAutomaticTransaction: labels["recurring.create.noAutomaticTransaction"],
      projectionNotice: labels["recurring.create.projectionNotice"],
      available: labels["recurring.create.available"],
      validation: {
        nameRequired: labels["recurring.create.validation.nameRequired"],
        nameTooLong: labels["recurring.create.validation.nameTooLong"],
        amountRequired: labels["recurring.create.validation.amountRequired"],
        amountInvalid: labels["recurring.create.validation.amountInvalid"],
        amountPositive: labels["recurring.create.validation.amountPositive"],
        frequency: labels["recurring.create.validation.frequency"],
        nextOccurrence: labels["recurring.create.validation.nextOccurrence"],
        accountRequired: labels["recurring.create.validation.accountRequired"],
        accountUnavailable: labels["recurring.create.validation.accountUnavailable"],
        categoryUnavailable: labels["recurring.create.validation.categoryUnavailable"],
        identityTooLong: labels["recurring.create.validation.identityTooLong"],
      },
    },
  };
}
