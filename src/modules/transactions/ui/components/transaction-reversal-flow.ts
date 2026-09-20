import type { ReverseTransactionErrorCode } from "@/modules/ledger/reverse-transaction";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

export type TransactionReversalDraft = {
  readonly reason: string;
};

export type TransactionReversalFormError = "conflict" | "notAllowed" | "hasActiveRefunds" | "failed" | null;

/** The browser only prepares a command; the canonical F.1 endpoint authorizes it again. */
export function createTransactionReversalCommand(
  workspaceId: string,
  transaction: TransactionDetailData,
  draft: TransactionReversalDraft,
  idempotencyKey: string,
) {
  if (!transaction.capabilities.canReverse) return null;
  const reason = draft.reason.normalize("NFKC").trim();
  return {
    workspaceId,
    transactionId: transaction.id,
    expectedUpdatedAt: transaction.updatedAt,
    idempotencyKey,
    ...(reason ? { reason } : {}),
  };
}

export function mapTransactionReversalFailure(code: string | undefined): TransactionReversalFormError {
  switch (code as ReverseTransactionErrorCode | undefined) {
    case "TRANSACTION_REVERSAL_NOT_ALLOWED":
      return "notAllowed";
    case "TRANSACTION_HAS_ACTIVE_REFUNDS":
      return "hasActiveRefunds";
    case "TRANSACTION_ALREADY_REVERSED":
    case "TRANSACTION_NOT_CURRENT":
    case "CONCURRENT_MODIFICATION":
    case "REVERSAL_ALREADY_PROCESSED":
      return "conflict";
    default:
      return "failed";
  }
}

export function reversalErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const code = (payload as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** Only a successful canonical reversal payload may close the dialog. */
export function reversalResponseId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const reversal = (payload as { readonly reversal?: unknown }).reversal;
  if (!reversal || typeof reversal !== "object" || Array.isArray(reversal)) return null;
  const result = reversal as { readonly effectiveState?: unknown; readonly reversalTransaction?: unknown };
  if (result.effectiveState !== "REVERSED") return null;
  const reversalTransaction = result.reversalTransaction;
  if (!reversalTransaction || typeof reversalTransaction !== "object" || Array.isArray(reversalTransaction)) return null;
  const id = (reversalTransaction as { readonly id?: unknown }).id;
  return typeof id === "string" ? id : null;
}
