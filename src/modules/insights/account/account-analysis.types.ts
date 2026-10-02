import type { LedgerAccountType } from "@/modules/ledger/domain";

import type {
  InsightsMetric,
  InsightsRange,
  InsightsWindow,
} from "../overview/insights-overview.types";

export type AccountMovementKind =
  | "INCOME"
  | "EXPENSE"
  | "REFUND"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

export interface AccountAnalysisIdentity {
  readonly id: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly currency: string;
  readonly status: "ACTIVE" | "ARCHIVED";
}

export interface AccountAnalysisBalances {
  readonly periodOpeningMinor: string;
  readonly periodClosingMinor: string;
  readonly currentMinor: string;
  readonly availableMinor: string | null;
  readonly openingBalance: {
    readonly amountMinor: string;
    readonly date: string;
  } | null;
}

export interface AccountAnalysisComposition {
  readonly incomeMinor: string;
  readonly refundsMinor: string;
  readonly transfersInMinor: string;
  readonly expensesMinor: string;
  readonly transfersOutMinor: string;
}

export interface AccountBalancePoint {
  readonly date: string;
  readonly balanceMinor: string | null;
}

export interface AccountAnalysisCategory {
  readonly id: string;
  readonly name: string;
  readonly spendingMinor: string;
  readonly previousSpendingMinor: string;
  readonly shareBps: number;
  readonly transactionCount: number;
  readonly isUncategorized: boolean;
}

export interface AccountAnalysisCounterparty {
  readonly id: string;
  readonly kind: "merchant" | "account";
  readonly name: string | null;
  readonly inflowMinor: string;
  readonly outflowMinor: string;
  readonly shareBps: number;
  readonly transactionCount: number;
}

export interface AccountAnalysisTransaction {
  readonly id: string;
  readonly movement: AccountMovementKind;
  readonly date: string;
  readonly signedMinor: string;
  readonly merchantName: string | null;
  readonly counterpartyAccountName: string | null;
  readonly categoryName: string | null;
}

export type AccountAnalysisInsight =
  | {
      readonly kind: "strongestOutflowWeek";
      readonly firstDate: string;
      readonly lastDate: string;
      readonly outflowMinor: string;
      readonly shareBps: number;
    }
  | {
      readonly kind: "unusualMovement";
      readonly transactionId: string;
      readonly date: string;
      readonly direction: "inflow" | "outflow";
      readonly amountMinor: string;
      readonly multiple: number;
      readonly counterpartyName: string | null;
    }
  | {
      readonly kind: "recurringConcentration";
      readonly payeeCount: number;
      readonly amountMinor: string;
      readonly shareBps: number;
    }
  | {
      readonly kind: "lowestBalance";
      readonly date: string;
      readonly balanceMinor: string;
    };

export interface AccountAnalysis {
  readonly account: AccountAnalysisIdentity;
  readonly currency: string;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly range: InsightsRange;
  readonly periodKey: string;
  readonly current: InsightsWindow;
  readonly previous: InsightsWindow;
  readonly hasActivity: boolean;
  readonly balances: AccountAnalysisBalances;
  readonly kpis: {
    readonly inflows: InsightsMetric;
    readonly outflows: InsightsMetric;
    readonly net: InsightsMetric;
    readonly transactionCount: {
      readonly current: number;
      readonly previous: number;
    };
  };
  readonly composition: AccountAnalysisComposition;
  readonly balanceTrend: {
    readonly hasMovement: boolean;
    readonly points: readonly AccountBalancePoint[];
  };
  readonly categories: {
    readonly totalMinor: string;
    readonly items: readonly AccountAnalysisCategory[];
    readonly other: {
      readonly spendingMinor: string;
      readonly shareBps: number;
      readonly categoryCount: number;
    } | null;
  };
  readonly counterparties: readonly AccountAnalysisCounterparty[];
  readonly transactions: {
    readonly items: readonly AccountAnalysisTransaction[];
    readonly totalCount: number;
    readonly transferCount: number;
  };
  readonly insights: readonly AccountAnalysisInsight[];
  readonly exclusions: {
    readonly pendingCount: number;
    readonly otherCurrencyCount: number;
  };
}

export interface InsightsAccountSummary {
  readonly id: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly inflowsMinor: string;
  readonly outflowsMinor: string;
  readonly netMinor: string;
  readonly transactionCount: number;
}
