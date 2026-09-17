import type { CreatedManualTransactionDTO } from "@/modules/ledger/manual-transaction-contract";
import type {
  TransactionFormErrors,
  TransactionFormField,
} from "@/modules/transactions/schemas/transaction-form.schema";

export type ManualTransactionCreationTransport<Command> = (
  command: Command,
) => Promise<{ readonly ok: boolean; readonly payload: unknown }>;

export type ManualTransactionRetryKey = {
  readonly commandSignature: string;
  readonly idempotencyKey: string;
};

export function manualTransactionRetryKeyForCommand(
  current: ManualTransactionRetryKey | undefined,
  commandSignature: string,
  createKey: () => string,
): ManualTransactionRetryKey {
  return current?.commandSignature === commandSignature
    ? current
    : { commandSignature, idempotencyKey: createKey() };
}

export type CanonicalManualTransactionCreationResponse<Success, Failure> =
  | { readonly ok: true; readonly transaction: Success }
  | { readonly ok: false; readonly failure: Failure };


export async function submitCanonicalManualTransaction<Command, Success, Failure>(
  command: Command,
  transport: ManualTransactionCreationTransport<Command>,
  parseSuccess: (payload: unknown) => Success | null,
  mapFailure: (code: string | undefined) => Failure,
): Promise<CanonicalManualTransactionCreationResponse<Success, Failure>> {
  const response = await transport(command);
  if (!response.ok) {
    return { ok: false, failure: mapFailure(manualTransactionCreationErrorCode(response.payload)) };
  }

  const transaction = parseSuccess(response.payload);
  return transaction
    ? { ok: true, transaction }
    : { ok: false, failure: mapFailure(undefined) };
}


export function formatManualTransactionDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function manualTransactionCreationErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const code = (payload as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function serverManualTransactionFieldErrors(
  failure: { readonly field?: TransactionFormField },
): TransactionFormErrors {
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

export function canStartManualTransactionSubmission(isSubmitting: boolean): boolean {
  return !isSubmitting;
}

export function canReconcileCreatedManualTransaction(
  requestWorkspaceId: string,
  currentWorkspaceId: string,
): boolean {
  return requestWorkspaceId.length > 0 && requestWorkspaceId === currentWorkspaceId;
}


export function manualTransactionReconciliationPlan(
  requestWorkspaceId: string,
  currentWorkspaceId: string,
) {
  const belongsToCurrentWorkspace = canReconcileCreatedManualTransaction(requestWorkspaceId, currentWorkspaceId);
  return {
    shouldAttachTransactionToList: false,
    shouldCloseDialog: belongsToCurrentWorkspace,
    shouldRefreshData: true,
    shouldResetDraft: belongsToCurrentWorkspace,
  } as const;
}

export function parseCreatedManualTransactionDTO<Type extends "EXPENSE" | "INCOME">(
  payload: unknown,
  property: "expense" | "income",
  type: Type,
): CreatedManualTransactionDTO<Type> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const transaction = (payload as Record<string, unknown>)[property];
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) return null;
  const value = transaction as Record<string, unknown>;

  if (
    typeof value.id !== "string"
    || value.type !== type
    || typeof value.amountMinor !== "string"
    || typeof value.currency !== "string"
    || typeof value.accountId !== "string"
    || (value.categoryId !== null && typeof value.categoryId !== "string")
    || (value.merchantId !== null && typeof value.merchantId !== "string")
    || typeof value.occurredAt !== "string"
    || (value.note !== null && typeof value.note !== "string")
    || (value.status !== "POSTED" && value.status !== "PENDING")
  ) {
    return null;
  }

  return value as CreatedManualTransactionDTO<Type>;
}
