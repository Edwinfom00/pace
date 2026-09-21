import type { CreatedIncomeDTO } from "@/modules/ledger/create-income-contract";
import type { IncomeFormInput, TransactionFormDraft, TransactionFormErrors, TransactionFormField } from "@/modules/transactions/schemas/transaction-form.schema";

import {
  canReconcileCreatedManualTransaction,
  canStartManualTransactionSubmission,
  formatManualTransactionDate,
  manualTransactionReconciliationPlan,
  parseCreatedManualTransactionDTO,
  serverManualTransactionFieldErrors,
  submitCanonicalManualTransaction,
  type ManualTransactionCreationTransport,
} from "./manual-transaction-create-flow";
import type { InsufficientFundsDetails } from "./transaction-balance";

export type IncomeCreateFailure = {
  readonly field?: TransactionFormField;
  readonly code: string | undefined;
  readonly insufficientFunds?: InsufficientFundsDetails | null;
};


export function createIncomeCommand(
  workspaceId: string,
  draft: Extract<IncomeFormInput, { readonly kind: "INCOME" }>,
) {
  return {
    workspaceId,
    accountId: draft.account,
    amount: draft.amount,
    currency: draft.currency,
    categoryId: draft.category || undefined,
    source: draft.source || null,
    date: formatManualTransactionDate(draft.date),
    time: draft.time || undefined,
    note: draft.note || undefined,
  };
}

export type CreateIncomeCommand = ReturnType<typeof createIncomeCommand>;

export type IncomeCreationTransport = ManualTransactionCreationTransport<CreateIncomeCommand>;

export type IncomeCreationResponse =
  | { readonly ok: true; readonly income: CreatedIncomeDTO }
  | { readonly ok: false; readonly failure: IncomeCreateFailure };


export async function submitCanonicalIncome(
  command: CreateIncomeCommand,
  transport: IncomeCreationTransport,
): Promise<IncomeCreationResponse> {
  const result = await submitCanonicalManualTransaction(
    command,
    transport,
    parseCreatedIncomeDTO,
    mapIncomeCreateFailure,
  );
  return result.ok
    ? { ok: true, income: result.transaction }
    : { ok: false, failure: result.failure };
}

export function mapIncomeCreateFailure(code: string | undefined): IncomeCreateFailure {
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
    case "INVALID_SOURCE":
    case "INVALID_COUNTERPARTY":
      return { code, field: "source" };
    case "INVALID_NOTE":
      return { code, field: "note" };
    default:
      return { code };
  }
}

export function serverIncomeFieldErrors(failure: IncomeCreateFailure): TransactionFormErrors {
  return serverManualTransactionFieldErrors(failure);
}

export function parseCreatedIncomeDTO(payload: unknown): CreatedIncomeDTO | null {
  return parseCreatedManualTransactionDTO(payload, "income", "INCOME");
}

export function canStartIncomeSubmission(isSubmitting: boolean): boolean {
  return canStartManualTransactionSubmission(isSubmitting);
}

export function canReconcileCreatedIncome(requestWorkspaceId: string, currentWorkspaceId: string): boolean {
  return canReconcileCreatedManualTransaction(requestWorkspaceId, currentWorkspaceId);
}


export function incomeReconciliationPlan(requestWorkspaceId: string, currentWorkspaceId: string) {
  const reconciliation = manualTransactionReconciliationPlan(requestWorkspaceId, currentWorkspaceId);
  return {
    shouldAttachTransactionToList: reconciliation.shouldAttachTransactionToList,
    shouldCloseDialog: reconciliation.shouldCloseDialog,
    shouldRefreshData: reconciliation.shouldRefreshData,
    shouldResetIncomeDraft: reconciliation.shouldResetDraft,
  } as const;
}

export function resetIncomeTransactionDraft(
  draft: TransactionFormDraft,
  emptyIncomeDraft: TransactionFormDraft["income"],
): TransactionFormDraft {
  return { ...draft, income: emptyIncomeDraft };
}
