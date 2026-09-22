import type { DashboardLabels } from "@/i18n/dashboard-messages";

export type RecurringManagementUiLabels = {
  readonly cadenceEveryDays: string;
  readonly actions: {
    readonly more: string;
    readonly confirm: string;
    readonly edit: string;
    readonly ignore: string;
    readonly pause: string;
    readonly resume: string;
    readonly restore: string;
    readonly cancel: string;
  };
  readonly edit: {
    readonly title: string;
    readonly futureOnly: string;
    readonly close: string;
    readonly save: string;
    readonly saving: string;
    readonly noChanges: string;
    readonly failed: string;
    readonly notAllowed: string;
    readonly type: string;
    readonly typeExpense: string;
    readonly typeIncome: string;
    readonly currency: string;
    readonly name: string;
    readonly amount: string;
    readonly amountHelper: string;
    readonly frequency: string;
    readonly frequencyPlaceholder: string;
    readonly frequencyWeekly: string;
    readonly frequencyBiweekly: string;
    readonly frequencyMonthly: string;
    readonly frequencyQuarterly: string;
    readonly frequencyYearly: string;
    readonly nextOccurrence: string;
    readonly account: string;
    readonly accountPlaceholder: string;
    readonly accountSearch: string;
    readonly accountEmpty: string;
    readonly currentAccount: string;
    readonly category: string;
    readonly categoryOptional: string;
    readonly categoryPlaceholder: string;
    readonly categorySearch: string;
    readonly categoryEmpty: string;
    readonly currentCategory: string;
    readonly available: string;
    readonly currencyMismatch: string;
    readonly validation: {
      readonly name: string;
      readonly amount: string;
      readonly frequency: string;
      readonly nextOccurrence: string;
      readonly account: string;
      readonly category: string;
    };
  };
  readonly pause: {
    readonly title: string;
    readonly description: string;
    readonly submit: string;
    readonly pending: string;
    readonly failed: string;
  };
  readonly resume: {
    readonly title: string;
    readonly description: string;
    readonly submit: string;
    readonly pending: string;
    readonly failed: string;
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

export type RecurringReviewUiLabels = RecurringManagementUiLabels;

export function getRecurringReviewUiLabels(labels: DashboardLabels): RecurringManagementUiLabels {
  return {
    cadenceEveryDays: labels["recurring.cadence.everyDays"],
    actions: {
      more: labels["recurring.actions.more"],
      confirm: labels["recurring.actions.confirm"],
      edit: labels["recurring.actions.edit"],
      ignore: labels["recurring.actions.ignore"],
      pause: labels["recurring.actions.pause"],
      resume: labels["recurring.actions.resume"],
      restore: labels["recurring.actions.restore"],
      cancel: labels["recurring.actions.cancel"],
    },
    edit: {
      title: labels["recurring.edit.title"],
      futureOnly: labels["recurring.edit.futureOnly"],
      close: labels["recurring.edit.close"],
      save: labels["recurring.edit.save"],
      saving: labels["recurring.edit.saving"],
      noChanges: labels["recurring.edit.noChanges"],
      failed: labels["recurring.edit.failed"],
      notAllowed: labels["recurring.edit.notAllowed"],
      type: labels["recurring.edit.type"],
      typeExpense: labels["recurring.edit.type.expense"],
      typeIncome: labels["recurring.edit.type.income"],
      currency: labels["recurring.edit.currency"],
      name: labels["recurring.edit.name"],
      amount: labels["recurring.edit.amount"],
      amountHelper: labels["recurring.edit.amountHelper"],
      frequency: labels["recurring.edit.frequency"],
      frequencyPlaceholder: labels["recurring.edit.frequencyPlaceholder"],
      frequencyWeekly: labels["recurring.create.frequency.weekly"],
      frequencyBiweekly: labels["recurring.create.frequency.biweekly"],
      frequencyMonthly: labels["recurring.create.frequency.monthly"],
      frequencyQuarterly: labels["recurring.create.frequency.quarterly"],
      frequencyYearly: labels["recurring.create.frequency.yearly"],
      nextOccurrence: labels["recurring.edit.nextOccurrence"],
      account: labels["recurring.edit.account"],
      accountPlaceholder: labels["recurring.edit.accountPlaceholder"],
      accountSearch: labels["recurring.edit.accountSearch"],
      accountEmpty: labels["recurring.edit.accountEmpty"],
      currentAccount: labels["recurring.edit.currentAccount"],
      category: labels["recurring.edit.category"],
      categoryOptional: labels["recurring.edit.categoryOptional"],
      categoryPlaceholder: labels["recurring.edit.categoryPlaceholder"],
      categorySearch: labels["recurring.edit.categorySearch"],
      categoryEmpty: labels["recurring.edit.categoryEmpty"],
      currentCategory: labels["recurring.edit.currentCategory"],
      available: labels["recurring.create.available"],
      currencyMismatch: labels["recurring.edit.currencyMismatch"],
      validation: {
        name: labels["recurring.edit.validation.name"],
        amount: labels["recurring.edit.validation.amount"],
        frequency: labels["recurring.edit.validation.frequency"],
        nextOccurrence: labels["recurring.edit.validation.nextOccurrence"],
        account: labels["recurring.edit.validation.account"],
        category: labels["recurring.edit.validation.category"],
      },
    },
    pause: {
      title: labels["recurring.pause.title"],
      description: labels["recurring.pause.description"],
      submit: labels["recurring.pause.submit"],
      pending: labels["recurring.pause.pausing"],
      failed: labels["recurring.pause.failed"],
    },
    resume: {
      title: labels["recurring.resume.title"],
      description: labels["recurring.resume.description"],
      submit: labels["recurring.resume.submit"],
      pending: labels["recurring.resume.resuming"],
      failed: labels["recurring.resume.failed"],
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
