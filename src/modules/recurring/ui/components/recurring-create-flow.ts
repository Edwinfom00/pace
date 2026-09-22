import { z } from "zod";

import type { CurrencyCode } from "@/money/currency";
import { parseDecimalMoney } from "@/money/money";

export const recurringCreateDirections = ["EXPENSE", "INCOME"] as const;
export type RecurringCreateDirection = (typeof recurringCreateDirections)[number];

export const recurringFrequencyOptions = [
  { cadenceDays: 7, key: "weekly" },
  { cadenceDays: 14, key: "biweekly" },
  { cadenceDays: 30, key: "monthly" },
  { cadenceDays: 90, key: "quarterly" },
  { cadenceDays: 365, key: "yearly" },
] as const;

export type RecurringCreateFrequencyKey = (typeof recurringFrequencyOptions)[number]["key"];
export type RecurringCreateField = "amount" | "name" | "merchantOrSource" | "frequency" | "nextOccurrence" | "account" | "category";
export type RecurringCreateErrorCode =
  | "nameRequired"
  | "nameTooLong"
  | "amountRequired"
  | "amountInvalid"
  | "amountPositive"
  | "frequency"
  | "nextOccurrence"
  | "accountRequired"
  | "accountUnavailable"
  | "categoryUnavailable"
  | "identityTooLong";

export type RecurringCreateErrors = Partial<Record<RecurringCreateField, RecurringCreateErrorCode>>;

export type RecurringCreateAccountOption = {
  readonly id: string;
  readonly name: string;
  readonly currency: CurrencyCode;
  readonly availableBalanceMinor?: string;
};

export type RecurringCreateCategoryOption = {
  readonly id: string;
  readonly name: string;
  readonly kind: RecurringCreateDirection;
  readonly systemKey: string | null;
};

export type RecurringCreateDraft = {
  readonly direction: RecurringCreateDirection;
  readonly amount: string;
  readonly name: string;
  readonly merchantOrSource: string;
  readonly cadenceDays: number;
  readonly nextOccurrence: string;
  readonly accountId: string;
  readonly categoryId: string;
};

const baseDraftSchema = z.object({
  direction: z.enum(recurringCreateDirections),
  amount: z.string(),
  name: z.string(),
  merchantOrSource: z.string(),
  cadenceDays: z.number().int().min(7).max(400),
  nextOccurrence: z.string(),
  accountId: z.string(),
  categoryId: z.string(),
});

export function createRecurringDraft(nextOccurrence: string): RecurringCreateDraft {
  return {
    direction: "EXPENSE",
    amount: "",
    name: "",
    merchantOrSource: "",
    cadenceDays: 30,
    nextOccurrence,
    accountId: "",
    categoryId: "",
  };
}

export function compatibleRecurringCategories(
  categories: readonly RecurringCreateCategoryOption[],
  direction: RecurringCreateDirection,
): readonly RecurringCreateCategoryOption[] {
  return categories.filter((category) => category.kind === direction);
}

export function validateRecurringDraft(
  draft: RecurringCreateDraft,
  accounts: readonly RecurringCreateAccountOption[],
  categories: readonly RecurringCreateCategoryOption[],
): { readonly isValid: true; readonly amountMinor: string; readonly currency: CurrencyCode } | { readonly isValid: false; readonly errors: RecurringCreateErrors } {
  const parsed = baseDraftSchema.safeParse(draft);
  const errors: RecurringCreateErrors = {};

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "cadenceDays") errors.frequency ??= "frequency";
    }
  }

  const name = draft.name.normalize("NFKC").trim();
  if (!name) errors.name = "nameRequired";
  else if (name.length > 160) errors.name = "nameTooLong";

  const account = accounts.find((option) => option.id === draft.accountId);
  if (!draft.accountId.trim()) errors.account = "accountRequired";
  else if (!account) errors.account = "accountUnavailable";

  const amount = draft.amount.normalize("NFKC").trim();
  if (!amount) errors.amount = "amountRequired";
  else if (/^[+]?0+(?:\.0+)?$/.test(amount)) errors.amount = "amountPositive";
  else if (account) {
    const money = parseDecimalMoney(amount, account.currency);
    if (!money) errors.amount = "amountInvalid";
    else if (money.minor <= 0n) errors.amount = "amountPositive";
  }

  if (!recurringFrequencyOptions.some((option) => option.cadenceDays === draft.cadenceDays)) {
    errors.frequency = "frequency";
  }

  if (!isCalendarDate(draft.nextOccurrence)) errors.nextOccurrence = "nextOccurrence";
  if (draft.merchantOrSource.trim().length > 160) errors.merchantOrSource = "identityTooLong";

  if (draft.categoryId) {
    const category = compatibleRecurringCategories(categories, draft.direction)
      .find((option) => option.id === draft.categoryId);
    if (!category) errors.category = "categoryUnavailable";
  }

  if (Object.keys(errors).length > 0 || !account) return { isValid: false, errors };
  const money = parseDecimalMoney(amount, account.currency);
  if (!money || money.minor <= 0n) return { isValid: false, errors: { amount: "amountInvalid" } };

  return { isValid: true, amountMinor: money.minor.toString(), currency: account.currency };
}

export function firstInvalidRecurringField(errors: RecurringCreateErrors): RecurringCreateField | null {
  return (["amount", "name", "merchantOrSource", "frequency", "nextOccurrence", "account", "category"] as const)
    .find((field) => Boolean(errors[field])) ?? null;
}

export function mapRecurringCreateFailure(code: string | undefined): RecurringCreateField | null {
  switch (code) {
    case "INVALID_RECURRING_NAME": return "name";
    case "INVALID_RECURRING_AMOUNT":
    case "INVALID_RECURRING_CURRENCY":
    case "CURRENCY_MISMATCH": return "amount";
    case "INVALID_RECURRING_FREQUENCY": return "frequency";
    case "INVALID_NEXT_OCCURRENCE": return "nextOccurrence";
    case "ACCOUNT_NOT_FOUND":
    case "ACCOUNT_UNAVAILABLE": return "account";
    case "CATEGORY_NOT_FOUND":
    case "INVALID_RECURRING_CATEGORY": return "category";
    case "INVALID_RECURRING_SOURCE": return "merchantOrSource";
    default: return null;
  }
}

export function nextOccurrenceIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
