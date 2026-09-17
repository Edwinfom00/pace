import type { CreatedIncomeDTO } from "@/modules/ledger/create-income-contract";
import type { IncomeFormInput, TransactionFormDraft, TransactionFormErrors, TransactionFormField } from "@/modules/transactions/schemas/transaction-form.schema";

import {
  formatManualTransactionDate,
  manualTransactionCreationErrorCode,
  parseCreatedManualTransactionDTO,
} from "./manual-transaction-create-flow";

export type IncomeCreateFailure = {
  readonly field?: TransactionFormField;
  readonly code: string | undefined;
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

export type IncomeCreationTransport = (
  command: CreateIncomeCommand,
) => Promise<{ readonly ok: boolean; readonly payload: unknown }>;

export type IncomeCreationResponse =
  | { readonly ok: true; readonly income: CreatedIncomeDTO }
  | { readonly ok: false; readonly failure: IncomeCreateFailure };


export async function submitCanonicalIncome(
  command: CreateIncomeCommand,
  transport: IncomeCreationTransport,
): Promise<IncomeCreationResponse> {
  const response = await transport(command);
  if (!response.ok) return { ok: false, failure: mapIncomeCreateFailure(manualTransactionCreationErrorCode(response.payload)) };

  const income = parseCreatedIncomeDTO(response.payload);
  return income
    ? { ok: true, income }
    : { ok: false, failure: mapIncomeCreateFailure(undefined) };
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

export function parseCreatedIncomeDTO(payload: unknown): CreatedIncomeDTO | null {
  return parseCreatedManualTransactionDTO(payload, "income", "INCOME");
}

export function canStartIncomeSubmission(isSubmitting: boolean): boolean {
  return !isSubmitting;
}

export function canReconcileCreatedIncome(requestWorkspaceId: string, currentWorkspaceId: string): boolean {
  return requestWorkspaceId.length > 0 && requestWorkspaceId === currentWorkspaceId;
}


export function incomeReconciliationPlan(requestWorkspaceId: string, currentWorkspaceId: string) {
  const belongsToCurrentWorkspace = canReconcileCreatedIncome(requestWorkspaceId, currentWorkspaceId);
  return {
    shouldAttachTransactionToList: false,
    shouldCloseDialog: belongsToCurrentWorkspace,
    shouldRefreshData: true,
    shouldResetIncomeDraft: belongsToCurrentWorkspace,
  } as const;
}

export function resetIncomeTransactionDraft(
  draft: TransactionFormDraft,
  emptyIncomeDraft: TransactionFormDraft["income"],
): TransactionFormDraft {
  return { ...draft, income: emptyIncomeDraft };
}
