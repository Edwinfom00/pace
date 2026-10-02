import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
} from "@/modules/ledger/domain";

import type {
  ImportColumnMapping,
  ImportDateFormat,
  ImportMapping,
  NormalizedImportRow,
  ParsedImportRow,
} from "./domain";

export const IMPORT_BLOCKING_ISSUE_CODES = [
  "ACCOUNT_CURRENCY_MISMATCH",
  "AMBIGUOUS_DATE",
  "BOTH_DEBIT_AND_CREDIT",
  "INVALID_AMOUNT",
  "INVALID_CURRENCY",
  "INVALID_DATE",
  "MISSING_AMOUNT",
  "MISSING_CURRENCY",
  "MISSING_DATE",
  "MISSING_DESCRIPTION",
  "SIGNED_DIRECTION_REQUIRED",
  "TEXT_TOO_LONG",
  "TRANSFER_ACCOUNT_REQUIRED",
  "TRANSFER_SAME_ACCOUNT",
  "OTHER",
] as const;
export type ImportBlockingIssueCode =
  (typeof IMPORT_BLOCKING_ISSUE_CODES)[number];

export interface ImportReviewIssue {
  sourceRowNumber: number;
  code: ImportBlockingIssueCode;
}

export interface ImportReviewSummary {
  parsedRowCount: number;
  toImportRowCount: number;
  inboxRowCount: number;
  exactDuplicateRowCount: number;
  blockingErrorRowCount: number;
  currency: string | null;
  dateRange: { start: string; end: string } | null;
}

const MAX_REVIEW_ISSUES = 5;

export function summarizeImportReview(
  rows: readonly NormalizedImportRow[],
  currency: string | null,
): ImportReviewSummary {
  const accepted = rows.filter((row) => row.disposition === "ACCEPT");
  const dates = rows
    .filter((row) => row.disposition !== "INVALID")
    .map((row) => row.occurredAt)
    .filter(Boolean)
    .sort();
  return {
    parsedRowCount: rows.length,
    toImportRowCount: accepted.length,
    inboxRowCount: accepted.filter(isLikelyInboxHandoff).length,
    exactDuplicateRowCount: rows.filter(
      (row) => row.disposition === "SKIP_EXACT_DUPLICATE",
    ).length,
    blockingErrorRowCount: rows.filter((row) => row.disposition === "INVALID")
      .length,
    currency,
    dateRange: dates.length
      ? { start: dates[0]!.slice(0, 10), end: dates.at(-1)!.slice(0, 10) }
      : null,
  };
}

export function isLikelyInboxHandoff(row: NormalizedImportRow): boolean {
  return (
    row.disposition === "ACCEPT" &&
    row.duplicateStatus === "LIKELY" &&
    row.kind !== "TRANSFER"
  );
}

export function importReviewIssues(
  rows: readonly NormalizedImportRow[],
): ImportReviewIssue[] {
  return rows
    .filter((row) => row.disposition === "INVALID")
    .slice(0, MAX_REVIEW_ISSUES)
    .map((row) => {
      const code =
        row.issues.find((issue) => issue.severity === "ERROR")?.code ?? "OTHER";
      return {
        sourceRowNumber: row.sourceRowNumber,
        code: (IMPORT_BLOCKING_ISSUE_CODES as readonly string[]).includes(code)
          ? (code as ImportBlockingIssueCode)
          : "OTHER",
      };
    });
}

export function requiresTransferAccount(
  rows: readonly NormalizedImportRow[],
): boolean {
  return rows.some(
    (row) =>
      row.kind === "TRANSFER" && row.disposition !== "SKIP_EXACT_DUPLICATE",
  );
}

export function inferImportDateFormat(
  rows: readonly ParsedImportRow[],
  header: string | undefined,
  locale: string,
): ImportDateFormat {
  if (!header) return "AUTO";
  let dayFirst = 0;
  let monthFirst = 0;
  for (const row of rows) {
    const match = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}(?:\s|$)/.exec(
      row.values[header]?.trim() ?? "",
    );
    if (!match) continue;
    if (Number(match[1]) > 12) dayFirst += 1;
    else if (Number(match[2]) > 12) monthFirst += 1;
  }
  if (dayFirst && monthFirst) return "AUTO";
  if (dayFirst) return "DMY";
  if (monthFirst) return "MDY";
  return localeRegion(locale) === "US" ? "MDY" : "DMY";
}

function localeRegion(locale: string): string | undefined {
  try {
    return new Intl.Locale(locale).maximize().region;
  } catch {
    return undefined;
  }
}

export function activeImportAccounts(
  accounts: readonly LedgerAccountRecord[],
): LedgerAccountRecord[] {
  return accounts.filter((account) => !account.archivedAt);
}

export function defaultImportAccount(
  accounts: readonly LedgerAccountRecord[],
  preferredAccountId: string | null,
  workspaceCurrency: string,
): LedgerAccountRecord | null {
  const active = activeImportAccounts(accounts);
  return (
    active.find((account) => account.id === preferredAccountId) ??
    active.find((account) => account.currency === workspaceCurrency) ??
    active[0] ??
    null
  );
}

export function defaultImportCategory(
  categories: readonly LedgerCategoryRecord[],
  kind: "EXPENSE" | "INCOME",
): LedgerCategoryRecord | null {
  const ofKind = categories.filter((category) => category.kind === kind);
  return (
    ofKind.find(
      (category) => category.systemKey === `${kind.toLowerCase()}:other`,
    ) ??
    ofKind.find((category) => !category.parentCategoryId) ??
    null
  );
}

export function mappingFromConfirmedColumns(
  columnMapping: ImportColumnMapping,
  input: {
    rows: readonly ParsedImportRow[];
    locale: string;
    accountId: string;
    transferAccountId: string | null;
    defaultExpenseCategoryId: string;
    defaultIncomeCategoryId: string;
  },
): ImportMapping {
  const { columns } = columnMapping;
  const split = Boolean(columns.debit || columns.credit);
  return {
    columns,
    amountMode: split ? "DEBIT_CREDIT" : "SIGNED",
    signedAmountDirection: split ? null : "POSITIVE_IS_INCOME",
    dateFormat: inferImportDateFormat(
      input.rows,
      columns.transactionDate ?? columns.bookingDate,
      input.locale,
    ),
    decimalSeparator: "AUTO",
    accountId: input.accountId,
    transferAccountId: input.transferAccountId,
    fallbackCurrency: null,
    defaultExpenseCategoryId: input.defaultExpenseCategoryId,
    defaultIncomeCategoryId: input.defaultIncomeCategoryId,
  };
}
