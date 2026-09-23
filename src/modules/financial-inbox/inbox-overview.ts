import type { TransactionListItem } from "@/modules/transactions/types/transaction-ui.types";

import type {
  ClassificationSource,
  ClassificationStatus,
  FinancialInboxItemRecord,
  InboxItemStatus,
  InboxReason,
  RecurringPaymentOrigin,
  RecurringPaymentStatus,
  TransactionClassificationRecord,
} from "./domain";
import type {
  LedgerCategoryRecord,
  LedgerTransactionListRow,
} from "../ledger/domain";
import type { InboxResolutionCapabilities } from "./inbox-resolution-policy";

export const INBOX_OVERVIEW_PAGE_SIZE = 25;
export const INBOX_OVERVIEW_MAX_PAGE = 100_000;
export const INBOX_OVERVIEW_SORTS = ["NEWEST", "OLDEST"] as const;

export type InboxOverviewFilter = InboxReason | null;
export type InboxOverviewSort = (typeof INBOX_OVERVIEW_SORTS)[number];

export type InboxOverviewReadInput = {
  readonly workspaceId: string;
  readonly reason: InboxOverviewFilter;
  readonly sort: InboxOverviewSort;
  readonly offset: number;
  readonly limit: number;
};


export type InboxOverviewReadRow = {
  readonly item: FinancialInboxItemRecord;
  readonly transaction: LedgerTransactionListRow;
  readonly classification: TransactionClassificationRecord | null;
  readonly suggestedCategory: LedgerCategoryRecord | null;
  readonly recurring: {
    readonly id: string;
    readonly status: RecurringPaymentStatus;
    readonly origin: RecurringPaymentOrigin;
    readonly cadenceDays: number;
  } | null;
};

export type InboxReasonCount = {
  readonly reason: InboxReason;
  readonly count: number;
};

export type InboxOverviewReadResult = {
  readonly rows: readonly InboxOverviewReadRow[];
  /** The newest resolved records, never merged into the active queue. */
  readonly recentlyResolvedRows: readonly InboxOverviewReadRow[];
  readonly unresolvedCount: number;
  /** Count after the selected canonical reason filter is applied. */
  readonly filteredCount: number;
  readonly reasonCounts: readonly InboxReasonCount[];
};

export interface InboxOverviewReader {
  readInboxOverview(input: InboxOverviewReadInput): Promise<InboxOverviewReadResult>;
}

export type InboxOverviewItem = {
  readonly id: string;
  readonly reason: InboxReason;
  /** The two list views are intentionally separate: active or recently resolved. */
  readonly status: Extract<InboxItemStatus, "OPEN" | "RESOLVED">;
  /** Lightweight server-derived policy for this row. */
  readonly capabilities: InboxResolutionCapabilities;
  readonly createdAt: string;
  readonly transaction: TransactionListItem;
  readonly classification: {
    readonly id: string;
    readonly source: ClassificationSource;
    readonly status: ClassificationStatus;
    readonly confidence: number;
    /** Never rendered as a confirmed transaction category. */
    readonly proposal: {
      readonly id: string;
      readonly label: string;
      readonly key: string;
    } | null;
  } | null;
  readonly recurring: {
    readonly id: string;
    readonly status: RecurringPaymentStatus;
    readonly origin: RecurringPaymentOrigin;
    readonly cadenceDays: number;
  } | null;
  /** A restrained, safe presentation of existing transaction source metadata. */
  readonly provenance: "IMPORT" | "MANUAL" | null;
};

export type InboxOverview = {
  readonly unresolvedCount: number;
  readonly availableFilters: readonly InboxReasonCount[];
  readonly activeFilter: InboxOverviewFilter;
  readonly sort: InboxOverviewSort;
  readonly items: readonly InboxOverviewItem[];
  /** Bounded, read-only history for the separate “Recently resolved” view. */
  readonly recentlyResolved: readonly InboxOverviewItem[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalCount: number;
  };
};

export type InboxOverviewQuery = {
  readonly reason: InboxOverviewFilter;
  readonly sort: InboxOverviewSort;
  readonly page: number;
};

export const DEFAULT_INBOX_OVERVIEW_QUERY: InboxOverviewQuery = {
  reason: null,
  sort: "NEWEST",
  page: 1,
};

export function inboxOverviewHref(pathname: string, query: InboxOverviewQuery): string {
  const params = new URLSearchParams();
  if (query.reason) params.set("reason", query.reason);
  if (query.sort !== "NEWEST") params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}
