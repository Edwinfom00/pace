import { DomainConflictError } from "@/authorization/errors";
import type { CurrencyCode } from "@/money/currency";

import type { LedgerAccountType } from "./domain";


export const ZERO_FLOOR_FUNDED_ACCOUNT_TYPES = [
  "CASH",
  "CHECKING",
  "SAVINGS",
  "MOBILE_MONEY",
] as const satisfies readonly LedgerAccountType[];

export type LedgerSpendabilityMode = "ZERO_FLOOR" | "UNSUPPORTED";
export type LedgerDebitDenialReason =
  | "INSUFFICIENT_FUNDS"
  | "ACCOUNT_SPENDABILITY_UNSUPPORTED";

export interface AccountSpendability {
  readonly accountId: string;
  readonly currency: CurrencyCode;
  readonly currentBalanceMinor: bigint;
  readonly availableBalanceMinor: bigint;
  readonly requestedDebitMinor: bigint;
  readonly projectedBalanceMinor: bigint;
  readonly mode: LedgerSpendabilityMode;
  readonly canDebit: boolean;
  readonly reason: LedgerDebitDenialReason | null;
}

export interface DebitSpendabilityGuard {
  readonly accountId: string;
  readonly currency: CurrencyCode;
  readonly requestedDebitMinor: bigint;
  readonly minimumAllowedBalanceMinor: bigint;
}

export function getSpendabilityMode(accountType: LedgerAccountType): LedgerSpendabilityMode {
  return ZERO_FLOOR_FUNDED_ACCOUNT_TYPES.includes(
    accountType as (typeof ZERO_FLOOR_FUNDED_ACCOUNT_TYPES)[number],
  )
    ? "ZERO_FLOOR"
    : "UNSUPPORTED";
}


export function getAccountSpendability(input: {
  accountId: string;
  accountType: LedgerAccountType;
  currency: CurrencyCode;
  currentBalanceMinor: bigint;
  requestedDebitMinor: bigint;
}): AccountSpendability {
  const mode = getSpendabilityMode(input.accountType);
  const availableBalanceMinor = input.currentBalanceMinor;
  const projectedBalanceMinor = availableBalanceMinor - input.requestedDebitMinor;
  const canDebit = mode === "ZERO_FLOOR" && projectedBalanceMinor >= 0n;

  return {
    accountId: input.accountId,
    currency: input.currency,
    currentBalanceMinor: input.currentBalanceMinor,
    availableBalanceMinor,
    requestedDebitMinor: input.requestedDebitMinor,
    projectedBalanceMinor,
    mode,
    canDebit,
    reason: canDebit
      ? null
      : mode === "UNSUPPORTED"
        ? "ACCOUNT_SPENDABILITY_UNSUPPORTED"
        : "INSUFFICIENT_FUNDS",
  };
}

export function debitSpendabilityGuard(
  account: Pick<{ id: string; currency: string; type: LedgerAccountType }, "id" | "currency" | "type">,
  requestedDebitMinor: bigint,
): DebitSpendabilityGuard {
  if (getSpendabilityMode(account.type) === "UNSUPPORTED") {
    throw new AccountSpendabilityUnsupportedError(account.id, account.currency, account.type);
  }
  return {
    accountId: account.id,
    currency: account.currency as CurrencyCode,
    requestedDebitMinor,
    minimumAllowedBalanceMinor: 0n,
  };
}

export class InsufficientFundsError extends DomainConflictError {
  constructor(readonly spendability: AccountSpendability) {
    super(
      "INSUFFICIENT_FUNDS",
      "This account does not have enough available funds for the requested debit.",
      insufficientFundsDetails(spendability),
    );
    this.name = "InsufficientFundsError";
  }
}

export class AccountSpendabilityUnsupportedError extends DomainConflictError {
  constructor(accountId: string, currency: string, accountType: LedgerAccountType) {
    super(
      "ACCOUNT_SPENDABILITY_UNSUPPORTED",
      "This account type has no configured credit or overdraft semantics for new debits.",
      { accountId, currency, accountType },
    );
    this.name = "AccountSpendabilityUnsupportedError";
  }
}

export interface InsufficientFundsDetails extends Record<string, string> {
  readonly accountId: string;
  readonly currency: string;
  readonly availableBalanceMinor: string;
  readonly requiredAmountMinor: string;
}

export function insufficientFundsDetails(spendability: AccountSpendability): InsufficientFundsDetails {
  return {
    accountId: spendability.accountId,
    currency: spendability.currency,
    availableBalanceMinor: spendability.availableBalanceMinor.toString(),
    requiredAmountMinor: spendability.requestedDebitMinor.toString(),
  };
}
