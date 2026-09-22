import type { DashboardLabels } from "@/i18n/dashboard-messages";

export type RecurringReviewUiLabels = {
  readonly cadenceEveryDays: string;
  readonly actions: {
    readonly more: string;
    readonly confirm: string;
    readonly ignore: string;
    readonly restore: string;
    readonly cancel: string;
  };
  readonly confirm: {
    readonly title: string;
    readonly description: string;
    readonly submit: string;
    readonly pending: string;
    readonly success: string;
    readonly failed: string;
  };
  readonly ignore: {
    readonly title: string;
    readonly description: string;
    readonly reason: string;
    readonly reasonPlaceholder: string;
    readonly submit: string;
    readonly pending: string;
    readonly success: string;
    readonly failed: string;
  };
  readonly restore: {
    readonly title: string;
    readonly description: string;
    readonly submit: string;
    readonly pending: string;
    readonly success: string;
    readonly failed: string;
  };
  readonly action: {
    readonly notAllowed: string;
    readonly notRestorable: string;
    readonly alreadyProcessed: string;
    readonly conflict: string;
    readonly reloadLatest: string;
  };
};

export function getRecurringReviewUiLabels(labels: DashboardLabels): RecurringReviewUiLabels {
  return {
    cadenceEveryDays: labels["recurring.cadence.everyDays"],
    actions: {
      more: labels["recurring.actions.more"],
      confirm: labels["recurring.actions.confirm"],
      ignore: labels["recurring.actions.ignore"],
      restore: labels["recurring.actions.restore"],
      cancel: labels["recurring.actions.cancel"],
    },
    confirm: {
      title: labels["recurring.confirm.title"],
      description: labels["recurring.confirm.description"],
      submit: labels["recurring.confirm.submit"],
      pending: labels["recurring.confirm.confirming"],
      success: labels["recurring.confirm.success"],
      failed: labels["recurring.confirm.failed"],
    },
    ignore: {
      title: labels["recurring.ignore.title"],
      description: labels["recurring.ignore.description"],
      reason: labels["recurring.ignore.reason"],
      reasonPlaceholder: labels["recurring.ignore.reasonPlaceholder"],
      submit: labels["recurring.ignore.submit"],
      pending: labels["recurring.ignore.ignoring"],
      success: labels["recurring.ignore.success"],
      failed: labels["recurring.ignore.failed"],
    },
    restore: {
      title: labels["recurring.restore.title"],
      description: labels["recurring.restore.description"],
      submit: labels["recurring.restore.submit"],
      pending: labels["recurring.restore.restoring"],
      success: labels["recurring.restore.success"],
      failed: labels["recurring.restore.failed"],
    },
    action: {
      notAllowed: labels["recurring.action.notAllowed"],
      notRestorable: labels["recurring.action.notRestorable"],
      alreadyProcessed: labels["recurring.action.alreadyProcessed"],
      conflict: labels["recurring.action.conflict"],
      reloadLatest: labels["recurring.action.reloadLatest"],
    },
  };
}
