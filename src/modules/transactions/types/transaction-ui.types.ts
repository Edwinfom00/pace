import type { MerchantLogoKey } from "@/lib/transaction-visuals/merchant-logo-catalog";
import type { TransactionIconKey } from "@/lib/transaction-visuals/transaction-icon.types";
import type {
  LedgerTransactionKind,
  LedgerTransactionStatus,
} from "@/modules/ledger/domain";

/** JSON-safe money payload. Minor units stay strings so no financial value is coerced to Number. */
export type SerializedMoney = {
  readonly currency: string;
  readonly minor: string;
};

export type TransactionListItem = {
  readonly id: string;
  readonly merchant: {
    readonly name: string;
    readonly description?: string | null;
    readonly iconKey?: TransactionIconKey | string | null;
    readonly merchantLogoKey?: MerchantLogoKey | null;
  };
  readonly amount: SerializedMoney;
  readonly kind: LedgerTransactionKind;
  readonly category?: {
    readonly key: string;
    readonly label: string;
  } | null;
  readonly account?: {
    readonly id: string;
    /** Canonical, already-masked account display metadata. */
    readonly displayName: string;
  } | null;
  readonly occurredAt: string;
  readonly status: LedgerTransactionStatus;
};

export const TRANSACTION_FILTER_KINDS = [
  "ALL",
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "REFUND",
] as const;
export type TransactionFilterKind = (typeof TRANSACTION_FILTER_KINDS)[number];

export const TRANSACTION_SORT_VALUES = [
  "NEWEST",
  "OLDEST",
  "HIGHEST",
  "LOWEST",
] as const;
export type TransactionSortValue = (typeof TRANSACTION_SORT_VALUES)[number];

export type TransactionFilterStatus = "PENDING";

export type TransactionFilterState = {
  readonly kind: TransactionFilterKind;
  readonly status?: TransactionFilterStatus;
  readonly search: string;
  readonly categoryId?: string;
  readonly accountId?: string;
  /** ISO calendar date in the workspace's canonical timezone. */
  readonly from?: string;
  /** ISO calendar date in the workspace's canonical timezone. */
  readonly to?: string;
  readonly sort: TransactionSortValue;
};

export type TransactionFilterOption = {
  readonly id: string;
  readonly label: string;
};

export type TransactionFilterOptions = {
  readonly categories: readonly TransactionFilterOption[];
  readonly accounts: readonly TransactionFilterOption[];
};

export type TransactionListState = TransactionFilterState & {
  readonly page: number;
  readonly pageSize?: number;
};

export type TransactionSummaryTotals = {
  readonly incomeMinor: string;
  readonly spendingMinor: string;
};

export type TransactionListSummary = {
  readonly currency: string;
  readonly current: TransactionSummaryTotals;
  readonly hasOtherCurrencies: boolean;
  readonly comparison: {
    readonly from: string;
    readonly totalCount: number;
    readonly totals: TransactionSummaryTotals;
  } | null;
};

export type TransactionPaginationState = {
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
};

export type TransactionRowAction = {
  readonly id: "view" | "edit" | "duplicate" | "review" | "remove";
  readonly label: string;
  readonly onSelect?: () => void;
  readonly disabled?: boolean;
};
