import type { InsightsDeterministicItem } from "@/modules/insights/overview/insights-overview.types";

import type {
  ReportCadence,
  ReportHighlight,
  ReportInsight,
  ReportMetric,
  ReportRecommendation,
} from "./financial-report.types";

export const REPORT_HIGHLIGHT_LIMIT = 5;
export const REPORT_INSIGHT_LIMIT = 5;
export const REPORT_RECOMMENDATION_LIMIT = 4;
export const RECURRING_HIGH_SHARE_BPS = 3_000;
export const RECURRING_REVIEW_SHARE_BPS = 2_500;
export const CATEGORY_CONCENTRATION_BPS = 3_500;
export const CATEGORY_BUDGET_MIN_PERCENT = 15n;

export interface ReportCategoryIncrease {
  readonly name: string;
  readonly percentage: string | null;
  readonly deltaMinor: string;
}

export interface ReportRuleInput {
  readonly income: ReportMetric;
  readonly spending: ReportMetric;
  readonly net: ReportMetric;
  readonly hasActivity: boolean;
  readonly topCategory: {
    readonly name: string;
    readonly shareBps: number;
  } | null;
  readonly topCategoryIncrease: ReportCategoryIncrease | null;
  readonly recurring: {
    readonly amountMinor: string;
    readonly shareBps: number;
    readonly count: number;
    readonly priceIncrease: {
      readonly name: string | null;
      readonly percentage: string;
      readonly deltaMinor: string;
    } | null;
  } | null;
  readonly uncategorized: {
    readonly amountMinor: string;
    readonly count: number;
  } | null;
  readonly transferCount: number;
  readonly engineInsights: readonly InsightsDeterministicItem[];
}

const ENGINE_OVERLAPS: Readonly<
  Partial<Record<ReportInsight["kind"], readonly string[]>>
> = {
  spendingUp: [
    "MONTH_OVER_MONTH_CHANGE",
    "SPENDING_PACE_HIGH",
    "SPENDING_PACE_LOW",
  ],
  spendingDown: [
    "MONTH_OVER_MONTH_CHANGE",
    "SPENDING_PACE_HIGH",
    "SPENDING_PACE_LOW",
  ],
  recurringPriceIncrease: ["RECURRING_PRICE_INCREASE"],
};

export function reportHighlights(input: ReportRuleInput): ReportHighlight[] {
  if (!input.hasActivity) return [];
  const highlights: ReportHighlight[] = [];
  const { spending, income, net } = input;
  if (spending.direction !== "neutral" && spending.percentage !== null) {
    highlights.push({
      kind: "spendingChange",
      direction: spending.direction,
      percentage: spending.percentage,
      categoryName:
        spending.direction === "up"
          ? (input.topCategoryIncrease?.name ?? null)
          : null,
    });
  }
  const netMinor = BigInt(net.minor);
  if (netMinor > 0n)
    highlights.push({ kind: "netPositive", amountMinor: net.minor });
  if (netMinor < 0n)
    highlights.push({
      kind: "netNegative",
      amountMinor: (-netMinor).toString(),
    });
  if (input.recurring && input.recurring.shareBps > 0) {
    highlights.push({
      kind: "recurringShare",
      shareBps: input.recurring.shareBps,
    });
  }
  if (input.topCategory)
    highlights.push({ kind: "topCategory", ...input.topCategory });
  if (income.direction !== "neutral" && income.percentage !== null) {
    highlights.push({
      kind: "incomeChange",
      direction: income.direction,
      percentage: income.percentage,
    });
  }
  if (input.transferCount > 0)
    highlights.push({ kind: "transfersExcluded", count: input.transferCount });
  return highlights.slice(0, REPORT_HIGHLIGHT_LIMIT);
}

export function reportInsights(input: ReportRuleInput): ReportInsight[] {
  if (!input.hasActivity) return [];
  const insights: ReportInsight[] = [];
  const { spending, net } = input;
  if (spending.direction !== "neutral" && spending.percentage !== null) {
    const increase =
      spending.direction === "up" ? input.topCategoryIncrease : null;
    insights.push({
      kind: spending.direction === "up" ? "spendingUp" : "spendingDown",
      tone: spending.direction === "up" ? "attention" : "positive",
      percentage: spending.percentage,
      deltaMinor: absolute(spending.deltaMinor),
      categoryName: increase?.name ?? null,
      categoryDeltaMinor: increase?.deltaMinor ?? null,
    });
  }
  if (net.direction !== "neutral" && BigInt(net.previousMinor) !== 0n) {
    insights.push({
      kind: net.direction === "up" ? "netImproved" : "netDeclined",
      tone: net.direction === "up" ? "positive" : "attention",
      netMinor: net.minor,
      deltaMinor: absolute(net.deltaMinor),
    });
  }
  if (input.recurring && input.recurring.shareBps >= RECURRING_HIGH_SHARE_BPS) {
    insights.push({
      kind: "recurringHigh",
      tone: "attention",
      shareBps: input.recurring.shareBps,
      amountMinor: input.recurring.amountMinor,
    });
  }
  if (input.recurring?.priceIncrease) {
    insights.push({
      kind: "recurringPriceIncrease",
      tone: "attention",
      ...input.recurring.priceIncrease,
    });
  }
  if (
    input.topCategory &&
    input.topCategory.shareBps >= CATEGORY_CONCENTRATION_BPS
  ) {
    insights.push({
      kind: "categoryConcentration",
      tone: "neutral",
      ...input.topCategory,
    });
  }
  const covered = new Set(
    insights.flatMap((insight) => ENGINE_OVERLAPS[insight.kind] ?? []),
  );
  for (const item of input.engineInsights) {
    if (insights.length >= REPORT_INSIGHT_LIMIT) break;
    if (covered.has(item.type)) continue;
    insights.push({
      kind: "engine",
      tone: item.tone,
      id: item.id,
      title: item.title,
      subject: item.subject,
      description: item.description,
    });
  }
  return insights.slice(0, REPORT_INSIGHT_LIMIT);
}

export function reportRecommendations(
  input: ReportRuleInput,
): ReportRecommendation[] {
  if (!input.hasActivity) return [];
  const recommendations: ReportRecommendation[] = [];
  const netMinor = BigInt(input.net.minor);
  const incomeMinor = BigInt(input.income.minor);
  if (netMinor < 0n)
    recommendations.push({
      kind: "reduceDeficit",
      deficitMinor: (-netMinor).toString(),
    });
  const increase = input.topCategoryIncrease;
  if (
    increase?.percentage &&
    BigInt(increase.percentage) >= CATEGORY_BUDGET_MIN_PERCENT
  ) {
    recommendations.push({
      kind: "budgetCategory",
      categoryName: increase.name,
      percentage: increase.percentage,
      deltaMinor: increase.deltaMinor,
    });
  }
  if (input.recurring?.priceIncrease) {
    recommendations.push({
      kind: "reviewPriceIncrease",
      name: input.recurring.priceIncrease.name,
      percentage: input.recurring.priceIncrease.percentage,
    });
  }
  if (
    input.recurring &&
    input.recurring.shareBps >= RECURRING_REVIEW_SHARE_BPS &&
    input.recurring.count > 0
  ) {
    recommendations.push({
      kind: "reviewRecurring",
      count: input.recurring.count,
      amountMinor: input.recurring.amountMinor,
      shareBps: input.recurring.shareBps,
    });
  }
  if (input.uncategorized && BigInt(input.uncategorized.amountMinor) > 0n) {
    recommendations.push({ kind: "categorize", ...input.uncategorized });
  }
  if (netMinor > 0n && incomeMinor > 0n) {
    recommendations.push({
      kind: "keepSaving",
      savingsRateBps: Number((netMinor * 10_000n) / incomeMinor),
      netMinor: input.net.minor,
    });
  }
  return recommendations.slice(0, REPORT_RECOMMENDATION_LIMIT);
}

export function reportCadence(cadenceDays: number): ReportCadence {
  if (cadenceDays >= 6 && cadenceDays <= 8) return "weekly";
  if (cadenceDays >= 13 && cadenceDays <= 16) return "biweekly";
  if (cadenceDays >= 27 && cadenceDays <= 32) return "monthly";
  if (cadenceDays >= 85 && cadenceDays <= 95) return "quarterly";
  if (cadenceDays >= 360 && cadenceDays <= 370) return "yearly";
  return "custom";
}

export function percentageChange(
  current: bigint,
  previous: bigint,
): string | null {
  if (previous <= 0n) return null;
  const delta = current - previous;
  const magnitude = delta < 0n ? -delta : delta;
  return ((magnitude * 100n + previous / 2n) / previous).toString();
}

function absolute(minor: string): string {
  const value = BigInt(minor);
  return (value < 0n ? -value : value).toString();
}
