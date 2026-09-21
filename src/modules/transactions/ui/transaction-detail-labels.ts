import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { formatDashboardLabel } from "@/i18n/dashboard-messages";
import type {
  LedgerTransactionKind,
  LedgerTransactionStatus,
} from "@/modules/ledger/domain";

import type {
  TransactionDetailCategory,
  TransactionDetailOrigin,
  TransactionDetailSourceChannel,
} from "../domain/transaction-detail";

const systemCategoryMessageKeys = {
  "expense:groceries": "categories.system.expense.groceries",
  "expense:dining": "categories.system.expense.dining",
  "expense:transport": "categories.system.expense.transport",
  "expense:housing": "categories.system.expense.housing",
  "expense:utilities": "categories.system.expense.utilities",
  "expense:health": "categories.system.expense.health",
  "expense:shopping": "categories.system.expense.shopping",
  "expense:entertainment": "categories.system.expense.entertainment",
  "expense:other": "categories.system.expense.other",
  "income:salary": "categories.system.income.salary",
  "income:freelance": "categories.system.income.freelance",
  "income:gift": "categories.system.income.gift",
  "income:other": "categories.system.income.other",
} as const;

export type TransactionDetailLabels = {
  readonly back: string;
  readonly title: string;
  readonly sideRail: string;
  readonly kind: Readonly<Record<LedgerTransactionKind, string>>;
  readonly status: Readonly<Record<LedgerTransactionStatus, string>>;
  readonly field: {
    readonly merchant: string;
    readonly source: string;
    readonly category: string;
    readonly account: string;
    readonly fromAccount: string;
    readonly toAccount: string;
    readonly date: string;
    readonly time: string;
    readonly note: string;
    readonly status: string;
    readonly addedVia: string;
    readonly reference: string;
  };
  readonly source: {
    readonly title: string;
    readonly added: string;
    readonly noReference: string;
    readonly none: string;
    readonly origin: Readonly<Record<TransactionDetailOrigin, string>>;
    readonly channel: Readonly<Record<TransactionDetailSourceChannel, string>>;
  };
  readonly financial: {
    readonly title: string;
    readonly categoryThisMonth: (category: string) => string;
    readonly recordedSpending: (month: string) => string;
    readonly recordedIncome: (month: string) => string;
    readonly accountImpact: string;
    readonly balanceAfter: string;
    readonly empty: string;
    readonly currentFinancialTruth: string;
  };
  readonly activity: {
    readonly title: string;
    readonly added: string;
    readonly recorded: string;
    readonly categorized: (category: string) => string;
    readonly categoryAttached: string;
    readonly posted: string;
    readonly included: string;
    readonly empty: string;
    readonly correction: string;
    readonly correctionDetails: string;
    readonly refundIssued: (amount: string) => string;
    readonly refundDetails: string;
  };
  readonly technical: {
    readonly title: string;
    readonly transactionId: string;
    readonly created: string;
    readonly updated: string;
    readonly correctionId: string;
    readonly originalTransactionId: string;
    readonly currentTransactionId: string;
  };
  readonly correction: {
    readonly badge: string;
    readonly title: string;
    readonly wasCorrected: string;
    readonly correctedAgain: string;
    readonly currentVersion: string;
    readonly originalVersion: string;
    readonly previousVersion: string;
    readonly viewOriginal: string;
    readonly viewCurrent: string;
    readonly viewPrevious: string;
    readonly originallyRecorded: string;
    readonly correctedTo: string;
    readonly correctedAt: (date: string) => string;
    readonly reason: string;
    readonly notProvided: string;
    readonly changeDescription: (field: string, before: string, after: string) => string;
    readonly changes: Readonly<Record<"AMOUNT" | "ACCOUNT" | "TRANSFER_ACCOUNT" | "CATEGORY" | "MERCHANT" | "NOTE" | "DATE", string>>;
    readonly technicalTitle: string;
    readonly technicalDescription: string;
    readonly technicalCurrent: string;
  };
  readonly reversal: {
    readonly badge: string;
    readonly reversedOn: string;
    readonly reason: string;
    readonly preserved: string;
    readonly noFinancialEffect: string;
    readonly activity: string;
    readonly activityDetails: string;
  };
  readonly refund: {
    readonly returnedItem: string;
    readonly cancelledService: string;
    readonly priceAdjustment: string;
    readonly duplicateCharge: string;
    readonly other: string;
  };
  readonly askPace: {
    readonly title: string;
    readonly beta: string;
    readonly transactionSubject: string;
    readonly context: string;
    readonly spendingPrompt: string;
    readonly understandPrompt: string;
    readonly categoryPrompt: string;
    readonly transferPrompt: string;
  };
  readonly notFound: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly back: string;
  };
  readonly loading: string;
  readonly errorTitle: string;
  readonly systemCategory: (category: Pick<TransactionDetailCategory, "name" | "systemKey">) => string;
};

export function getTransactionDetailLabels(labels: DashboardLabels): TransactionDetailLabels {
  return {
    back: labels["transactions.detail.back"],
    title: labels["transactions.detail.title"],
    sideRail: labels["transactions.detail.sideRail"],
    kind: {
      EXPENSE: labels["transactions.detail.kind.expense"],
      INCOME: labels["transactions.detail.kind.income"],
      TRANSFER: labels["transactions.detail.kind.transfer"],
      REFUND: labels["transactions.detail.kind.refund"],
      OPENING_BALANCE: "Opening balance",
    },
    status: {
      PENDING: labels["transactions.status.pending"],
      POSTED: labels["transactions.status.posted"],
    },
    field: {
      merchant: labels["transactions.detail.field.merchant"],
      source: labels["transactions.detail.field.source"],
      category: labels["transactions.detail.field.category"],
      account: labels["transactions.detail.field.account"],
      fromAccount: labels["transactions.detail.field.fromAccount"],
      toAccount: labels["transactions.detail.field.toAccount"],
      date: labels["transactions.detail.field.date"],
      time: labels["transactions.detail.field.time"],
      note: labels["transactions.detail.field.note"],
      status: labels["transactions.detail.field.status"],
      addedVia: labels["transactions.detail.field.addedVia"],
      reference: labels["transactions.detail.field.reference"],
    },
    source: {
      title: labels["transactions.detail.source.title"],
      added: labels["transactions.detail.source.added"],
      noReference: labels["transactions.detail.source.noReference"],
      none: labels["transactions.detail.source.none"],
      origin: {
        MANUAL: labels["transactions.detail.origin.manual"],
        AGENT: labels["transactions.detail.origin.agent"],
        IMPORT: labels["transactions.detail.origin.import"],
        BANK_SYNC: labels["transactions.detail.origin.bankSync"],
      },
      channel: { WEB: labels["transactions.detail.channel.web"] },
    },
    financial: {
      title: labels["transactions.detail.financial.title"],
      categoryThisMonth: (category) => formatDashboardLabel(labels, "transactions.detail.financial.categoryThisMonth", { category }),
      recordedSpending: (month) => formatDashboardLabel(labels, "transactions.detail.financial.recordedSpending", { month }),
      recordedIncome: (month) => formatDashboardLabel(labels, "transactions.detail.financial.recordedIncome", { month }),
      accountImpact: labels["transactions.detail.financial.accountImpact"],
      balanceAfter: labels["transactions.detail.financial.balanceAfter"],
      empty: labels["transactions.detail.financial.empty"],
      currentFinancialTruth: labels["transactions.correction.currentFinancialTruth"],
    },
    activity: {
      title: labels["transactions.detail.activity.title"],
      added: labels["transactions.detail.activity.added"],
      recorded: labels["transactions.detail.activity.recorded"],
      categorized: (category) => formatDashboardLabel(labels, "transactions.detail.activity.categorized", { category }),
      categoryAttached: labels["transactions.detail.activity.categoryAttached"],
      posted: labels["transactions.detail.activity.posted"],
      included: labels["transactions.detail.activity.included"],
      empty: labels["transactions.detail.activity.empty"],
      correction: labels["transactions.correction.activity"],
      correctionDetails: labels["transactions.correction.activityDetails"],
      refundIssued: (amount) => formatDashboardLabel(labels, "transactions.refund.activityIssued", { amount }),
      refundDetails: labels["transactions.refund.activityDetails"],
    },
    technical: {
      title: labels["transactions.detail.technical.title"],
      transactionId: labels["transactions.detail.technical.transactionId"],
      created: labels["transactions.detail.technical.created"],
      updated: labels["transactions.detail.technical.updated"],
      correctionId: labels["transactions.correction.technicalId"],
      originalTransactionId: labels["transactions.correction.technicalOriginalId"],
      currentTransactionId: labels["transactions.correction.technicalCurrentId"],
    },
    correction: {
      badge: labels["transactions.correction.badge"],
      title: labels["transactions.correction.historyTitle"],
      wasCorrected: labels["transactions.correction.wasCorrected"],
      correctedAgain: labels["transactions.correction.correctedAgain"],
      currentVersion: labels["transactions.correction.currentVersion"],
      originalVersion: labels["transactions.correction.originalVersion"],
      previousVersion: labels["transactions.correction.previousVersion"],
      viewOriginal: labels["transactions.correction.viewOriginal"],
      viewCurrent: labels["transactions.correction.viewCurrent"],
      viewPrevious: labels["transactions.correction.viewPrevious"],
      originallyRecorded: labels["transactions.correction.originallyRecorded"],
      correctedTo: labels["transactions.correction.correctedTo"],
      correctedAt: (date) => formatDashboardLabel(labels, "transactions.correction.correctedAt", { date }),
      reason: labels["transactions.correction.reason"],
      notProvided: labels["transactions.correction.notProvided"],
      changeDescription: (field, before, after) => formatDashboardLabel(labels, "transactions.correction.changeDescription", { field, before, after }),
      changes: {
        AMOUNT: labels["transactions.correction.change.amount"],
        ACCOUNT: labels["transactions.correction.change.account"],
        TRANSFER_ACCOUNT: labels["transactions.correction.change.transferAccount"],
        CATEGORY: labels["transactions.correction.change.category"],
        MERCHANT: labels["transactions.correction.change.merchant"],
        NOTE: labels["transactions.correction.change.note"],
        DATE: labels["transactions.correction.change.date"],
      },
      technicalTitle: labels["transactions.correction.technicalTitle"],
      technicalDescription: labels["transactions.correction.technicalDescription"],
      technicalCurrent: labels["transactions.correction.technicalCurrent"],
    },
    reversal: {
      badge: labels["transactions.reversal.reversed"],
      reversedOn: labels["transactions.reversal.reversedOn"],
      reason: labels["transactions.reversal.reason"],
      preserved: labels["transactions.reversal.originalPreserved"],
      noFinancialEffect: labels["transactions.reversal.noFinancialEffect"],
      activity: labels["transactions.reversal.activity"],
      activityDetails: labels["transactions.reversal.activityDetails"],
    },
    refund: {
      returnedItem: labels["transactions.refund.reason.returnedItem"],
      cancelledService: labels["transactions.refund.reason.cancelledService"],
      priceAdjustment: labels["transactions.refund.reason.priceAdjustment"],
      duplicateCharge: labels["transactions.refund.reason.duplicateCharge"],
      other: labels["transactions.refund.reason.other"],
    },
    askPace: {
      title: labels["transactions.detail.askPace.title"],
      beta: labels["transactions.detail.askPace.beta"],
      transactionSubject: labels["transactions.detail.askPace.transactionSubject"],
      context: labels["transactions.detail.askPace.context"],
      spendingPrompt: labels["transactions.detail.askPace.spendingPrompt"],
      understandPrompt: labels["transactions.detail.askPace.understandPrompt"],
      categoryPrompt: labels["transactions.detail.askPace.categoryPrompt"],
      transferPrompt: labels["transactions.detail.askPace.transferPrompt"],
    },
    notFound: {
      eyebrow: labels["transactions.detail.notFound.eyebrow"],
      title: labels["transactions.detail.notFound.title"],
      description: labels["transactions.detail.notFound.description"],
      back: labels["transactions.detail.notFound.back"],
    },
    loading: labels["transactions.detail.loading"],
    errorTitle: labels["transactions.detail.error.title"],
    systemCategory: (category) => {
      const key = category.systemKey ? systemCategoryMessageKeys[category.systemKey as keyof typeof systemCategoryMessageKeys] : undefined;
      return key ? labels[key] : category.name;
    },
  };
}
