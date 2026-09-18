import { parseDecimalMoney, toDecimalString } from "@/money/money";
import { toCurrencyCode } from "@/money/currency";
import type { CreateRefundErrorCode } from "@/modules/ledger/create-refund-contract";
import type { TransactionAccountOption } from "@/modules/transactions/domain/transaction-account-options";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

export type TransactionRefundDraft = {
  readonly amount: string;
  readonly accountId: string;
  readonly reason: string;
  readonly note: string;
  readonly occurredAt: string;
};

export type TransactionRefundFieldErrors = {
  readonly amount?: "required" | "positive" | "invalid" | "exceeds";
  readonly account?: "required" | "unavailable";
  readonly currency?: "invalid";
};

export type TransactionRefundFormError = "changed" | "fullyRefunded" | "notAllowed" | "failed" | null;

export function createTransactionRefundDraft(transaction: TransactionDetailData, occurredAt: string): TransactionRefundDraft | null {
  const summary = transaction.refund;
  if (!summary) return null;
  return {
    amount: toDecimalString({ currency: toCurrencyCode(summary.remainingRefundableAmount.currency), minor: BigInt(summary.remainingRefundableAmount.minor) }),
    accountId: summary.sourceAccount?.id ?? transaction.account?.id ?? "",
    reason: "",
    note: "",
    occurredAt,
  };
}

export function validateTransactionRefundDraft(
  transaction: TransactionDetailData,
  draft: TransactionRefundDraft,
  accounts: readonly TransactionAccountOption[],
): TransactionRefundFieldErrors {
  const summary = transaction.refund;
  if (!summary) return { amount: "invalid" };
  const amount = parseDecimalMoney(draft.amount, summary.remainingRefundableAmount.currency);
  if (!draft.amount.normalize("NFKC").trim()) return { amount: "required" };
  if (!amount) return { amount: "invalid" };
  if (amount.minor <= 0n) return { amount: "positive" };
  if (amount.minor > BigInt(summary.remainingRefundableAmount.minor)) return { amount: "exceeds" };
  if (!draft.accountId) return { account: "required" };
  const account = accounts.find((candidate) => candidate.id === draft.accountId);
  if (!account || account.currency !== toCurrencyCode(summary.remainingRefundableAmount.currency)) return { account: "unavailable" };
  return {};
}

export function createTransactionRefundCommand(
  workspaceId: string,
  transaction: TransactionDetailData,
  draft: TransactionRefundDraft,
  idempotencyKey: string,
) {
  const summary = transaction.refund;
  if (!summary) return null;
  const amount = parseDecimalMoney(draft.amount, summary.remainingRefundableAmount.currency);
  if (!amount || amount.minor <= 0n) return null;
  const reason = draft.reason.normalize("NFKC").trim();
  const note = draft.note.normalize("NFKC").trim();
  return {
    workspaceId,
    expenseTransactionId: transaction.id,
    amountMinor: amount.minor.toString(),
    currency: summary.remainingRefundableAmount.currency,
    accountId: draft.accountId,
    occurredAt: draft.occurredAt,
    ...(reason ? { reason } : {}),
    ...(note ? { note } : {}),
    idempotencyKey,
  };
}

export function refundPreview(transaction: TransactionDetailData, amountText: string) {
  const summary = transaction.refund;
  if (!summary) return null;
  const amount = parseDecimalMoney(amountText, summary.remainingRefundableAmount.currency);
  if (!amount || amount.minor <= 0n || amount.minor > BigInt(summary.remainingRefundableAmount.minor)) return null;
  const remainingMinor = BigInt(summary.remainingRefundableAmount.minor) - amount.minor;
  return {
    amount: { currency: summary.remainingRefundableAmount.currency, minor: amount.minor.toString() },
    remaining: { currency: summary.remainingRefundableAmount.currency, minor: remainingMinor.toString() },
    status: remainingMinor === 0n ? "FULL" as const : "PARTIAL" as const,
  };
}

export function mapTransactionRefundFailure(code: string | undefined): {
  readonly fieldErrors: TransactionRefundFieldErrors;
  readonly formError: TransactionRefundFormError;
} {
  switch (code as CreateRefundErrorCode | undefined) {
    case "INVALID_REFUND_AMOUNT": return { fieldErrors: { amount: "invalid" }, formError: null };
    case "REFUND_EXCEEDS_REMAINING_AMOUNT": return { fieldErrors: { amount: "exceeds" }, formError: "changed" };
    case "INVALID_CURRENCY": return { fieldErrors: { currency: "invalid" }, formError: "notAllowed" };
    case "ACCOUNT_NOT_FOUND":
    case "ACCOUNT_UNAVAILABLE":
    case "ACCOUNT_WORKSPACE_MISMATCH": return { fieldErrors: { account: "unavailable" }, formError: null };
    case "CONCURRENT_MODIFICATION":
    case "TRANSACTION_NOT_CURRENT":
    case "SOURCE_NOT_EXPENSE":
    case "REFUND_ALREADY_PROCESSED": return { fieldErrors: {}, formError: "changed" };
    case "EXPENSE_ALREADY_FULLY_REFUNDED": return { fieldErrors: {}, formError: "fullyRefunded" };
    case "REFUND_NOT_ALLOWED": return { fieldErrors: {}, formError: "notAllowed" };
    default: return { fieldErrors: {}, formError: "failed" };
  }
}

export function refundResponseId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const refund = (payload as { readonly refund?: unknown }).refund;
  if (!refund || typeof refund !== "object" || Array.isArray(refund)) return null;
  const refundTransaction = (refund as { readonly refundTransaction?: unknown }).refundTransaction;
  if (!refundTransaction || typeof refundTransaction !== "object" || Array.isArray(refundTransaction)) return null;
  const id = (refundTransaction as { readonly id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

export function refundErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const code = (payload as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
