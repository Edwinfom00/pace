import { isCurrencyCode } from "@/money/currency";
import type { CreatedTransferDTO } from "@/modules/ledger/create-transfer-contract";
import type {
  TransactionFormDraft,
  TransactionFormErrors,
  TransactionFormField,
  TransferFormInput,
} from "@/modules/transactions/schemas/transaction-form.schema";

import {
  canReconcileCreatedManualTransaction,
  canStartManualTransactionSubmission,
  formatManualTransactionDate,
  manualTransactionReconciliationPlan,
  serverManualTransactionFieldErrors,
  submitCanonicalManualTransaction,
  type ManualTransactionCreationTransport,
} from "./manual-transaction-create-flow";

export type TransferCreateFailure = {
  readonly field?: TransactionFormField;
  readonly fields?: readonly TransactionFormField[];
  readonly code: string | undefined;
};

export function createTransferCommand(
  workspaceId: string,
  draft: Extract<TransferFormInput, { readonly kind: "TRANSFER" }>,
) {
  return {
    workspaceId,
    fromAccountId: draft.fromAccount,
    toAccountId: draft.toAccount,
    amount: draft.amount,
    currency: draft.currency,
    date: formatManualTransactionDate(draft.date),
    time: draft.time || undefined,
    note: draft.note || undefined,
  };
}

export type CreateTransferCommand = ReturnType<typeof createTransferCommand>;
export type TransferCreationTransport = ManualTransactionCreationTransport<CreateTransferCommand>;

export type TransferCreationResponse =
  | { readonly ok: true; readonly transfer: CreatedTransferDTO }
  | { readonly ok: false; readonly failure: TransferCreateFailure };

/** A success is valid only when C15A returns its persisted Transfer DTO. */
export async function submitCanonicalTransfer(
  command: CreateTransferCommand,
  transport: TransferCreationTransport,
): Promise<TransferCreationResponse> {
  const result = await submitCanonicalManualTransaction(
    command,
    transport,
    parseCreatedTransferDTO,
    mapTransferCreateFailure,
  );
  return result.ok
    ? { ok: true, transfer: result.transaction }
    : { ok: false, failure: result.failure };
}

export function mapTransferCreateFailure(code: string | undefined): TransferCreateFailure {
  switch (code) {
    case "FROM_ACCOUNT_NOT_FOUND":
      return { code, field: "fromAccount" };
    case "TO_ACCOUNT_NOT_FOUND":
    case "SAME_TRANSFER_ACCOUNT":
    case "CROSS_CURRENCY_TRANSFER_UNSUPPORTED":
      return { code, field: "toAccount" };
    case "ACCOUNT_UNAVAILABLE":
      // C15A intentionally returns a safe aggregate code, not the archived
      // account's identity. Mark both account controls rather than guessing.
      return { code, fields: ["fromAccount", "toAccount"] };
    case "INVALID_AMOUNT":
      return { code, field: "amount" };
    case "INVALID_CURRENCY":
    case "CURRENCY_MISMATCH":
      return { code, field: "currency" };
    case "INVALID_OCCURRED_AT":
      return { code, field: "date" };
    case "INVALID_NOTE":
      return { code, field: "note" };
    default:
      return { code };
  }
}

export function serverTransferFieldErrors(failure: TransferCreateFailure): TransactionFormErrors {
  const errors = serverManualTransactionFieldErrors(failure);
  if (!failure.fields) return errors;

  return failure.fields.reduce<TransactionFormErrors>((current, field) => ({
    ...current,
    ...serverManualTransactionFieldErrors({ field }),
  }), errors);
}

export function parseCreatedTransferDTO(payload: unknown): CreatedTransferDTO | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const transfer = (payload as { readonly transfer?: unknown }).transfer;
  if (!transfer || typeof transfer !== "object" || Array.isArray(transfer)) return null;
  const value = transfer as Record<string, unknown>;

  if (
    typeof value.id !== "string"
    || value.type !== "TRANSFER"
    || typeof value.transferGroupId !== "string"
    || typeof value.fromAccountId !== "string"
    || typeof value.toAccountId !== "string"
    || typeof value.amountMinor !== "string"
    || typeof value.currency !== "string"
    || !isCurrencyCode(value.currency)
    || typeof value.occurredAt !== "string"
    || (value.note !== null && typeof value.note !== "string")
    || (value.status !== "POSTED" && value.status !== "PENDING")
  ) {
    return null;
  }

  return value as CreatedTransferDTO;
}

export function canStartTransferSubmission(isSubmitting: boolean): boolean {
  return canStartManualTransactionSubmission(isSubmitting);
}

export function canReconcileCreatedTransfer(requestWorkspaceId: string, currentWorkspaceId: string): boolean {
  return canReconcileCreatedManualTransaction(requestWorkspaceId, currentWorkspaceId);
}

export function transferReconciliationPlan(requestWorkspaceId: string, currentWorkspaceId: string) {
  const reconciliation = manualTransactionReconciliationPlan(requestWorkspaceId, currentWorkspaceId);
  return {
    shouldAttachTransactionToList: reconciliation.shouldAttachTransactionToList,
    shouldCloseDialog: reconciliation.shouldCloseDialog,
    shouldRefreshData: reconciliation.shouldRefreshData,
    shouldResetTransferDraft: reconciliation.shouldResetDraft,
  } as const;
}

export function resetTransferTransactionDraft(
  draft: TransactionFormDraft,
  emptyTransferDraft: TransactionFormDraft["transfer"],
): TransactionFormDraft {
  return { ...draft, transfer: emptyTransferDraft };
}
