import type {
  InsightsCurrencyOption,
  InsightsMetric,
  InsightsOverview,
  InsightsRange,
  InsightsWindow,
} from "../overview/insights-overview.types";

export interface CategoryAnalysisIdentity {
  readonly id: string;
  readonly name: string;
  readonly parent: { readonly id: string; readonly name: string } | null;
  readonly childCount: number;
}

export interface CategoryAnalysisCount {
  readonly current: number;
  readonly previous: number;
}

export interface CategoryAnalysisRow {
  readonly id: string;
  readonly name: string | null;
  readonly currentMinor: string;
  readonly previousMinor: string;
  readonly deltaMinor: string;
  readonly direction: "up" | "down" | "neutral";
  readonly percentage: string | null;
  readonly shareBps: number;
  readonly transactionCount: number;
}

export interface CategoryAnalysisMerchants {
  readonly items: readonly CategoryAnalysisRow[];
  readonly other: {
    readonly currentMinor: string;
    readonly shareBps: number;
    readonly merchantCount: number;
  } | null;
}

export interface CategoryAnalysisSubcategory extends CategoryAnalysisRow {
  readonly isDirect: boolean;
}

export interface CategoryAnalysisTransaction {
  readonly id: string;
  readonly kind: "EXPENSE" | "REFUND";
  readonly date: string;
  readonly signedMinor: string;
  readonly merchantName: string | null;
  readonly categoryId: string;
  readonly categoryName: string | null;
}

export type CategoryAnalysisInsight =
  | {
      readonly kind: "biggestIncrease";
      readonly dimension: "merchant" | "subcategory";
      readonly id: string;
      readonly name: string;
      readonly deltaMinor: string;
      readonly percentage: string | null;
    }
  | {
      readonly kind: "strongestWeek";
      readonly firstDate: string;
      readonly lastDate: string;
      readonly spendingMinor: string;
      readonly shareBps: number;
    }
  | {
      readonly kind: "merchantConcentration";
      readonly id: string;
      readonly name: string;
      readonly shareBps: number;
    }
  | {
      readonly kind: "largestTransaction";
      readonly transactionId: string;
      readonly date: string;
      readonly amountMinor: string;
      readonly merchantName: string | null;
    };

export interface CategoryAnalysis {
  readonly category: CategoryAnalysisIdentity;
  readonly currency: string;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly range: InsightsRange;
  readonly periodKey: string;
  readonly current: InsightsWindow;
  readonly previous: InsightsWindow;
  readonly hasActivity: boolean;
  readonly kpis: {
    readonly spent: InsightsMetric;
    readonly transactionCount: CategoryAnalysisCount;
    readonly averageTransaction: InsightsMetric;
  };
  readonly shareOfSpendingBps: number;
  readonly spendingTrend: InsightsOverview["spendingTrend"];
  readonly merchants: CategoryAnalysisMerchants;
  readonly subcategories: readonly CategoryAnalysisSubcategory[] | null;
  readonly transactions: {
    readonly items: readonly CategoryAnalysisTransaction[];
    readonly totalCount: number;
    readonly refundCount: number;
  };
  readonly insights: readonly CategoryAnalysisInsight[];
  readonly currencies: readonly InsightsCurrencyOption[];
  readonly exclusions: {
    readonly transferCount: number;
    readonly pendingCount: number;
    readonly otherCurrencyCount: number;
  };
}
