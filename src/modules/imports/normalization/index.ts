import { createHash } from "node:crypto";

import { getCurrencyExponent, toCurrencyCode } from "@/money/currency";
import { parseOccurredAt } from "@/modules/agent-actions/transaction-draft";
import { normalizeMerchantName } from "@/modules/ledger/domain";

import type {
  ImportIssue,
  ImportMapping,
  ImportTransactionKind,
  NormalizedImportRow,
  ParsedImportRow,
} from "../domain";

const MAX_MINOR = 9_223_372_036_854_775_807n;
const TRANSFER_TERMS = /\b(transfer|internal transfer|virement|uberweisung|überweisung|traspaso)\b/i;
const DEBIT_TERMS = /\b(debit|debit card|withdrawal|charge|outflow|soll|belastung|debito|débito)\b/i;
const CREDIT_TERMS = /\b(credit|deposit|inflow|haben|gutschrift|credito|crédito)\b/i;

export interface NormalizationContext {
  workspaceId: string;
  fallbackCurrency: string | null;
  timezone: string;
}

export function normalizeImportRows(
  rows: readonly ParsedImportRow[],
  mapping: ImportMapping,
  context: NormalizationContext,
): NormalizedImportRow[] {
  return rows.map((row) => normalizeImportRow(row, mapping, context));
}

export function normalizeImportRow(
  row: ParsedImportRow,
  mapping: ImportMapping,
  context: NormalizationContext,
): NormalizedImportRow {
  const issues: ImportIssue[] = [];
  const value = (field: keyof ImportMapping["columns"]) => {
    const header = mapping.columns[field];
    return header ? row.values[header]?.trim() ?? "" : "";
  };

  const dateText = value("transactionDate") || value("bookingDate");
  const occurredAt = parseStatementDate(dateText, mapping.dateFormat, context.timezone, issues);
  const bookingAt = value("bookingDate")
    ? parseStatementDate(value("bookingDate"), mapping.dateFormat, context.timezone, [])
    : null;
  const description = cleanText(value("description"), 1_000, "description", issues);
  const merchantName = cleanText(value("merchant") || description || value("accountReference"), 160, "merchant", issues);
  const accountReference = cleanText(value("accountReference"), 180, "account reference", issues);
  const currency = resolveCurrency(value("currency"), mapping.fallbackCurrency ?? context.fallbackCurrency, issues);
  if (currency && context.fallbackCurrency && currency !== context.fallbackCurrency) {
    issues.push({
      code: "ACCOUNT_CURRENCY_MISMATCH",
      message: "The row currency does not match the selected Pace account. Pace does not convert currencies during import.",
      severity: "ERROR",
      field: "currency",
    });
  }
  const amount = parseAmountForRow(row, mapping, currency, issues);
  const typeText = value("transactionType");
  const kind = determineKind(amount, typeText, mapping, issues);
  const transferCandidate = kind === "TRANSFER" || TRANSFER_TERMS.test(`${description ?? ""} ${merchantName ?? ""}`);

  if (kind === "TRANSFER" && !mapping.transferAccountId) {
    issues.push({
      code: "TRANSFER_ACCOUNT_REQUIRED",
      message: "A destination Pace account is required for an identified transfer.",
      severity: "ERROR",
      field: "transactionType",
    });
  }
  if (kind === "TRANSFER" && mapping.transferAccountId === mapping.accountId) {
    issues.push({
      code: "TRANSFER_SAME_ACCOUNT",
      message: "A transfer must use a different destination account.",
      severity: "ERROR",
      field: "transactionType",
    });
  }
  if (!description && !merchantName) {
    issues.push({ code: "MISSING_DESCRIPTION", message: "A description or merchant is required.", severity: "ERROR", field: "description" });
  }

  const amountMinor = amount ? amount.minor.toString() : "0";
  const fingerprint = occurredAt && amount && currency
    ? importTransactionFingerprint({
        workspaceId: context.workspaceId,
        accountId: mapping.accountId,
        occurredAt,
        amountMinor,
        currency,
        kind,
        description: description ?? merchantName ?? "",
      })
    : `invalid:${row.rowNumber}`;
  const hasErrors = issues.some((issue) => issue.severity === "ERROR");

  return {
    sourceRowNumber: row.rowNumber,
    occurredAt: occurredAt ?? "",
    bookingAt,
    description,
    merchantName,
    accountReference,
    kind,
    amountMinor,
    currency: currency ?? "",
    fingerprint,
    duplicateStatus: "NONE",
    disposition: hasErrors ? "INVALID" : "ACCEPT",
    issues,
    transferCandidate,
  };
}

function parseStatementDate(
  value: string,
  format: ImportMapping["dateFormat"],
  timezone: string,
  issues: ImportIssue[],
): string | null {
  const source = value.trim();
  if (!source) {
    issues.push({ code: "MISSING_DATE", message: "A transaction date is required.", severity: "ERROR", field: "transactionDate" });
    return null;
  }
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s|T|$)/.exec(source);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : parseDayFirstOrMonthFirst(source, format, issues);
  if (!parts) return null;
  const dateKey = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const occurredAt = parseOccurredAt(dateKey, timezone, new Date());
  if (!occurredAt) {
    issues.push({ code: "INVALID_DATE", message: "The transaction date is invalid.", severity: "ERROR", field: "transactionDate" });
    return null;
  }
  const check = new Date(`${dateKey}T12:00:00.000Z`);
  if (check.getUTCFullYear() !== parts.year || check.getUTCMonth() + 1 !== parts.month || check.getUTCDate() !== parts.day) {
    issues.push({ code: "INVALID_DATE", message: "The transaction date is invalid.", severity: "ERROR", field: "transactionDate" });
    return null;
  }
  return occurredAt;
}

function parseDayFirstOrMonthFirst(
  source: string,
  format: ImportMapping["dateFormat"],
  issues: ImportIssue[],
): { year: number; month: number; day: number } | null {
  const match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s|$)/.exec(source);
  if (!match) {
    issues.push({ code: "INVALID_DATE", message: "The transaction date format is not supported.", severity: "ERROR", field: "transactionDate" });
    return null;
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const inferred = first > 12 ? "DMY" : second > 12 ? "MDY" : null;
  const selected = format === "AUTO" ? inferred : format;
  if (!selected || selected === "YMD") {
    issues.push({
      code: "AMBIGUOUS_DATE",
      message: "Choose a day/month or month/day date format for ambiguous dates.",
      severity: "ERROR",
      field: "transactionDate",
    });
    return null;
  }
  return selected === "DMY" ? { year, month: second, day: first } : { year, month: first, day: second };
}

function resolveCurrency(value: string, fallback: string | null, issues: ImportIssue[]): string | null {
  const candidate = (value || fallback || "").trim().toUpperCase();
  if (!candidate) {
    issues.push({ code: "MISSING_CURRENCY", message: "No row currency or deterministic fallback is available.", severity: "ERROR", field: "currency" });
    return null;
  }
  try {
    return toCurrencyCode(candidate);
  } catch {
    issues.push({ code: "INVALID_CURRENCY", message: "The row currency must be a valid ISO-4217 code.", severity: "ERROR", field: "currency" });
    return null;
  }
}

function parseAmountForRow(
  row: ParsedImportRow,
  mapping: ImportMapping,
  currency: string | null,
  issues: ImportIssue[],
): { minor: bigint; sign: -1 | 1 } | null {
  if (!currency) return null;
  const value = (field: "amount" | "debit" | "credit") => {
    const header = mapping.columns[field];
    return header ? row.values[header]?.trim() ?? "" : "";
  };
  if (mapping.amountMode === "SIGNED") {
    const parsed = parseLocalizedNumber(value("amount"), currency, mapping.decimalSeparator);
    if (!parsed) {
      issues.push({ code: "INVALID_AMOUNT", message: "The signed amount could not be parsed.", severity: "ERROR", field: "amount" });
      return null;
    }
    return parsed;
  }

  const debit = value("debit") ? parseLocalizedNumber(value("debit"), currency, mapping.decimalSeparator) : null;
  const credit = value("credit") ? parseLocalizedNumber(value("credit"), currency, mapping.decimalSeparator) : null;
  if (value("debit") && !debit || value("credit") && !credit) {
    issues.push({ code: "INVALID_AMOUNT", message: "The debit or credit amount could not be parsed.", severity: "ERROR", field: "debit" });
    return null;
  }
  if (debit && credit) {
    issues.push({ code: "BOTH_DEBIT_AND_CREDIT", message: "A row cannot contain both a debit and a credit amount.", severity: "ERROR", field: "debit" });
    return null;
  }
  if (!debit && !credit) {
    issues.push({ code: "MISSING_AMOUNT", message: "A debit or credit amount is required.", severity: "ERROR", field: "debit" });
    return null;
  }
  const chosen = debit ?? credit;
  if (!chosen) return null;
  return { minor: chosen.minor, sign: debit ? -1 : 1 };
}

function determineKind(
  amount: { minor: bigint; sign: -1 | 1 } | null,
  typeText: string,
  mapping: ImportMapping,
  issues: ImportIssue[],
): ImportTransactionKind {
  if (TRANSFER_TERMS.test(typeText)) return "TRANSFER";
  if (DEBIT_TERMS.test(typeText)) return "EXPENSE";
  if (CREDIT_TERMS.test(typeText)) return "INCOME";
  if (!amount) return "EXPENSE";
  if (mapping.amountMode === "DEBIT_CREDIT") return amount.sign < 0 ? "EXPENSE" : "INCOME";
  if (!mapping.signedAmountDirection) {
    issues.push({ code: "SIGNED_DIRECTION_REQUIRED", message: "Choose the signed amount convention before importing.", severity: "ERROR", field: "amount" });
    return "EXPENSE";
  }
  const positiveIsIncome = mapping.signedAmountDirection === "POSITIVE_IS_INCOME";
  return (amount.sign > 0) === positiveIsIncome ? "INCOME" : "EXPENSE";
}

export function parseLocalizedNumber(
  source: string,
  currency: string,
  decimalSeparator: ImportMapping["decimalSeparator"],
): { minor: bigint; sign: -1 | 1 } | null {
  const normalized = source.normalize("NFKC").trim();
  if (!normalized) return null;
  const negative = /^\s*\(/.test(normalized) || /^\s*-/.test(normalized);
  const compact = normalized
    .replace(/[()]/g, "")
    .replace(/[+\-]/g, "")
    .replace(/[\s\u00A0\u202F']/g, "")
    .replace(/[^0-9.,]/g, "");
  if (!compact || !/[0-9]/.test(compact)) return null;

  const exponent = getCurrencyExponent(currency);
  const separator = resolveDecimalSeparator(compact, decimalSeparator, exponent);
  let whole = compact;
  let fraction = "";
  if (separator) {
    const splitAt = compact.lastIndexOf(separator);
    whole = compact.slice(0, splitAt);
    fraction = compact.slice(splitAt + 1);
    if (!fraction || /[.,]/.test(fraction)) return null;
  }
  whole = whole.replace(/[.,]/g, "");
  if (!/^\d+$/.test(whole) || (fraction && !/^\d+$/.test(fraction))) return null;
  if (fraction.length > exponent && /[1-9]/.test(fraction.slice(exponent))) return null;
  const minor = BigInt(whole) * 10n ** BigInt(exponent) + BigInt((fraction + "0".repeat(exponent)).slice(0, exponent) || "0");
  if (minor <= 0n || minor > MAX_MINOR) return null;
  return { minor, sign: negative ? -1 : 1 };
}

function resolveDecimalSeparator(value: string, preference: ImportMapping["decimalSeparator"], exponent: number): "." | "," | null {
  if (preference !== "AUTO") return value.includes(preference) ? preference : null;
  const lastDot = value.lastIndexOf(".");
  const lastComma = value.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) return lastDot > lastComma ? "." : ",";
  const separator = lastDot >= 0 ? "." : lastComma >= 0 ? "," : null;
  if (!separator) return null;
  const fractionLength = value.length - value.lastIndexOf(separator) - 1;
  return fractionLength > 0 && fractionLength <= exponent ? separator : null;
}

function cleanText(value: string, maxLength: number, label: string, issues: ImportIssue[]): string | null {
  const cleaned = value.normalize("NFKC").trim().replaceAll(/\s+/g, " ");
  if (!cleaned) return null;
  if (cleaned.length > maxLength) {
    issues.push({ code: "TEXT_TOO_LONG", message: `The ${label} is too long.`, severity: "ERROR", field: "row" });
    return null;
  }
  return cleaned;
}

export function importTransactionFingerprint(input: {
  workspaceId: string;
  accountId: string;
  occurredAt: string;
  amountMinor: string;
  currency: string;
  kind: ImportTransactionKind;
  description: string;
}): string {
  const description = normalizeMerchantName(input.description);
  return createHash("sha256")
    .update([
      "pace-import-v1",
      input.workspaceId,
      input.accountId,
      input.occurredAt.slice(0, 10),
      input.amountMinor,
      input.currency,
      input.kind,
      description,
    ].join("|"))
    .digest("hex");
}
