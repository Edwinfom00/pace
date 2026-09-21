import { getCurrencyExponent } from "@/money/currency";
import { money, parseDecimalMoney, toDecimalString } from "@/money/money";
import { zonedLocalDateTimeToInstant } from "@/money/period";
import type { AccountDetail } from "@/modules/accounts/domain/account-detail";
import {
  getTransactionFormDateTime,
  getTransactionFormToday,
} from "@/modules/transactions/ui/components/transaction-date-field";

export type OpeningBalanceMode = "set" | "correct";

export type OpeningBalanceDraft = {
  readonly amount: string;
  readonly effectiveDate: Date;
  readonly reason: string;
};

export type OpeningBalanceFieldError = "amount" | "date";
export type OpeningBalanceFormError = "conflict" | "notAllowed" | "failed" | null;

export function createOpeningBalanceDraft(
  openingBalance: AccountDetail["openingBalance"],
  currency: string,
  timeZone: string,
  now: Date,
): OpeningBalanceDraft {
  if (!openingBalance) {
    return { amount: "", effectiveDate: getTransactionFormToday(timeZone, now), reason: "" };
  }

  return {
    amount: toDecimalString(money(currency, BigInt(openingBalance.amountMinor))),
    effectiveDate: getTransactionFormDateTime(openingBalance.effectiveAt, timeZone).date,
    reason: "",
  };
}

export function parseOpeningBalanceAmount(value: string, currency: string) {
  return parseDecimalMoney(normalizeMoneyInput(value, currency), currency);
}

export function validateOpeningBalanceDraft(
  mode: OpeningBalanceMode,
  draft: OpeningBalanceDraft,
  account: Pick<AccountDetail["account"], "currency">,
  openingBalance: AccountDetail["openingBalance"],
  timeZone: string,
): Partial<Record<OpeningBalanceFieldError, true>> {
  const errors: Partial<Record<OpeningBalanceFieldError, true>> = {};
  const amount = parseOpeningBalanceAmount(draft.amount, account.currency);
  if (!amount || (mode === "correct" && openingBalance && amount.minor === BigInt(openingBalance.amountMinor))) {
    errors.amount = true;
  }

  if (mode === "set") {
    try {
      openingBalanceEffectiveAt(draft.effectiveDate, timeZone);
    } catch {
      errors.date = true;
    }
  }

  return errors;
}

export function createSetOpeningBalanceCommand(
  workspaceId: string,
  account: Pick<AccountDetail["account"], "id" | "currency">,
  draft: OpeningBalanceDraft,
  timeZone: string,
  idempotencyKey: string,
) {
  const amount = parseOpeningBalanceAmount(draft.amount, account.currency);
  if (!amount) return null;
  try {
    return {
      workspaceId,
      accountId: account.id,
      amountMinor: amount.minor.toString(),
      currency: account.currency,
      effectiveAt: openingBalanceEffectiveAt(draft.effectiveDate, timeZone),
      idempotencyKey,
    };
  } catch {
    return null;
  }
}

export function createCorrectOpeningBalanceCommand(
  workspaceId: string,
  account: Pick<AccountDetail["account"], "id" | "currency">,
  openingBalance: NonNullable<AccountDetail["openingBalance"]>,
  draft: OpeningBalanceDraft,
  idempotencyKey: string,
) {
  const amount = parseOpeningBalanceAmount(draft.amount, account.currency);
  if (!amount || amount.minor === BigInt(openingBalance.amountMinor)) return null;
  const reason = draft.reason.normalize("NFKC").trim();
  return {
    workspaceId,
    accountId: account.id,
    newAmountMinor: amount.minor.toString(),
    expectedVersion: openingBalance.updatedAt,
    idempotencyKey,
    ...(reason ? { reason } : {}),
  };
}

export function openingBalanceEffectiveAt(date: Date, timeZone: string): string {
  return zonedLocalDateTimeToInstant({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }, { hour: 0, minute: 0 }, timeZone).toISOString();
}

export function mapOpeningBalanceFailure(code: string | undefined): {
  readonly fieldErrors: Partial<Record<OpeningBalanceFieldError, true>>;
  readonly formError: OpeningBalanceFormError;
} {
  switch (code) {
    case "INVALID_OPENING_BALANCE":
    case "NEGATIVE_OPENING_BALANCE_NOT_ALLOWED":
      return { fieldErrors: { amount: true }, formError: null };
    case "OPENING_BALANCE_ALREADY_EXISTS":
    case "OPENING_BALANCE_NOT_FOUND":
    case "CONCURRENT_MODIFICATION":
    case "OPENING_BALANCE_ALREADY_PROCESSED":
      return { fieldErrors: {}, formError: "conflict" };
    case "ACCOUNT_UNAVAILABLE":
      return { fieldErrors: {}, formError: "notAllowed" };
    default:
      return { fieldErrors: {}, formError: "failed" };
  }
}

export function openingBalanceErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const code = (payload as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function normalizeMoneyInput(value: string, currency: string): string {
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
