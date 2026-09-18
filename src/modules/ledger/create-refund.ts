import { z } from "zod";

import {
  AuthorizationError,
  ConflictError,
  DomainConflictError,
  NotFoundError,
} from "@/authorization/errors";
import { getAuthenticatedActor, type AuthenticatedActor } from "@/authorization/session";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  createRefundSchema,
  type CreateRefundErrorCode,
  type CreateRefundResult,
} from "./create-refund-contract";
import { LedgerService, type LedgerFinancialRefundResult } from "./ledger-service";
import { DatabaseLedgerRepository } from "./repositories/ledger-repository";

export {
  createRefundSchema,
  type CreateRefundErrorCode,
  type CreateRefundResult,
  type RefundedTransactionDTO,
  type RefundStatus,
} from "./create-refund-contract";
export type { CreateRefundInput } from "./create-refund-contract";

type CreateRefundDependencies = {
  readonly ledger: Pick<LedgerService, "createRefund">;
};

/** Server/domain entry point. No UI calls are introduced by this operation. */
export async function createRefund(input: unknown): Promise<CreateRefundResult> {
  const records = new DatabaseLedgerRepository();
  return createRefundForActor(await getAuthenticatedActor(), input, {
    ledger: new LedgerService(records, new DatabaseWorkspaceRepository()),
  });
}

export async function createRefundForActor(
  actor: AuthenticatedActor | null,
  input: unknown,
  dependencies: CreateRefundDependencies,
): Promise<CreateRefundResult> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = createRefundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: refundValidationErrorCode(parsed.error) };

  try {
    const refund = await dependencies.ledger.createRefund(actor, parsed.data);
    return { ok: true, refund: presentRefund(refund) };
  } catch (error) {
    return { ok: false, code: refundErrorCode(error) };
  }
}

function presentRefund(result: LedgerFinancialRefundResult) {
  const transaction = result.refundTransaction;
  if (
    transaction.kind !== "REFUND"
    || transaction.status !== "POSTED"
    || !transaction.accountId
    || !transaction.refundedTransactionId
  ) {
    throw new Error("Ledger returned a record incompatible with the refund operation.");
  }
  const refund = transaction.source.refund;
  const reason = refund && typeof refund === "object" && !Array.isArray(refund)
    && typeof (refund as Record<string, unknown>).reason === "string"
    ? (refund as Record<string, string>).reason
    : null;
  return {
    refundTransaction: {
      id: transaction.id,
      kind: "REFUND" as const,
      status: "POSTED" as const,
      amountMinor: transaction.amountMinor.toString(),
      currency: transaction.currency,
      accountId: transaction.accountId,
      sourceExpenseId: transaction.refundedTransactionId,
      occurredAt: transaction.occurredAt.toISOString(),
      note: transaction.note,
      reason,
    },
    sourceExpenseId: result.sourceExpenseId,
    effectiveExpenseAmountMinor: result.effectiveExpenseAmountMinor.toString(),
    totalRefundedMinor: result.totalRefundedMinor.toString(),
    remainingRefundableMinor: result.remainingRefundableMinor.toString(),
    refundStatus: result.refundStatus,
  };
}

function refundValidationErrorCode(error: z.ZodError): CreateRefundErrorCode {
  const paths = new Set(error.issues.map((issue) => issue.path.join(".")));
  if (paths.has("amountMinor")) return "INVALID_REFUND_AMOUNT";
  if (paths.has("currency")) return "INVALID_CURRENCY";
  if (paths.has("occurredAt")) return "INVALID_OCCURRED_AT";
  if (paths.has("note")) return "INVALID_NOTE";
  if (paths.has("accountId")) return "ACCOUNT_NOT_FOUND";
  return "REFUND_CREATE_FAILED";
}

function refundErrorCode(error: unknown): CreateRefundErrorCode {
  if (error instanceof AuthorizationError) return "WORKSPACE_FORBIDDEN";
  if (error instanceof NotFoundError) {
    if (error.message.startsWith("Transaction")) return "TRANSACTION_NOT_FOUND";
    if (/account/i.test(error.message)) return "ACCOUNT_NOT_FOUND";
  }
  if (error instanceof ConflictError) {
    if (error.message.startsWith("Archived accounts")) return "ACCOUNT_UNAVAILABLE";
    if (error.message.startsWith("Transaction currency")) return "INVALID_CURRENCY";
  }
  if (error instanceof DomainConflictError && isRefundErrorCode(error.code)) return error.code;
  return "REFUND_CREATE_FAILED";
}

function isRefundErrorCode(value: string): value is Exclude<
  CreateRefundErrorCode,
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "TRANSACTION_NOT_FOUND"
  | "INVALID_OCCURRED_AT"
  | "INVALID_NOTE"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_UNAVAILABLE"
  | "REFUND_CREATE_FAILED"
> {
  return new Set<string>([
    "REFUND_NOT_ALLOWED",
    "SOURCE_NOT_EXPENSE",
    "TRANSACTION_NOT_CURRENT",
    "EXPENSE_ALREADY_FULLY_REFUNDED",
    "INVALID_REFUND_AMOUNT",
    "REFUND_EXCEEDS_REMAINING_AMOUNT",
    "INVALID_CURRENCY",
    "ACCOUNT_WORKSPACE_MISMATCH",
    "CONCURRENT_MODIFICATION",
    "REFUND_ALREADY_PROCESSED",
  ]).has(value);
}
