import { isCurrencyCode, toCurrencyCode } from "@/money/currency";
import { parseDecimalMoney } from "@/money/money";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";

import type { TransactionAccountOption } from "./transaction-account.types";

export type TransactionBalanceLabels = {
  readonly available: string;
  readonly current: string;
  readonly afterTransaction: string;
  readonly unavailable: string;
};

export type InsufficientFundsDetails = {
  readonly accountId: string;
  readonly availableBalanceMinor: string;
  readonly currency: string;
  readonly requiredAmountMinor: string;
};

export type OutgoingBalanceValidation =
  | { readonly status: "not-applicable" | "not-ready" | "unavailable" }
  | { readonly status: "valid"; readonly amountMinor: bigint; readonly account: TransactionAccountOption }
  | {
    readonly status: "insufficient";
    readonly account: TransactionAccountOption;
    readonly amountMinor: bigint;
    readonly availableBalanceMinor: bigint;
  };

export function formatTransactionBalance(
  minor: string,
  currency: string,
  locale: string,
): string | null {
  if (!isCurrencyCode(currency)) return null;
  try {
    return formatOverviewMoney(BigInt(minor), currency, locale);
  } catch {
    return null;
  }
}

export function accountBalanceKind(
  account: TransactionAccountOption,
  preferred: "available" | "current",
): "available" | "current" {
  return preferred === "available" && account.spendabilityMode === "ZERO_FLOOR"
    ? "available"
    : "current";
}

export function accountBalanceText(
  account: TransactionAccountOption,
  locale: string,
  labels: TransactionBalanceLabels,
  preferred: "available" | "current",
): string | null {
  const kind = accountBalanceKind(account, preferred);
  const minor = kind === "available" ? account.availableBalanceMinor : account.currentBalanceMinor;
  const formatted = minor ? formatTransactionBalance(minor, account.currency, locale) : null;
  return formatted ? `${kind === "available" ? labels.available : labels.current} · ${formatted}` : null;
}


export function validateOutgoingBalance(input: {
  readonly account: TransactionAccountOption | undefined;
  readonly accountAvailability: "error" | "loading" | "ready";
  readonly amount: string;
  readonly currency: string;
}): OutgoingBalanceValidation {
  const { account, accountAvailability, amount, currency } = input;
  if (!account) return { status: "not-applicable" };
  if (accountAvailability !== "ready") return { status: "unavailable" };
  if (account.currency !== currency || account.spendabilityMode !== "ZERO_FLOOR") {
    return { status: "not-applicable" };
  }

  const parsedAmount = parseDecimalMoney(amount, currency);
  if (!parsedAmount || parsedAmount.minor <= 0n || !account.availableBalanceMinor) {
    return { status: parsedAmount ? "unavailable" : "not-ready" };
  }

  let availableBalanceMinor: bigint;
  try {
    availableBalanceMinor = BigInt(account.availableBalanceMinor);
  } catch {
    return { status: "unavailable" };
  }

  if (parsedAmount.minor > availableBalanceMinor) {
    return { status: "insufficient", account, amountMinor: parsedAmount.minor, availableBalanceMinor };
  }
  return { status: "valid", account, amountMinor: parsedAmount.minor };
}

export function transactionBalanceAfter(
  account: TransactionAccountOption | undefined,
  amount: string,
  currency: string,
  direction: "credit" | "debit",
): { readonly currency: string; readonly minor: string } | null {
  if (!account || account.currency !== currency) return null;
  const base = direction === "debit" ? account.availableBalanceMinor : account.currentBalanceMinor;
  if (!base) return null;
  const parsedAmount = parseDecimalMoney(amount, currency);
  if (!parsedAmount || parsedAmount.minor <= 0n) return null;
  try {
    const currentMinor = BigInt(base);
    const minor = direction === "debit" ? currentMinor - parsedAmount.minor : currentMinor + parsedAmount.minor;
    return { currency: account.currency, minor: minor.toString() };
  } catch {
    return null;
  }
}

export function parseInsufficientFundsDetails(payload: unknown): InsufficientFundsDetails | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as { readonly code?: unknown; readonly details?: unknown };
  if (value.code !== "INSUFFICIENT_FUNDS" || !value.details || typeof value.details !== "object" || Array.isArray(value.details)) {
    return null;
  }
  const details = value.details as Record<string, unknown>;
  if (
    typeof details.accountId !== "string"
    || typeof details.currency !== "string"
    || !isCurrencyCode(details.currency)
    || typeof details.availableBalanceMinor !== "string"
    || typeof details.requiredAmountMinor !== "string"
  ) return null;
  try {
    BigInt(details.availableBalanceMinor);
    BigInt(details.requiredAmountMinor);
  } catch {
    return null;
  }
  return {
    accountId: details.accountId,
    currency: toCurrencyCode(details.currency),
    availableBalanceMinor: details.availableBalanceMinor,
    requiredAmountMinor: details.requiredAmountMinor,
  };
}

export function applyAuthoritativeBalanceOverride(
  accounts: readonly TransactionAccountOption[],
  override: InsufficientFundsDetails | null,
): readonly TransactionAccountOption[] {
  if (!override) return accounts;
  return accounts.map((account) => (
    account.id === override.accountId && account.currency === override.currency
      ? { ...account, availableBalanceMinor: override.availableBalanceMinor }
      : account
  ));
}
