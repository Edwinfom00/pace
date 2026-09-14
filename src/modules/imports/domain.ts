export const IMPORT_SESSION_STATUSES = [
  "UPLOADED",
  "MAPPING_REQUIRED",
  "READY_FOR_PREVIEW",
  "AWAITING_APPROVAL",
  "IMPORTING",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type ImportSessionStatus = (typeof IMPORT_SESSION_STATUSES)[number];

export const IMPORT_FILE_TYPES = ["CSV", "XLSX"] as const;
export type ImportFileType = (typeof IMPORT_FILE_TYPES)[number];

export const IMPORT_FIELDS = [
  "transactionDate",
  "bookingDate",
  "description",
  "merchant",
  "amount",
  "debit",
  "credit",
  "currency",
  "accountReference",
  "transactionType",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export type ImportAmountMode = "SIGNED" | "DEBIT_CREDIT";
export type SignedAmountDirection = "POSITIVE_IS_INCOME" | "POSITIVE_IS_EXPENSE";
export type ImportDateFormat = "AUTO" | "YMD" | "DMY" | "MDY";
export type ImportDecimalSeparator = "AUTO" | "." | ",";

export interface ParsedImportRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface ParsedImportFile {
  fileType: ImportFileType;
  delimiter: string | null;
  sheetName: string | null;
  headers: string[];
  rows: ParsedImportRow[];
}

export interface ImportMapping {
  columns: Partial<Record<ImportField, string>>;
  amountMode: ImportAmountMode;
  signedAmountDirection: SignedAmountDirection | null;
  dateFormat: ImportDateFormat;
  decimalSeparator: ImportDecimalSeparator;
  accountId: string;
  transferAccountId: string | null;
  fallbackCurrency: string | null;
  defaultExpenseCategoryId: string;
  defaultIncomeCategoryId: string;
}

export interface ImportMappingDraft {
  columns: Partial<Record<ImportField, string>>;
  confidence: Partial<Record<ImportField, number>>;
  reasons: Partial<Record<ImportField, string>>;
  requiresConfirmation: boolean;
}

export type ImportIssueSeverity = "ERROR" | "WARNING";

export interface ImportIssue {
  code: string;
  message: string;
  severity: ImportIssueSeverity;
  field?: ImportField | "row";
}

export type ImportDuplicateStatus = "NONE" | "EXACT_IN_FILE" | "EXACT_EXISTING" | "LIKELY";
export type ImportRowDisposition = "ACCEPT" | "INVALID" | "SKIP_EXACT_DUPLICATE";
export type ImportTransactionKind = "EXPENSE" | "INCOME" | "TRANSFER";

/** A normalized, still-uncommitted ledger candidate. All money remains a decimal string for JSON safety. */
export interface NormalizedImportRow {
  sourceRowNumber: number;
  occurredAt: string;
  bookingAt: string | null;
  description: string | null;
  merchantName: string | null;
  accountReference: string | null;
  kind: ImportTransactionKind;
  amountMinor: string;
  currency: string;
  fingerprint: string;
  duplicateStatus: ImportDuplicateStatus;
  disposition: ImportRowDisposition;
  issues: ImportIssue[];
  transferCandidate: boolean;
}

export interface ImportCurrencyTotals {
  currency: string;
  expenses: { count: number; amountMinor: string };
  income: { count: number; amountMinor: string };
  transfers: { count: number; amountMinor: string };
}

export interface ImportPreview {
  parsedRowCount: number;
  acceptedRowCount: number;
  invalidRowCount: number;
  exactDuplicateRowCount: number;
  likelyDuplicateRowCount: number;
  transferCandidateCount: number;
  dateRange: { start: string; end: string } | null;
  currencies: string[];
  totalsByCurrency: ImportCurrencyTotals[];
}

export interface ImportResult {
  importedRowCount: number;
  skippedExactDuplicateRowCount: number;
  failedRowCount: number;
  deferredPipelineCount: number;
  completedAt: string | null;
}

export interface ImportSessionRecord {
  id: string;
  workspaceId: string;
  initiatedByUserId: string;
  approvedByUserId: string | null;
  status: ImportSessionStatus;
  fileName: string;
  fileType: ImportFileType;
  mimeType: string | null;
  fileChecksum: string;
  sourceSizeBytes: number;
  sheetName: string | null;
  headers: string[];
  parsedRows: ParsedImportRow[] | null;
  stagedRows: NormalizedImportRow[] | null;
  mapping: ImportMapping | null;
  preview: ImportPreview | null;
  result: ImportResult | null;
  rawDataExpiresAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImportAuditRecord {
  id: string;
  importSessionId: string;
  workspaceId: string;
  actorUserId: string | null;
  event: string;
  fromStatus: ImportSessionStatus | null;
  toStatus: ImportSessionStatus | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
