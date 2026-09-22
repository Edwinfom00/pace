import { getCurrencyExponent, type CurrencyCode } from "@/money/currency";
import { money, parseDecimalMoney, toDecimalString } from "@/money/money";

import {
  recurringFrequencyOptions,
  type RecurringCreateAccountOption,
  type RecurringCreateCategoryOption,
} from "./recurring-create-flow";

export type RecurringEditDraft = {
  readonly amount: string;
  readonly accountId: string;
  readonly cadenceDays: number;
  readonly categoryId: string;
  readonly name: string;
  readonly nextOccurrence: string;
};

export type RecurringEditField =
  | "amount"
  | "account"
  | "cadenceDays"
  | "category"
  | "name"
  | "nextOccurrence";

export type RecurringEditErrors = Partial<Record<RecurringEditField, true>>;

export type RecurringEditSource = {
  readonly amountMinor: string;
  readonly accountId: string | null;
  readonly cadenceDays: number;
  readonly categoryId: string | null;
  readonly currency: CurrencyCode;
  readonly name: string;
  readonly nextOccurrenceAt: string | null;
};

export type RecurringEditPatch = {
  amountMinor?: string;
  accountId?: string | null;
  cadenceDays?: number;
  categoryId?: string | null;
  name?: string;
  nextOccurrenceAt?: string;
};

export function createRecurringEditDraft(source: RecurringEditSource): RecurringEditDraft {
  return {
    amount: toDecimalString(money(source.currency, BigInt(source.amountMinor))),
    accountId: source.accountId ?? "",
    cadenceDays: source.cadenceDays,
    categoryId: source.categoryId ?? "",
    name: source.name,
    nextOccurrence: dateInputValue(source.nextOccurrenceAt),
  };
}

export function createRecurringEditPatch(
  source: RecurringEditSource,
  draft: RecurringEditDraft,
): RecurringEditPatch {
  const patch: RecurringEditPatch = {};
  const amount = parseRecurringEditAmount(draft.amount, source.currency);
  if (amount && amount.minor !== BigInt(source.amountMinor)) {
    patch.amountMinor = amount.minor.toString();
  }

  const name = normalizeName(draft.name);
  if (name !== normalizeName(source.name)) patch.name = name;
  if (draft.cadenceDays !== source.cadenceDays) patch.cadenceDays = draft.cadenceDays;
  if (draft.accountId !== (source.accountId ?? "")) patch.accountId = draft.accountId || null;
  if (draft.categoryId !== (source.categoryId ?? "")) patch.categoryId = draft.categoryId || null;
  if (draft.nextOccurrence !== dateInputValue(source.nextOccurrenceAt)) {
    patch.nextOccurrenceAt = `${draft.nextOccurrence}T00:00:00.000Z`;
  }
  return patch;
}

export function validateRecurringEditDraft(
  source: RecurringEditSource,
  draft: RecurringEditDraft,
  accounts: readonly RecurringCreateAccountOption[],
  categories: readonly RecurringCreateCategoryOption[],
  direction: "EXPENSE" | "INCOME",
): RecurringEditErrors {
  const errors: RecurringEditErrors = {};
  const patch = createRecurringEditPatch(source, draft);

  if (patch.name !== undefined) {
    if (!patch.name || patch.name.length > 160) errors.name = true;
  }

  const amount = parseRecurringEditAmount(draft.amount, source.currency);
  if (!amount || amount.minor <= 0n) errors.amount = true;

  if (
    patch.cadenceDays !== undefined
    && !recurringFrequencyOptions.some((option) => option.cadenceDays === patch.cadenceDays)
  ) {
    errors.cadenceDays = true;
  }

  if (patch.nextOccurrenceAt !== undefined && !isCalendarDate(draft.nextOccurrence)) {
    errors.nextOccurrence = true;
  }

  if (patch.accountId !== undefined) {
    if (!patch.accountId || !accounts.some((account) =>
      account.id === patch.accountId && account.currency === source.currency,
    )) {
      errors.account = true;
    }
  }

  if (patch.categoryId !== undefined && patch.categoryId !== null) {
    if (!categories.some((category) => category.id === patch.categoryId && category.kind === direction)) {
      errors.category = true;
    }
  }

  return errors;
}

export function hasRecurringEditChanges(
  source: RecurringEditSource,
  draft: RecurringEditDraft,
): boolean {
  return Object.keys(createRecurringEditPatch(source, draft)).length > 0;
}

export function parseRecurringEditAmount(value: string, currency: CurrencyCode) {
  return parseDecimalMoney(normalizeMoneyInput(value, currency), currency);
}

export function mapRecurringEditFailure(code: string | undefined): {
  readonly field?: RecurringEditField;
  readonly form?: "conflict" | "currency" | "notAllowed" | "failed";
} {
  switch (code) {
    case "INVALID_RECURRING_NAME":
      return { field: "name" };
    case "INVALID_RECURRING_AMOUNT":
    case "INVALID_RECURRING_CURRENCY":
      return { field: "amount" };
    case "INVALID_RECURRING_FREQUENCY":
      return { field: "cadenceDays" };
    case "INVALID_NEXT_OCCURRENCE":
      return { field: "nextOccurrence" };
    case "ACCOUNT_NOT_FOUND":
    case "ACCOUNT_UNAVAILABLE":
      return { field: "account" };
    case "CATEGORY_NOT_FOUND":
    case "INVALID_RECURRING_CATEGORY":
      return { field: "category" };
    case "CURRENCY_MISMATCH":
      return { field: "account", form: "currency" };
    case "CONCURRENT_MODIFICATION":
    case "RECURRING_NOT_CURRENT":
      return { form: "conflict" };
    case "RECURRING_EDIT_NOT_ALLOWED":
    case "RECURRING_ACTION_NOT_ALLOWED":
      return { form: "notAllowed" };
    default:
      return { form: "failed" };
  }
}

function dateInputValue(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().replaceAll(/\s+/g, " ");
}

function normalizeMoneyInput(value: string, currency: CurrencyCode): string {
  const compact = value.normalize("NFKC").trim().replaceAll(/[\s\u00a0\u202f]/g, "");
  const exponent = getCurrencyExponent(currency);
  const comma = compact.lastIndexOf(",");
  const dot = compact.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    return compact.replaceAll(grouping, "").replace(decimal, ".");
  }
  const separator = comma >= 0 ? "," : dot >= 0 ? "." : null;
  if (!separator) return compact;
  const fractionLength = compact.length - compact.lastIndexOf(separator) - 1;
  if (exponent > 0 && fractionLength > 0 && fractionLength <= exponent) {
    return separator === "," ? compact.replace(",", ".") : compact;
  }
  return compact.replaceAll(separator, "");
}
