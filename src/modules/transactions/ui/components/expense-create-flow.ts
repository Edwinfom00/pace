import type { CreatedExpenseDTO } from "@/modules/ledger/create-expense-contract";
import type { ExpenseFormInput, TransactionFormDraft, TransactionFormErrors, TransactionFormField } from "@/modules/transactions/schemas/transaction-form.schema";
import {
  canReconcileCreatedManualTransaction,
  canStartManualTransactionSubmission,
  formatManualTransactionDate,
  manualTransactionCreationErrorCode,
  manualTransactionReconciliationPlan,
  parseCreatedManualTransactionDTO,
  serverManualTransactionFieldErrors,
  submitCanonicalManualTransaction,
  type ManualTransactionCreationTransport,
} from "./manual-transaction-create-flow";
import {
  parseInsufficientFundsDetails,
  type InsufficientFundsDetails,
} from "./transaction-balance";

export type ExpenseCreateFailure = {
  readonly field?: TransactionFormField;
  readonly code: string | undefined;
  readonly insufficientFunds?: InsufficientFundsDetails | null;
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

export type ExpenseCreationTransport = ManualTransactionCreationTransport<CreateExpenseCommand>;

export type ExpenseCreationResponse =
  | { readonly ok: true; readonly expense: CreatedExpenseDTO }
  | { readonly ok: false; readonly failure: ExpenseCreateFailure };


export async function submitCanonicalExpense(
  command: CreateExpenseCommand,
  transport: ExpenseCreationTransport,
): Promise<ExpenseCreationResponse> {
  const result = await submitCanonicalManualTransaction(
    command,
    transport,
    parseCreatedExpenseDTO,
    mapExpenseCreateFailure,
  );
  return result.ok
    ? { ok: true, expense: result.transaction }
    : { ok: false, failure: result.failure };
}


export function mapExpenseCreateFailure(code: string | undefined, payload?: unknown): ExpenseCreateFailure {
  switch (code) {
    case "INSUFFICIENT_FUNDS":
      return { code, field: "amount", insufficientFunds: parseInsufficientFundsDetails(payload) };
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
  return serverManualTransactionFieldErrors(failure);
}

export function expenseCreationErrorCode(payload: unknown): string | undefined {
  return manualTransactionCreationErrorCode(payload);
}

export function parseCreatedExpenseDTO(payload: unknown): CreatedExpenseDTO | null {
  return parseCreatedManualTransactionDTO(payload, "expense", "EXPENSE");
}


export function canStartExpenseSubmission(isSubmitting: boolean): boolean {
  return canStartManualTransactionSubmission(isSubmitting);
}


export function canReconcileCreatedExpense(requestWorkspaceId: string, currentWorkspaceId: string): boolean {
  return canReconcileCreatedManualTransaction(requestWorkspaceId, currentWorkspaceId);
}


export function expenseReconciliationPlan(requestWorkspaceId: string, currentWorkspaceId: string) {
  const reconciliation = manualTransactionReconciliationPlan(requestWorkspaceId, currentWorkspaceId);
  return {
    shouldAttachTransactionToList: reconciliation.shouldAttachTransactionToList,
    shouldCloseDialog: reconciliation.shouldCloseDialog,
    shouldRefreshData: reconciliation.shouldRefreshData,
    shouldResetExpenseDraft: reconciliation.shouldResetDraft,
  } as const;
}


export function resetExpenseTransactionDraft(
  draft: TransactionFormDraft,
  emptyExpenseDraft: TransactionFormDraft["expense"],
): TransactionFormDraft {
  return { ...draft, expense: emptyExpenseDraft };
}
