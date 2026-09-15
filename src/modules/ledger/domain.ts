export const LEDGER_CATEGORY_KINDS = ["EXPENSE", "INCOME"] as const;
export type LedgerCategoryKind = (typeof LEDGER_CATEGORY_KINDS)[number];

export const LEDGER_TRANSACTION_KINDS = ["EXPENSE", "INCOME", "TRANSFER", "REFUND"] as const;
export type LedgerTransactionKind = (typeof LEDGER_TRANSACTION_KINDS)[number];

export const LEDGER_TRANSACTION_STATUSES = ["PENDING", "POSTED"] as const;
export type LedgerTransactionStatus = (typeof LEDGER_TRANSACTION_STATUSES)[number];

export type SourceMetadata = Record<string, unknown>;


export const LEDGER_ACCOUNT_TYPES = ["CASH", "CHECKING", "SAVINGS", "CREDIT_CARD", "MOBILE_MONEY", "OTHER"] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];

export interface LedgerAccountRecord {
  id: string;
  workspaceId: string;
  name: string;
  currency: string;
  openingBalanceMinor: bigint;
  createdByUserId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerCategoryRecord {
  id: string;
  workspaceId: string | null;
  name: string;
  kind: LedgerCategoryKind;
  isSystem: boolean;
  systemKey: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerMerchantRecord {
  id: string;
  workspaceId: string;
  name: string;
  normalizedName: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerTransactionRecord {
  id: string;
  workspaceId: string;
  kind: LedgerTransactionKind;
  status: LedgerTransactionStatus;
  amountMinor: bigint;
  currency: string;
  occurredAt: Date;
  accountId: string | null;
  transferAccountId: string | null;
  categoryId: string | null;
  merchantId: string | null;
  createdByUserId: string;
  paidByUserId: string | null;
  transferGroupId: string | null;
  refundedTransactionId: string | null;
  source: SourceMetadata;
  deduplicationFingerprint: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerTransactionFilters {
  statuses?: readonly LedgerTransactionStatus[];
  accountId?: string;
  categoryId?: string;
  merchantId?: string;
  occurredFrom?: Date;
  occurredTo?: Date;
  limit?: number;
}


export const LEDGER_TRANSACTION_LIST_SORTS = ["NEWEST", "OLDEST", "HIGHEST", "LOWEST"] as const;
export type LedgerTransactionListSort = (typeof LEDGER_TRANSACTION_LIST_SORTS)[number];

export interface LedgerTransactionListFilters {
  kind?: LedgerTransactionKind;
  accountId?: string;
  categoryId?: string;
  occurredFrom?: Date;
  occurredToExclusive?: Date;
  search?: string;
}

export interface LedgerTransactionListPageInput extends LedgerTransactionListFilters {
  offset: number;
  limit: number;
  sort: LedgerTransactionListSort;
}


export interface LedgerTransactionListRow {
  transaction: LedgerTransactionRecord;
  account: LedgerAccountRecord | null;
  category: LedgerCategoryRecord | null;
  merchant: LedgerMerchantRecord | null;
}

export function normalizeMerchantName(value: string): string {
  return value.normalize("NFKC").trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("en-US");
}
