import { getCurrencyExponent, toCurrencyCode } from "@/money/currency";
import type { LedgerAccountRecord, LedgerCategoryRecord } from "@/modules/ledger/domain";

import type {
  TransactionDraft,
  TransactionDraftField,
  TransactionDraftKind,
} from "./domain";

export interface TransactionDraftIntent {
  kind: TransactionDraftKind;
  amountText?: string | null;
  occurredAtText?: string | null;
  accountHint?: string | null;
  transferAccountHint?: string | null;
  categoryHint?: string | null;
  merchantName?: string | null;
  note?: string | null;
  sourceText?: string | null;
}

export interface TransactionDraftContext {
  currency: string;
  timezone: string;
  accounts: readonly LedgerAccountRecord[];
  categories: readonly LedgerCategoryRecord[];
  now?: Date;
}

const TRANSPORT_TERMS = /\b(taxi|uber|bolt|yango|transport|bus|train)\b/i;
const SALARY_TERMS = /\b(salary|payroll|wage|income)\b/i;

/**
 * Converts natural-language extraction into a deterministic, JSON-safe draft.
 * This is intentionally the only place text amounts become minor units: the
 * model supplies text, while application code performs the exact conversion.
 */
export function buildTransactionDraft(
  intent: TransactionDraftIntent,
  context: TransactionDraftContext,
): TransactionDraft {
  const kind = intent.kind;
  const amountText = cleanOptionalText(intent.amountText);
  const accountId = matchAccount(intent.accountHint, context.accounts);
  const transferAccountId =
    kind === "TRANSFER" ? matchAccount(intent.transferAccountHint, context.accounts) : null;
  const categoryId = kind === "TRANSFER" ? null : resolveCategory(intent, context.categories);
  // A missing date means today in the workspace timezone. This is a server
  // default, not a model inference or a browser-local timestamp.
  const occurredAt = parseOccurredAt(intent.occurredAtText ?? "today", context.timezone, context.now ?? new Date());
  const amountMinor = amountText ? parseAmountToMinor(amountText, context.currency) : null;

  return {
    kind,
    amountMinor,
    currency: toCurrencyCode(context.currency),
    occurredAt,
    accountId,
    transferAccountId,
    categoryId,
    merchantName: cleanOptionalText(intent.merchantName),
    note: cleanOptionalText(intent.note),
    amountText,
    sourceText: cleanOptionalText(intent.sourceText),
    missingFields: determineMissingFields({
      kind,
      amountMinor,
      occurredAt,
      accountId,
      transferAccountId,
      categoryId,
    }),
  };
}

export function parseAmountToMinor(amountText: string, currency: string): string | null {
  const normalized = amountText
    .normalize("NFKC")
    .trim()
    .replaceAll(/\s+/g, "")
    .replaceAll(/(?<=\d),(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const match = /^(\d+)(?:\.(\d+))?([kKmM])?$/.exec(normalized);
  if (!match) return null;

  const whole = BigInt(match[1] ?? "0");
  const fraction = match[2] ?? "";
  const suffix = (match[3] ?? "").toLowerCase();
  const multiplier = suffix === "m" ? 1_000_000n : suffix === "k" ? 1_000n : 1n;
  const fractionScale = 10n ** BigInt(fraction.length);
  const decimalNumerator = whole * fractionScale + BigInt(fraction || "0");
  const currencyScale = 10n ** BigInt(getCurrencyExponent(currency));
  const numerator = decimalNumerator * multiplier * currencyScale;

  if (numerator % fractionScale !== 0n) return null;
  const minor = numerator / fractionScale;
  return minor > 0n && minor <= 9_223_372_036_854_775_807n ? minor.toString() : null;
}

export function parseOccurredAt(
  value: string | null | undefined,
  timezone: string,
  now: Date,
): string | null {
  const normalized = cleanOptionalText(value)?.toLowerCase();
  if (!normalized) return null;

  if (normalized === "today") {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const field = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value;
    const year = field("year");
    const month = field("month");
    const day = field("day");
    return year && month && day ? new Date(`${year}-${month}-${day}T12:00:00.000Z`).toISOString() : null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function resolveCategory(
  intent: TransactionDraftIntent,
  categories: readonly LedgerCategoryRecord[],
): string | null {
  const expectedKind = intent.kind;
  const eligible = categories.filter((category) => category.kind === expectedKind);
  const explicit = matchByName(intent.categoryHint, eligible);
  if (explicit) return explicit.id;

  const source = `${intent.sourceText ?? ""} ${intent.merchantName ?? ""} ${intent.note ?? ""}`;
  if (expectedKind === "EXPENSE" && isBareExpenseCommand(source)) {
    return null;
  }
  const systemKey =
    expectedKind === "EXPENSE"
      ? TRANSPORT_TERMS.test(source)
        ? "expense:transport"
        : "expense:other"
      : SALARY_TERMS.test(source)
        ? "income:salary"
        : "income:other";
  return eligible.find((category) => category.systemKey === systemKey)?.id ?? null;
}

function isBareExpenseCommand(value: string): boolean {
  return /^\s*(?:expense|spent|spend)?\s*\d+(?:[.,]\d+)?(?:[kKmM])?\s*$/i.test(value);
}

function matchAccount(
  hint: string | null | undefined,
  accounts: readonly LedgerAccountRecord[],
): string | null {
  const explicit = matchByName(hint, accounts);
  if (explicit) return explicit.id;
  return !cleanOptionalText(hint) && accounts.length === 1 ? accounts[0]?.id ?? null : null;
}

function matchByName<T extends { id: string; name: string }>(
  hint: string | null | undefined,
  records: readonly T[],
): T | null {
  const normalizedHint = normalizeName(hint);
  if (!normalizedHint) return null;
  const exact = records.filter((record) => normalizeName(record.name) === normalizedHint);
  if (exact.length === 1) return exact[0] ?? null;
  const partial = records.filter((record) => normalizeName(record.name).includes(normalizedHint));
  return partial.length === 1 ? partial[0] ?? null : null;
}

function determineMissingFields(input: {
  kind: TransactionDraftKind;
  amountMinor: string | null;
  occurredAt: string | null;
  accountId: string | null;
  transferAccountId: string | null;
  categoryId: string | null;
}): readonly TransactionDraftField[] {
  const fields: TransactionDraftField[] = [];
  if (!input.amountMinor) fields.push("amount");
  if (!input.occurredAt) fields.push("date");
  if (!input.accountId) fields.push("account");
  if (input.kind === "TRANSFER") {
    if (!input.transferAccountId || input.transferAccountId === input.accountId) {
      fields.push("destinationAccount");
    }
  } else if (!input.categoryId) {
    fields.push("category");
  }
  return fields;
}

function cleanOptionalText(value: string | null | undefined): string | null {
  const cleaned = value?.normalize("NFKC").trim().replaceAll(/\s+/g, " ");
  return cleaned ? cleaned : null;
}

function normalizeName(value: string | null | undefined): string {
  return cleanOptionalText(value)?.toLocaleLowerCase("en-US") ?? "";
}
