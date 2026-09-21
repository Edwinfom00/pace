import type { CreatedAccountDTO } from "@/modules/ledger/create-account-contract";
import type { TransactionFormDraft } from "@/modules/transactions/schemas/transaction-form.schema";

import type { TransactionAccountOption } from "./transaction-account.types";

export {
  canAttachCreatedAccountToWorkspace,
  canStartCreateAccountSubmission,
  mapCreateAccountFailure,
  parseCreatedAccountDTO,
  validateCreateAccountForm,
  type CreateAccountFailure,
  type CreateAccountFormErrors,
  type CreateAccountFormField,
} from "@/modules/ledger/ui/components/create-account-flow";

export type AccountCreationTarget =
  | "EXPENSE_ACCOUNT"
  | "INCOME_ACCOUNT"
  | "TRANSFER"
  | "TRANSFER_FROM"
  | "TRANSFER_TO";

export function toTransactionAccountOption(account: CreatedAccountDTO): TransactionAccountOption {
  return { id: account.id, name: account.name, currency: account.currency };
}

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

export function selectCreatedAccountForTarget(
  draft: TransactionFormDraft,
  target: AccountCreationTarget,
  account: CreatedAccountDTO,
  accounts: readonly TransactionAccountOption[],
): TransactionFormDraft {
  if (target === "EXPENSE_ACCOUNT") {
    return { ...draft, expense: { ...draft.expense, account: account.id, currency: account.currency } };
  }
  if (target === "INCOME_ACCOUNT") {
    return { ...draft, income: { ...draft.income, account: account.id, currency: account.currency } };
  }
  if (target === "TRANSFER_FROM") {
    return { ...draft, transfer: { ...draft.transfer, fromAccount: account.id, currency: account.currency } };
  }
  if (target === "TRANSFER") return draft;

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
