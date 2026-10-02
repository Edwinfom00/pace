import type {
  LedgerAccountRecord,
  LedgerAccountType,
  LedgerCategoryRecord,
} from "@/modules/ledger/domain";

import type {
  ImportColumnMapping,
  ImportDateFormat,
  ImportField,
  ImportMapping,
  NormalizedImportRow,
  ParsedImportRow,
} from "./domain";
import { importAccountKey } from "./normalization";

export const IMPORT_BLOCKING_ISSUE_CODES = [
  "ACCOUNT_CURRENCY_MISMATCH",
  "ACCOUNT_UNASSIGNED",
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
  "TRANSFER_CURRENCY_MISMATCH",
  "TRANSFER_SAME_ACCOUNT",
  "OTHER",
] as const;
export type ImportBlockingIssueCode =
  (typeof IMPORT_BLOCKING_ISSUE_CODES)[number];

const ACCOUNT_RESOLVED_CODES: ReadonlySet<ImportBlockingIssueCode> = new Set([
  "ACCOUNT_UNASSIGNED",
  "TRANSFER_ACCOUNT_REQUIRED",
  "TRANSFER_CURRENCY_MISMATCH",
  "TRANSFER_SAME_ACCOUNT",
]);

export interface ImportReviewIssue {
  sourceRowNumber: number;
  code: ImportBlockingIssueCode;
  field: ImportField | null;
  value: string;
  description: string | null;
  resolvedByAccount: boolean;
}

export interface ImportReviewSummary {
  parsedRowCount: number;
  toImportRowCount: number;
  inboxRowCount: number;
  exactDuplicateRowCount: number;
  blockingErrorRowCount: number;
  skippedRowCount: number;
  currency: string | null;
  dateRange: { start: string; end: string } | null;
}

export type ImportFileAccountRole = "SOURCE" | "DESTINATION";

export interface ImportFileAccount {
  key: string;
  label: string;
  role: ImportFileAccountRole;
  rowCount: number;
  accountId: string | null;
  matchedByName: boolean;
  suggestion: { name: string; type: LedgerAccountType; currency: string };
}

const MAX_REVIEW_ISSUES = 50;

export function summarizeImportReview(
  rows: readonly NormalizedImportRow[],
  currency: string | null,
  skippedRowCount = 0,
): ImportReviewSummary {
  const accepted = rows.filter((row) => row.disposition === "ACCEPT");
  const dates = rows
    .filter((row) => row.disposition !== "INVALID")
    .map((row) => row.occurredAt)
    .filter(Boolean)
    .sort();
  return {
    parsedRowCount: rows.length + skippedRowCount,
    toImportRowCount: accepted.length,
    inboxRowCount: accepted.filter(isLikelyInboxHandoff).length,
    exactDuplicateRowCount: rows.filter(
      (row) => row.disposition === "SKIP_EXACT_DUPLICATE",
    ).length,
    blockingErrorRowCount: rows.filter((row) => row.disposition === "INVALID")
      .length,
    skippedRowCount,
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
  parsedRows: readonly ParsedImportRow[],
  columns: ImportMapping["columns"],
): ImportReviewIssue[] {
  const parsedByNumber = new Map(parsedRows.map((row) => [row.rowNumber, row]));
  const issues = rows
    .filter((row) => row.disposition === "INVALID")
    .map((row) => {
      const issue = row.issues.find((candidate) => candidate.severity === "ERROR");
      const code = issue && (IMPORT_BLOCKING_ISSUE_CODES as readonly string[]).includes(issue.code)
        ? (issue.code as ImportBlockingIssueCode)
        : "OTHER";
      const field = issue?.field && issue.field !== "row" ? editableField(issue.field, columns) : null;
      const header = field ? columns[field] : undefined;
      const parsed = parsedByNumber.get(row.sourceRowNumber);
      return {
        sourceRowNumber: row.sourceRowNumber,
        code,
        field: ACCOUNT_RESOLVED_CODES.has(code) ? null : field,
        value: header ? parsed?.values[header] ?? "" : "",
        description: row.description ?? row.merchantName,
        resolvedByAccount: ACCOUNT_RESOLVED_CODES.has(code),
      };
    });
  return issues.filter((issue) => !issue.resolvedByAccount).slice(0, MAX_REVIEW_ISSUES);
}

export function accountBlockedRowCount(rows: readonly NormalizedImportRow[]): number {
  return rows.filter((row) => {
    if (row.disposition !== "INVALID") return false;
    const code = row.issues.find((issue) => issue.severity === "ERROR")?.code;
    return Boolean(code && ACCOUNT_RESOLVED_CODES.has(code as ImportBlockingIssueCode));
  }).length;
}

function editableField(field: ImportField, columns: ImportMapping["columns"]): ImportField | null {
  if (columns[field]) return field;
  if (field === "transactionDate" && columns.bookingDate) return "bookingDate";
  if (field === "description" && columns.merchant) return "merchant";
  if (field === "debit" && columns.credit) return "credit";
  if (field === "amount" && columns.debit) return "debit";
  return null;
}

export function requiresTransferAccount(
  rows: readonly NormalizedImportRow[],
): boolean {
  return rows.some(
    (row) =>
      row.kind === "TRANSFER" &&
      row.disposition !== "SKIP_EXACT_DUPLICATE" &&
      !row.transferAccountReference,
  );
}

export function fileAccountLabels(
  rows: readonly ParsedImportRow[],
  header: string | undefined,
): { key: string; label: string }[] {
  if (!header) return [];
  const labels = new Map<string, string>();
  for (const row of rows) {
    const label = row.values[header]?.trim().replaceAll(/\s+/g, " ");
    if (!label) continue;
    const key = importAccountKey(label);
    if (key && !labels.has(key)) labels.set(key, label.slice(0, 120));
  }
  return [...labels].map(([key, label]) => ({ key, label }));
}

export function resolveAccountAssignments(
  labels: readonly { key: string }[],
  accounts: readonly LedgerAccountRecord[],
  current: Readonly<Record<string, string>> | undefined,
  requested: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const active = activeImportAccounts(accounts);
  const activeIds = new Set(active.map((account) => account.id));
  const byName = new Map(active.map((account) => [importAccountKey(account.name), account.id]));
  const assignments: Record<string, string> = {};
  for (const { key } of labels) {
    const chosen = requested?.[key] ?? current?.[key];
    const accountId = chosen && activeIds.has(chosen) ? chosen : byName.get(key);
    if (accountId) assignments[key] = accountId;
  }
  return assignments;
}

export function buildFileAccounts(input: {
  role: ImportFileAccountRole;
  labels: readonly { key: string; label: string }[];
  stagedRows: readonly NormalizedImportRow[];
  parsedRows: readonly ParsedImportRow[];
  columns: ImportMapping["columns"];
  assignments: Readonly<Record<string, string>> | undefined;
  accounts: readonly LedgerAccountRecord[];
  fallbackCurrency: string;
}): ImportFileAccount[] {
  const { role, columns } = input;
  const labelHeader = role === "SOURCE" ? columns.accountReference : columns.transferAccount;
  const counts = new Map<string, number>();
  for (const row of input.stagedRows) {
    if (role === "DESTINATION" && row.kind !== "TRANSFER") continue;
    const reference = role === "SOURCE" ? row.accountReference : row.transferAccountReference;
    if (!reference) continue;
    const key = importAccountKey(reference);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const accountsById = new Map(input.accounts.map((account) => [account.id, account]));
  return input.labels
    .filter(({ key }) => counts.has(key))
    .map(({ key, label }) => {
      const accountId = input.assignments?.[key] ?? null;
      const account = accountId ? accountsById.get(accountId) : undefined;
      return {
        key,
        label,
        role,
        rowCount: counts.get(key) ?? 0,
        accountId,
        matchedByName: Boolean(account && importAccountKey(account.name) === key),
        suggestion: {
          name: label,
          type: suggestAccountType(label),
          currency: suggestAccountCurrency(input.parsedRows, labelHeader, key, columns.currency, input.fallbackCurrency),
        },
      };
    });
}

export function suggestAccountType(label: string): LedgerAccountType {
  const key = importAccountKey(label);
  if (/\b(mobile money|momo|orange money|mtn|wave|m pesa|mpesa|airtel|moov|free money)\b/.test(key)) return "MOBILE_MONEY";
  if (/\b(epargne|savings?|spar\w*|ahorro|livret|tagesgeld)\b/.test(key)) return "SAVINGS";
  if (/\b(cash|especes|bargeld|caisse|efectivo|liquide)\b/.test(key)) return "CASH";
  if (/\b(card|carte|karte|visa|mastercard|amex|kreditkarte)\b/.test(key)) return "CREDIT_CARD";
  return "CHECKING";
}

function suggestAccountCurrency(
  rows: readonly ParsedImportRow[],
  labelHeader: string | undefined,
  key: string,
  currencyHeader: string | undefined,
  fallback: string,
): string {
  if (!labelHeader || !currencyHeader) return fallback;
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (importAccountKey(row.values[labelHeader] ?? "") !== key) continue;
    const currency = row.values[currencyHeader]?.trim().toUpperCase();
    if (currency && /^[A-Z]{3}$/.test(currency)) counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback;
}

export function applyRowCorrections(
  rows: readonly ParsedImportRow[],
  columns: ImportMapping["columns"],
  corrections: readonly { sourceRowNumber: number; field: ImportField; value: string }[],
): { rows: ParsedImportRow[]; applied: { sourceRowNumber: number; field: ImportField }[] } | null {
  const byRow = new Map<number, Record<string, string>>();
  const applied: { sourceRowNumber: number; field: ImportField }[] = [];
  for (const correction of corrections) {
    const header = columns[correction.field];
    if (!header || !rows.some((row) => row.rowNumber === correction.sourceRowNumber)) return null;
    byRow.set(correction.sourceRowNumber, { ...byRow.get(correction.sourceRowNumber), [header]: correction.value.trim() });
    applied.push({ sourceRowNumber: correction.sourceRowNumber, field: correction.field });
  }
  return {
    rows: rows.map((row) => {
      const patch = byRow.get(row.rowNumber);
      return patch ? { ...row, values: { ...row.values, ...patch } } : row;
    }),
    applied,
  };
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
    accountAssignments?: Record<string, string>;
    transferAccountAssignments?: Record<string, string>;
    skippedRowNumbers?: number[];
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
    ...(input.accountAssignments ? { accountAssignments: input.accountAssignments } : {}),
    ...(input.transferAccountAssignments ? { transferAccountAssignments: input.transferAccountAssignments } : {}),
    ...(input.skippedRowNumbers?.length ? { skippedRowNumbers: input.skippedRowNumbers } : {}),
  };
}
