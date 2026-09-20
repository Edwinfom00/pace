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
  correctTransactionSchema,
  type CorrectedTransactionDTO,
  type CorrectTransactionErrorCode,
  type CorrectTransactionResult,
} from "./correct-transaction-contract";
import type { LedgerTransactionRecord } from "./domain";
import { LedgerService, type LedgerFinancialCorrectionResult } from "./ledger-service";
import { DatabaseLedgerRepository } from "./repositories/ledger-repository";

export {
  correctTransactionSchema,
  type CorrectedTransactionDTO,
  type CorrectTransactionErrorCode,
  type CorrectTransactionResult,
} from "./correct-transaction-contract";
export type { CorrectTransactionInput } from "./correct-transaction-contract";

type CorrectTransactionDependencies = {
  readonly ledger: Pick<LedgerService, "correctTransaction">;
};


export async function correctTransaction(input: unknown): Promise<CorrectTransactionResult> {
  const records = new DatabaseLedgerRepository();
  return correctTransactionForActor(await getAuthenticatedActor(), input, {
    ledger: new LedgerService(records, new DatabaseWorkspaceRepository()),
  });
}

export async function correctTransactionForActor(
  actor: AuthenticatedActor | null,
  input: unknown,
  dependencies: CorrectTransactionDependencies,
): Promise<CorrectTransactionResult> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = correctTransactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: correctionValidationErrorCode(parsed.error) };

  try {
    const result = await dependencies.ledger.correctTransaction(actor, parsed.data);
    return { ok: true, correction: presentCorrection(result) };
  } catch (error) {
    return { ok: false, code: correctionErrorCode(error) };
  }
}

function presentCorrection(result: LedgerFinancialCorrectionResult) {
  return {
    id: result.correction.id,
    reason: result.correction.reason,
    originalTransaction: presentCorrectedTransaction(result.originalTransaction),
    reversalTransaction: presentCorrectedTransaction(result.reversalTransaction),
    replacementTransaction: presentCorrectedTransaction(result.replacementTransaction),
  };
}

function presentCorrectedTransaction(transaction: LedgerTransactionRecord): CorrectedTransactionDTO {
  if (transaction.kind === "REFUND") {
    throw new Error("A refund cannot be part of a financial correction result.");
  }
  return {
    id: transaction.id,
    kind: transaction.kind,
    amountMinor: transaction.amountMinor.toString(),
    currency: transaction.currency,
    accountId: transaction.accountId,
    transferAccountId: transaction.transferAccountId,
    categoryId: transaction.categoryId,
    merchantId: transaction.merchantId,
    occurredAt: transaction.occurredAt.toISOString(),
    note: transaction.note,
    status: transaction.status,
    reversalOfTransactionId: transaction.reversalOfTransactionId,
  };
}

function correctionValidationErrorCode(error: z.ZodError): CorrectTransactionErrorCode {
  const paths = error.issues.map((issue) => issue.path.join("."));
  if (paths.some((path) => path.endsWith("amountMinor"))) return "INVALID_AMOUNT";
  if (paths.some((path) => path.endsWith("categoryId"))) return "INVALID_CATEGORY";
  if (paths.some((path) => path.endsWith("merchant") || path.endsWith("source"))) {
    return "INVALID_COUNTERPARTY";
  }
  if (paths.some((path) => path.includes("occurredAt") || path.endsWith("date") || path.endsWith("time"))) {
    return "INVALID_OCCURRED_AT";
  }
  return "INVALID_CORRECTION";
}

function correctionErrorCode(error: unknown): CorrectTransactionErrorCode {
  if (error instanceof AuthorizationError) return "WORKSPACE_FORBIDDEN";
  if (error instanceof NotFoundError) {
    if (error.message.startsWith("Transaction")) return "TRANSACTION_NOT_FOUND";
    if (/account/i.test(error.message)) return "ACCOUNT_NOT_FOUND";
  }
  if (error instanceof ConflictError) {
    if (error.message.startsWith("Archived accounts")) return "ACCOUNT_UNAVAILABLE";
    if (error.message.startsWith("Transaction currency")) return "CURRENCY_MISMATCH";
  }
  if (error instanceof DomainConflictError && isCorrectionErrorCode(error.code)) return error.code;
  return "TRANSACTION_CORRECTION_FAILED";
}

function isCorrectionErrorCode(value: string): value is Extract<
  CorrectTransactionErrorCode,
  | "TRANSACTION_CORRECTION_NOT_ALLOWED"
  | "TRANSACTION_ALREADY_REVERSED"
  | "TRANSACTION_NOT_CURRENT"
  | "CORRECTED_AMOUNT_BELOW_REFUNDED_TOTAL"
  | "INVALID_CORRECTION"
  | "INVALID_AMOUNT"
  | "INVALID_CATEGORY"
  | "CATEGORY_NOT_ALLOWED"
  | "INVALID_COUNTERPARTY"
  | "INVALID_OCCURRED_AT"
  | "ACCOUNT_WORKSPACE_MISMATCH"
  | "SAME_TRANSFER_ACCOUNT"
  | "CROSS_CURRENCY_TRANSFER_UNSUPPORTED"
  | "CONCURRENT_MODIFICATION"
  | "CORRECTION_ALREADY_PROCESSED"
> {
  return new Set<string>([
    "TRANSACTION_CORRECTION_NOT_ALLOWED",
    "TRANSACTION_ALREADY_REVERSED",
    "TRANSACTION_NOT_CURRENT",
    "CORRECTED_AMOUNT_BELOW_REFUNDED_TOTAL",
    "INVALID_CORRECTION",
    "INVALID_AMOUNT",
    "INVALID_CATEGORY",
    "CATEGORY_NOT_ALLOWED",
    "INVALID_COUNTERPARTY",
    "INVALID_OCCURRED_AT",
    "ACCOUNT_WORKSPACE_MISMATCH",
    "SAME_TRANSFER_ACCOUNT",
    "CROSS_CURRENCY_TRANSFER_UNSUPPORTED",
    "CONCURRENT_MODIFICATION",
    "CORRECTION_ALREADY_PROCESSED",
  ]).has(value);
}
