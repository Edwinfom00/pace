import type {
  InsightsInsightTone,
  InsightsTrendDirection,
  InsightsTrendSentiment,
} from "@/modules/insights/overview/insights-overview.types";
import type { LedgerAccountType } from "@/modules/ledger/domain";

export const REPORT_LANGUAGES = ["en", "fr", "de"] as const;
export type ReportLanguage = (typeof REPORT_LANGUAGES)[number];

export const REPORT_OPTIONAL_SECTIONS = [
  "transactions",
  "accounts",
  "recurring",
  "insights",
] as const;
export type ReportOptionalSection = (typeof REPORT_OPTIONAL_SECTIONS)[number];

export const REPORT_PAGES = [
  "cover",
  "executiveSummary",
  "incomeSpending",
  "categories",
  "transactions",
  "accounts",
  "recurring",
  "insights",
  "recommendations",
] as const;
export type ReportPageKind = (typeof REPORT_PAGES)[number];

export interface ReportMetric {
  readonly minor: string;
  readonly previousMinor: string;
  readonly deltaMinor: string;
  readonly direction: InsightsTrendDirection;
  readonly sentiment: InsightsTrendSentiment;
  readonly percentage: string | null;
}

export interface ReportCountMetric {
  readonly current: number;
  readonly previous: number;
  readonly direction: InsightsTrendDirection;
  readonly percentage: string | null;
}

export type ReportHighlight =
  | {
      readonly kind: "spendingChange";
      readonly direction: "up" | "down";
      readonly percentage: string;
      readonly categoryName: string | null;
    }
  | {
      readonly kind: "incomeChange";
      readonly direction: "up" | "down";
      readonly percentage: string;
    }
  | { readonly kind: "netPositive"; readonly amountMinor: string }
  | { readonly kind: "netNegative"; readonly amountMinor: string }
  | { readonly kind: "recurringShare"; readonly shareBps: number }
  | {
      readonly kind: "topCategory";
      readonly name: string;
      readonly shareBps: number;
    }
  | { readonly kind: "transfersExcluded"; readonly count: number };

export type ReportInsight =
  | {
      readonly kind: "spendingUp" | "spendingDown";
      readonly tone: InsightsInsightTone;
      readonly percentage: string;
      readonly deltaMinor: string;
      readonly categoryName: string | null;
      readonly categoryDeltaMinor: string | null;
    }
  | {
      readonly kind: "netImproved" | "netDeclined";
      readonly tone: InsightsInsightTone;
      readonly netMinor: string;
      readonly deltaMinor: string;
    }
  | {
      readonly kind: "recurringHigh";
      readonly tone: InsightsInsightTone;
      readonly shareBps: number;
      readonly amountMinor: string;
    }
  | {
      readonly kind: "recurringPriceIncrease";
      readonly tone: InsightsInsightTone;
      readonly name: string | null;
      readonly percentage: string;
      readonly deltaMinor: string;
    }
  | {
      readonly kind: "categoryConcentration";
      readonly tone: InsightsInsightTone;
      readonly name: string;
      readonly shareBps: number;
    }
  | {
      readonly kind: "engine";
      readonly tone: InsightsInsightTone;
      readonly id: string;
      readonly title: string;
      readonly subject: string | null;
      readonly description: string | null;
    };

export type ReportRecommendation =
  | {
      readonly kind: "budgetCategory";
      readonly categoryName: string;
      readonly percentage: string;
      readonly deltaMinor: string;
    }
  | {
      readonly kind: "reviewRecurring";
      readonly count: number;
      readonly amountMinor: string;
      readonly shareBps: number;
    }
  | {
      readonly kind: "reviewPriceIncrease";
      readonly name: string | null;
      readonly percentage: string;
    }
  | {
      readonly kind: "keepSaving";
      readonly savingsRateBps: number;
      readonly netMinor: string;
    }
  | { readonly kind: "reduceDeficit"; readonly deficitMinor: string }
  | {
      readonly kind: "categorize";
      readonly amountMinor: string;
      readonly count: number;
    };

export interface ReportMonth {
  readonly month: string;
  readonly incomeMinor: string;
  readonly spendingMinor: string;
  readonly netMinor: string;
  readonly isPartial: boolean;
  readonly isReportMonth: boolean;
}

export interface ReportCategory {
  readonly id: string;
  readonly name: string;
  readonly amountMinor: string;
  readonly previousMinor: string;
  readonly shareBps: number;
  readonly changePercentage: string | null;
  readonly direction: InsightsTrendDirection;
  readonly isUncategorized: boolean;
  readonly categoryKey: string | null;
}

export type ReportTransactionKind =
  | "INCOME"
  | "EXPENSE"
  | "REFUND"
  | "TRANSFER";

export interface ReportTransaction {
  readonly id: string;
  readonly date: string;
  readonly kind: ReportTransactionKind;
  readonly title: string | null;
  readonly merchantName: string | null;
  readonly categoryName: string | null;
  readonly categoryKey: string | null;
  readonly accountName: string | null;
  readonly counterpartyAccountName: string | null;
  readonly amountMinor: string;
  readonly signedMinor: string;
}

export interface ReportAccount {
  readonly id: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly typeLabel: string;
  readonly openingMinor: string;
  readonly closingMinor: string;
  readonly balanceChangePercentage: string | null;
  readonly balanceDirection: InsightsTrendDirection;
  readonly inflowsMinor: string;
  readonly outflowsMinor: string;
  readonly netMinor: string;
  readonly transactionCount: number;
  readonly isArchived: boolean;
}

export type ReportCadence =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";

export interface ReportRecurringItem {
  readonly id: string;
  readonly name: string | null;
  readonly categoryName: string | null;
  readonly actualMinor: string;
  readonly typicalAmountMinor: string;
  readonly cadence: ReportCadence;
  readonly cadenceDays: number;
  readonly paymentCount: number;
}

export interface FinancialReportDTO {
  readonly meta: {
    readonly version: 1;
    readonly language: ReportLanguage;
    readonly locale: string;
    readonly timeZone: string;
    readonly generatedAt: string;
    readonly generatedDate: string;
    readonly fileName: string;
    readonly pages: readonly ReportPageKind[];
  };
  readonly workspace: {
    readonly name: string;
    readonly slug: string;
  };
  readonly period: {
    readonly key: string;
    readonly firstDate: string;
    readonly lastDate: string;
    readonly monthLastDate: string;
    readonly isPartial: boolean;
    readonly previous: {
      readonly key: string;
      readonly firstDate: string;
      readonly lastDate: string;
      readonly isPartial: boolean;
    };
  };
  readonly currency: {
    readonly code: string;
    readonly workspaceCurrency: string;
    readonly excludedCurrencies: readonly {
      readonly code: string;
      readonly transactionCount: number;
    }[];
  };
  readonly hasActivity: boolean;
  readonly executiveSummary: {
    readonly income: ReportMetric;
    readonly spending: ReportMetric;
    readonly net: ReportMetric;
    readonly transactions: ReportCountMetric;
    readonly highlights: readonly ReportHighlight[];
  };
  readonly incomeSpending: {
    readonly months: readonly ReportMonth[];
  };
  readonly categoryBreakdown: {
    readonly totalMinor: string;
    readonly items: readonly ReportCategory[];
    readonly other: {
      readonly amountMinor: string;
      readonly shareBps: number;
      readonly categoryCount: number;
    } | null;
    readonly evolution: readonly ReportCategory[];
  };
  readonly keyTransactions: {
    readonly items: readonly ReportTransaction[];
    readonly totalCount: number;
  } | null;
  readonly accounts: {
    readonly items: readonly ReportAccount[];
    readonly otherCurrencyCount: number;
  } | null;
  readonly recurring: {
    readonly actualMinor: string;
    readonly totalSpendingMinor: string;
    readonly shareBps: number;
    readonly paidCount: number;
    readonly items: readonly ReportRecurringItem[];
    readonly projection: {
      readonly firstDate: string;
      readonly lastDate: string;
      readonly outflowMinor: string;
      readonly occurrenceCount: number;
      readonly hasVariableAmounts: boolean;
    };
  } | null;
  readonly insights: {
    readonly items: readonly ReportInsight[];
  } | null;
  readonly recommendations: {
    readonly items: readonly ReportRecommendation[];
  };
}

export interface FinancialReportRequest {
  readonly periodKey: string | undefined;
  readonly language: ReportLanguage;
  readonly currency: string | null;
  readonly sections: readonly ReportOptionalSection[];
}

export function parseReportLanguage(
  value: string | null | undefined,
  fallback: ReportLanguage = "en",
): ReportLanguage {
  return REPORT_LANGUAGES.includes(value as ReportLanguage)
    ? (value as ReportLanguage)
    : fallback;
}

export function parseReportSections(
  value: string | null | undefined,
): ReportOptionalSection[] {
  if (value === null || value === undefined)
    return [...REPORT_OPTIONAL_SECTIONS];
  const requested = new Set(value.split(",").map((section) => section.trim()));
  return REPORT_OPTIONAL_SECTIONS.filter((section) => requested.has(section));
}

export function parseReportPeriodKey(
  value: string | null | undefined,
): string | undefined {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : undefined;
}

export function reportPages(
  sections: readonly ReportOptionalSection[],
): ReportPageKind[] {
  const included = new Set<ReportPageKind>([
    "cover",
    "executiveSummary",
    "incomeSpending",
    "categories",
    "recommendations",
  ]);
  for (const section of sections) included.add(section);
  return REPORT_PAGES.filter((page) => included.has(page));
}
