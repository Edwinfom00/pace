import {
  AuthorizationError,
  DomainConflictError,
  NotFoundError,
} from "@/authorization/errors";
import { getAuthenticatedActor, type AuthenticatedActor } from "@/authorization/session";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { LedgerTransactionRecord } from "./domain";
import { LedgerService, type LedgerFinancialReversalResult } from "./ledger-service";
import {
  reverseTransactionSchema,
  type ReversedTransactionDTO,
  type ReverseTransactionErrorCode,
  type ReverseTransactionResult,
} from "./reverse-transaction-contract";
import { DatabaseLedgerRepository } from "./repositories/ledger-repository";

export {
  reverseTransactionSchema,
  type ReversedTransactionDTO,
  type ReverseTransactionErrorCode,
  type ReverseTransactionResult,
} from "./reverse-transaction-contract";
export type { ReverseTransactionInput } from "./reverse-transaction-contract";

type ReverseTransactionDependencies = {
  readonly ledger: Pick<LedgerService, "reverseTransaction">;
};

export async function reverseTransaction(input: unknown): Promise<ReverseTransactionResult> {
  const records = new DatabaseLedgerRepository();
  return reverseTransactionForActor(await getAuthenticatedActor(), input, {
    ledger: new LedgerService(records, new DatabaseWorkspaceRepository()),
  });
}

export async function reverseTransactionForActor(
  actor: AuthenticatedActor | null,
  input: unknown,
  dependencies: ReverseTransactionDependencies,
): Promise<ReverseTransactionResult> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = reverseTransactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: reversalValidationErrorCode() };

  try {
    const result = await dependencies.ledger.reverseTransaction(actor, parsed.data);
    return { ok: true, reversal: presentReversal(result) };
  } catch (error) {
    return { ok: false, code: reversalErrorCode(error) };
  }
}

function presentReversal(result: LedgerFinancialReversalResult) {
  return {
    originalTransaction: presentTransaction(result.originalTransaction),
    reversalTransaction: presentTransaction(result.reversalTransaction),
    effectiveState: result.effectiveState,
  } as const;
}

function presentTransaction(transaction: LedgerTransactionRecord): ReversedTransactionDTO {
  if (transaction.kind === "REFUND") throw new Error("A refund cannot be part of a manual reversal result.");
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

function reversalValidationErrorCode(): ReverseTransactionErrorCode {
  return "INVALID_REVERSAL";
}

function reversalErrorCode(error: unknown): ReverseTransactionErrorCode {
  if (error instanceof AuthorizationError) return "WORKSPACE_FORBIDDEN";
  if (error instanceof NotFoundError && error.message.startsWith("Transaction")) return "TRANSACTION_NOT_FOUND";
  if (error instanceof DomainConflictError && isReversalErrorCode(error.code)) return error.code;
  return "TRANSACTION_REVERSAL_FAILED";
}

function isReversalErrorCode(value: string): value is Exclude<ReverseTransactionErrorCode, "UNAUTHENTICATED" | "WORKSPACE_FORBIDDEN" | "TRANSACTION_NOT_FOUND" | "INVALID_REVERSAL" | "TRANSACTION_REVERSAL_FAILED"> {
  return new Set<string>([
    "TRANSACTION_REVERSAL_NOT_ALLOWED",
    "TRANSACTION_ALREADY_REVERSED",
    "TRANSACTION_NOT_CURRENT",
    "TRANSACTION_HAS_ACTIVE_REFUNDS",
    "CONCURRENT_MODIFICATION",
    "REVERSAL_ALREADY_PROCESSED",
  ]).has(value);
}
