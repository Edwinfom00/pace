import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { formatDashboardLabel } from "@/i18n/dashboard-messages";
import type { InsightType } from "@/money/insights";
import { localDateForInstant, periodForLocalDates, type Period } from "@/money/period";
import type { RecurringPaymentView } from "@/modules/financial-inbox/financial-inbox-service";
import type { InsightRecord } from "@/modules/insights/domain";
import { presentInsight } from "@/modules/insights/presenters";
import { resolveTransactionIcon } from "@/lib/transaction-visuals/transaction-icon-matcher";
import type { TransactionIconKey } from "@/lib/transaction-visuals/transaction-icon.types";

import { formatOverviewMoney } from "./overview-formatters";

export type OverviewInsightTone = "positive" | "neutral" | "attention";

export interface DailyBriefItem {
  readonly id: string;
  readonly type: InsightType;
  readonly tone: OverviewInsightTone;
  readonly title: string;
  readonly description: string | null;
}

export interface OverviewUpcomingBill {
  readonly recurringId: string;
  readonly merchantName: string;
  readonly nextExpectedAt: string;
  readonly amountMinor: string;
  readonly currency: string;
  readonly iconKey: TransactionIconKey;
}

export interface OverviewTip {
  readonly insightId: string;
  readonly text: string;
}

export interface OverviewDailyBrief {
  readonly items: readonly DailyBriefItem[];
  readonly tip: OverviewTip | null;
}

const insightPriority: Readonly<Record<InsightType, number>> = {
  BUDGET_EXCEEDED: 0,
  GOAL_OFF_TRACK: 1,
  SPENDING_PACE_HIGH: 2,
  UNUSUAL_TRANSACTION: 3,
  RECURRING_PRICE_INCREASE: 4,
  BUDGET_AT_RISK: 5,
  CATEGORY_SPIKE: 6,
  MERCHANT_SPIKE: 7,
  POTENTIAL_SAVINGS: 8,
  MONTH_OVER_MONTH_CHANGE: 9,
  CATEGORY_DROP: 10,
  SPENDING_PACE_LOW: 11,
  GOAL_ON_TRACK: 12,
  NEW_RECURRING_PAYMENT: 13,
};

const tipTypes = new Set<InsightType>([
  "POTENTIAL_SAVINGS",
  "SPENDING_PACE_LOW",
  "GOAL_ON_TRACK",
  "MONTH_OVER_MONTH_CHANGE",
]);


export function buildOverviewDailyBrief(
  insights: readonly InsightRecord[],
  language: string,
  labels: DashboardLabels,
  locale: string,
  period?: Period,
): OverviewDailyBrief {
  const meaningful = insights
    .filter((insight) =>
      insight.status === "ACTIVE" &&
      (!period || (insight.periodStart.getTime() === period.start.getTime() && insight.periodEnd.getTime() === period.end.getTime())),
    )
    .sort((left, right) => {
      const priority = insightPriority[left.type] - insightPriority[right.type];
      if (priority !== 0) return priority;
      const detected = right.lastDetectedAt.getTime() - left.lastDetectedAt.getTime();
      return detected !== 0 ? detected : left.id.localeCompare(right.id);
    });

  const items = meaningful.slice(0, 3).map((insight) => presentDailyBriefItem(insight, language, labels, locale));
  const tipInsight = meaningful.find((insight) => tipTypes.has(insight.type));
  const tipItem = tipInsight ? presentDailyBriefItem(tipInsight, language, labels, locale) : null;

  return {
    items,
    tip: tipItem
      ? { insightId: tipItem.id, text: tipItem.description ?? tipItem.title }
      : null,
  };
}

export function buildOverviewUpcomingBills(
  payments: readonly RecurringPaymentView[],
  timeZone: string,
  from: Date,
  limit = 3,
): readonly OverviewUpcomingBill[] {
  const previewLimit = Math.min(Math.max(Math.floor(limit), 1), 12);
  return payments
    .filter((payment) => payment.status === "CONFIRMED")
    .map((payment) => {
      const merchantName = displayRecurringMerchant(payment.normalizedMerchant);
      return {
        recurringId: payment.id,
        merchantName,
        nextExpectedAt: nextExpectedRecurringDate(payment.lastOccurredAt, payment.cadenceDays, from, timeZone),
        amountMinor: payment.typicalAmountMinor,
        currency: payment.currency,
        iconKey: resolveTransactionIcon({ merchantName, transactionKind: "EXPENSE" }).iconKey,
      };
    })
    .sort((left, right) =>
      new Date(left.nextExpectedAt).getTime() - new Date(right.nextExpectedAt).getTime() ||
      left.merchantName.localeCompare(right.merchantName),
    )
    .slice(0, previewLimit);
}

export function overviewUpcomingBillsPath(workspaceSlug: string): string {
  return `/w/${workspaceSlug}/recurring`;
}

/** Uses local calendar days so bill dates do not drift with a browser time zone or DST. */
export function nextExpectedRecurringDate(
  lastOccurredAt: string,
  cadenceDays: number,
  from: Date,
  timeZone: string,
): string {
  const cadence = Math.max(1, Math.floor(cadenceDays));
  const last = localDateForInstant(new Date(lastOccurredAt), timeZone);
  const target = localDateForInstant(from, timeZone);
  let candidate = new Date(Date.UTC(last.year, last.month - 1, last.day + cadence));

  while (candidate.getTime() < Date.UTC(target.year, target.month - 1, target.day)) {
    candidate = new Date(candidate.getTime() + cadence * 86_400_000);
  }

  const start = formatUtcCalendarDate(candidate);
  const end = formatUtcCalendarDate(new Date(candidate.getTime() + 86_400_000));
  return periodForLocalDates(start, end, timeZone).start.toISOString();
}

function presentDailyBriefItem(
  insight: InsightRecord,
  language: string,
  labels: DashboardLabels,
  locale: string,
): DailyBriefItem {
  const rendered = presentInsight(insight, language);
  return {
    id: insight.id,
    type: insight.type,
    tone: toneForInsight(insight),
    title: rendered.title,
    description: descriptionForInsight(insight, labels, locale),
  };
}

function toneForInsight(insight: InsightRecord): OverviewInsightTone {
  if (insight.severity === "CRITICAL" || insight.type === "BUDGET_AT_RISK" || insight.type === "GOAL_OFF_TRACK") {
    return "attention";
  }
  if (
    insight.type === "CATEGORY_DROP" ||
    insight.type === "SPENDING_PACE_LOW" ||
    insight.type === "GOAL_ON_TRACK" ||
    insight.type === "POTENTIAL_SAVINGS" ||
    (insight.type === "MONTH_OVER_MONTH_CHANGE" && insight.data.direction === "DOWN")
  ) {
    return "positive";
  }
  if (insight.severity === "WARNING") return "attention";
  return "neutral";
}

function descriptionForInsight(insight: InsightRecord, labels: DashboardLabels, locale: string): string | null {
  const money = (key: string) => moneyFact(insight.data[key], insight.data.currency, locale);
  const compared = money("changeMinor");
  const spent = money("spentMinor");
  const budget = money("budgetMinor");
  const expected = money("expectedMinor");
  const savings = money("potentialSavingsMinor");
  const saved = money("currentSavedMinor");
  const target = money("targetMinor");
  const recurring = money("typicalAmountMinor") ?? money("currentMinor");

  if (["CATEGORY_SPIKE", "CATEGORY_DROP", "MERCHANT_SPIKE", "MONTH_OVER_MONTH_CHANGE"].includes(insight.type) && compared) {
    return formatDashboardLabel(labels, "overview.dailyBrief.detail.compared", { amount: compared });
  }
  if (["SPENDING_PACE_HIGH", "SPENDING_PACE_LOW"].includes(insight.type) && spent && expected) {
    return formatDashboardLabel(labels, "overview.dailyBrief.detail.pace", { spent, expected });
  }
  if (["BUDGET_AT_RISK", "BUDGET_EXCEEDED"].includes(insight.type) && spent && budget) {
    return formatDashboardLabel(labels, "overview.dailyBrief.detail.budget", { spent, budget });
  }
  if (insight.type === "POTENTIAL_SAVINGS" && savings) {
    return formatDashboardLabel(labels, "overview.dailyBrief.detail.savings", { amount: savings });
  }
  if (["GOAL_ON_TRACK", "GOAL_OFF_TRACK"].includes(insight.type) && saved && target) {
    return formatDashboardLabel(labels, "overview.dailyBrief.detail.goal", { saved, target });
  }
  if (["RECURRING_PRICE_INCREASE", "NEW_RECURRING_PAYMENT"].includes(insight.type) && recurring) {
    return formatDashboardLabel(labels, "overview.dailyBrief.detail.recurring", { amount: recurring });
  }
  if (insight.type === "UNUSUAL_TRANSACTION" && money("amountMinor")) {
    return formatDashboardLabel(labels, "overview.dailyBrief.detail.unusual", { amount: money("amountMinor")! });
  }
  return null;
}

function moneyFact(value: unknown, currency: unknown, locale: string): string | null {
  if (typeof value !== "string" || !/^-?\d+$/.test(value) || typeof currency !== "string") return null;
  return formatOverviewMoney(value, currency, locale);
}

function displayRecurringMerchant(value: string): string {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

function formatUtcCalendarDate(value: Date): string {
  return `${value.getUTCFullYear().toString().padStart(4, "0")}-${(value.getUTCMonth() + 1).toString().padStart(2, "0")}-${value.getUTCDate().toString().padStart(2, "0")}`;
}
