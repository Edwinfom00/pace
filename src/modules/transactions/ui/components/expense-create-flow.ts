import type { CreatedExpenseDTO } from "@/modules/ledger/create-expense-contract";
import type { ExpenseFormInput, TransactionFormDraft, TransactionFormErrors, TransactionFormField } from "@/modules/transactions/schemas/transaction-form.schema";
import {
  formatManualTransactionDate,
  manualTransactionCreationErrorCode,
  parseCreatedManualTransactionDTO,
} from "./manual-transaction-create-flow";

export type ExpenseCreateFailure = {
  readonly field?: TransactionFormField;
  readonly code: string | undefined;
};


export function createExpenseCommand(
  workspaceId: string,
  draft: Extract<ExpenseFormInput, { readonly kind: "EXPENSE" }>,
) {
  return {
    workspaceId,
    accountId: draft.account,
    amount: draft.amount,
    currency: draft.currency,
    categoryId: draft.category || undefined,
    merchant: draft.merchant || undefined,
    date: formatManualTransactionDate(draft.date),
    time: draft.time || undefined,
    note: draft.note || undefined,
  };
}

export type CreateExpenseCommand = ReturnType<typeof createExpenseCommand>;

export type ExpenseCreationTransport = (
  command: CreateExpenseCommand,
) => Promise<{ readonly ok: boolean; readonly payload: unknown }>;

export type ExpenseCreationResponse =
  | { readonly ok: true; readonly expense: CreatedExpenseDTO }
  | { readonly ok: false; readonly failure: ExpenseCreateFailure };

/**
 * The UI accepts a persisted C13A DTO as success and never manufactures a
 * transaction from a form draft before the server confirms it.
 */
export async function submitCanonicalExpense(
  command: CreateExpenseCommand,
  transport: ExpenseCreationTransport,
): Promise<ExpenseCreationResponse> {
  const response = await transport(command);
  if (!response.ok) return { ok: false, failure: mapExpenseCreateFailure(expenseCreationErrorCode(response.payload)) };

  const expense = parseCreatedExpenseDTO(response.payload);
  return expense
    ? { ok: true, expense }
    : { ok: false, failure: mapExpenseCreateFailure(undefined) };
}


export function mapExpenseCreateFailure(code: string | undefined): ExpenseCreateFailure {
  switch (code) {
    case "INVALID_AMOUNT":
      return { code, field: "amount" };
    case "INVALID_CURRENCY":
    case "CURRENCY_MISMATCH":
      return { code, field: "currency" };
    case "ACCOUNT_NOT_FOUND":
    case "ACCOUNT_UNAVAILABLE":
    case "ACCOUNT_WORKSPACE_MISMATCH":
      return { code, field: "account" };
    case "CATEGORY_NOT_FOUND":
    case "CATEGORY_NOT_ALLOWED":
      return { code, field: "category" };
    case "INVALID_OCCURRED_AT":
      return { code, field: "date" };
    case "INVALID_MERCHANT":
      return { code, field: "merchant" };
    case "INVALID_NOTE":
      return { code, field: "note" };
    default:
      return { code };
  }
}

export function serverExpenseFieldErrors(failure: ExpenseCreateFailure): TransactionFormErrors {
  if (!failure.field) return {};

  const errorByField: Record<TransactionFormField, TransactionFormErrors[TransactionFormField]> = {
    amount: "transactions.validation.amountInvalid",
    currency: "transactions.validation.currencyUnsupported",
    account: "transactions.validation.accountUnavailable",
    category: "transactions.validation.categoryUnavailable",
    date: "transactions.validation.invalidDate",
    time: "transactions.validation.invalidTime",
    merchant: "transactions.validation.optionalTextBlank",
    note: "transactions.validation.noteTooLong",
    source: "transactions.validation.optionalTextBlank",
    fromAccount: "transactions.validation.accountUnavailable",
    toAccount: "transactions.validation.accountUnavailable",
  };

  return { [failure.field]: errorByField[failure.field] };
}

export function expenseCreationErrorCode(payload: unknown): string | undefined {
  return manualTransactionCreationErrorCode(payload);
}

export function parseCreatedExpenseDTO(payload: unknown): CreatedExpenseDTO | null {
  return parseCreatedManualTransactionDTO(payload, "expense", "EXPENSE");
}


export function canStartExpenseSubmission(isSubmitting: boolean): boolean {
  return !isSubmitting;
}


export function canReconcileCreatedExpense(requestWorkspaceId: string, currentWorkspaceId: string): boolean {
  return requestWorkspaceId.length > 0 && requestWorkspaceId === currentWorkspaceId;
}

/**
 * The existing server-rendered Transactions and Overview queries remain the
 * sole reconciliation surface. A DTO is confirmation, never a list item.
 */
export function expenseReconciliationPlan(requestWorkspaceId: string, currentWorkspaceId: string) {
  const belongsToCurrentWorkspace = canReconcileCreatedExpense(requestWorkspaceId, currentWorkspaceId);
  return {
    shouldAttachTransactionToList: false,
    shouldCloseDialog: belongsToCurrentWorkspace,
    shouldRefreshData: true,
    shouldResetExpenseDraft: belongsToCurrentWorkspace,
  } as const;
}


export function resetExpenseTransactionDraft(
  draft: TransactionFormDraft,
  emptyExpenseDraft: TransactionFormDraft["expense"],
): TransactionFormDraft {
  return { ...draft, expense: emptyExpenseDraft };
}
