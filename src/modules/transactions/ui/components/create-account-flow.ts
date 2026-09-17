import { isCurrencyCode } from "@/money/currency";
import {
  createAccountSchema,
  type CreateAccountErrorCode,
  type CreatedAccountDTO,
} from "@/modules/ledger/create-account-contract";
import { LEDGER_ACCOUNT_TYPES } from "@/modules/ledger/domain";
import type { TransactionFormDraft } from "@/modules/transactions/schemas/transaction-form.schema";

import type { CreateAccountFormDraft } from "./create-account-form";
import type { TransactionAccountOption } from "./transaction-account.types";

export type AccountCreationTarget =
  | "EXPENSE_ACCOUNT"
  | "INCOME_ACCOUNT"
  | "TRANSFER_FROM"
  | "TRANSFER_TO";

export type CreateAccountFormField = "name" | "type" | "currency" | "openingBalance";
export type CreateAccountFormErrors = Partial<Record<CreateAccountFormField, true>>;

export type CreateAccountFailure = {
  readonly field?: CreateAccountFormField;
  readonly code: CreateAccountErrorCode | "WORKSPACE_CHANGED";
};


export function validateCreateAccountForm(
  workspaceId: string,
  draft: CreateAccountFormDraft,
): CreateAccountFormErrors {
  const parsed = createAccountSchema.safeParse({ workspaceId, ...draft });
  if (parsed.success) return {};

  const errors: CreateAccountFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "name" || field === "type" || field === "currency" || field === "openingBalance") {
      errors[field] = true;
    }
  }
  return errors;
}


export function mapCreateAccountFailure(code: string | undefined): CreateAccountFailure {
  switch (code) {
    case "INVALID_ACCOUNT_NAME":
      return { code, field: "name" };
    case "INVALID_ACCOUNT_TYPE":
      return { code, field: "type" };
    case "INVALID_CURRENCY":
      return { code, field: "currency" };
    case "INVALID_OPENING_BALANCE":
      return { code, field: "openingBalance" };
    case "WORKSPACE_FORBIDDEN":
      return { code };
    case "UNAUTHENTICATED":
    case "ACCOUNT_CREATE_FAILED":
      return { code };
    default:
      return { code: "ACCOUNT_CREATE_FAILED" };
  }
}


export function parseCreatedAccountDTO(payload: unknown): CreatedAccountDTO | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const account = (payload as { readonly account?: unknown }).account;
  if (!account || typeof account !== "object" || Array.isArray(account)) return null;
  const value = account as Record<string, unknown>;

  if (
    typeof value.id !== "string"
    || typeof value.name !== "string"
    || typeof value.type !== "string"
    || !LEDGER_ACCOUNT_TYPES.includes(value.type as (typeof LEDGER_ACCOUNT_TYPES)[number])
    || typeof value.currency !== "string"
    || !isCurrencyCode(value.currency)
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    type: value.type as CreatedAccountDTO["type"],
    currency: value.currency,
  };
}

export function toTransactionAccountOption(account: CreatedAccountDTO): TransactionAccountOption {
  return { id: account.id, name: account.name, currency: account.currency };
}

/**
 * The returned DTO is already persisted. It is held only until the server
 * account query contains the same real ID after refresh.
 */
export function reconcileTransactionAccountOptions(
  authoritativeAccounts: readonly TransactionAccountOption[],
  createdAccountAwaitingReconciliation: CreatedAccountDTO | null,
): readonly TransactionAccountOption[] {
  if (!createdAccountAwaitingReconciliation) return authoritativeAccounts;
  if (authoritativeAccounts.some((account) => account.id === createdAccountAwaitingReconciliation.id)) {
    return authoritativeAccounts;
  }
  return [...authoritativeAccounts, toTransactionAccountOption(createdAccountAwaitingReconciliation)];
}

/** A response may only update the transaction draft for the workspace that issued it. */
export function canAttachCreatedAccountToWorkspace(
  requestWorkspaceId: string,
  currentWorkspaceId: string,
): boolean {
  return requestWorkspaceId.length > 0 && requestWorkspaceId === currentWorkspaceId;
}

/** Prevent a second click from starting another account-creation request. */
export function canStartCreateAccountSubmission(isSubmitting: boolean): boolean {
  return !isSubmitting;
}

/** Selects a real newly-created ID without changing the rest of the transaction draft. */
export function selectCreatedAccountForTarget(
  draft: TransactionFormDraft,
  target: AccountCreationTarget,
  account: CreatedAccountDTO,
  accounts: readonly TransactionAccountOption[],
): TransactionFormDraft {
  if (target === "EXPENSE_ACCOUNT") {
    return {
      ...draft,
      expense: { ...draft.expense, account: account.id, currency: account.currency },
    };
  }
  if (target === "INCOME_ACCOUNT") {
    return {
      ...draft,
      income: { ...draft.income, account: account.id, currency: account.currency },
    };
  }

  if (target === "TRANSFER_FROM") {
    return {
      ...draft,
      transfer: { ...draft.transfer, fromAccount: account.id, currency: account.currency },
    };
  }

  const fromAccount = accounts.find((candidate) => candidate.id === draft.transfer.fromAccount);
  return {
    ...draft,
    transfer: {
      ...draft.transfer,
      toAccount: account.id,
      currency: fromAccount?.currency ?? account.currency,
    },
  };
}
