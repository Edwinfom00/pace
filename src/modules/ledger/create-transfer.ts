import {
  AuthorizationError,
  ConflictError,
  DomainConflictError,
  NotFoundError,
} from "@/authorization/errors";
import { getAuthenticatedActor, type AuthenticatedActor } from "@/authorization/session";
import { toCurrencyCode } from "@/money/currency";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  createTransferSchema,
  type CreatedTransferDTO,
  type CreateTransferErrorCode,
  type CreateTransferResult,
} from "./create-transfer-contract";
import type { LedgerTransactionRecord } from "./domain";
import { getLedgerService } from "./server";
import {
  AccountSpendabilityUnsupportedError,
  insufficientFundsDetails,
  InsufficientFundsError,
} from "./spendability-policy";
import {
  manualTransactionCommandFingerprint,
  manualTransactionFingerprint,
  parseManualTransactionAmount,
  resolveManualOccurredAt,
} from "./manual-transaction";
import type { CreateManualTransactionDependencies } from "./manual-transaction";

export {
  createTransferSchema,
  type CreatedTransferDTO,
  type CreateTransferErrorCode,
  type CreateTransferResult,
} from "./create-transfer-contract";
export type { CreateTransferInput } from "./create-transfer-contract";

type CreateTransferDependencies = CreateManualTransactionDependencies;

export async function createTransfer(input: unknown): Promise<CreateTransferResult> {
  return createTransferForActor(await getAuthenticatedActor(), input, {
    ledger: getLedgerService(),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}

export async function createTransferForActor(
  actor: AuthenticatedActor | null,
  input: unknown,
  dependencies: CreateTransferDependencies,
): Promise<CreateTransferResult> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = createTransferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: transferValidationErrorCode(parsed.error) };
  if (parsed.data.fromAccountId === parsed.data.toAccountId) {
    return { ok: false, code: "SAME_TRANSFER_ACCOUNT" };
  }

  const currency = toCurrencyCode(parsed.data.currency);
  const amount = parseManualTransactionAmount(parsed.data.amount, currency);
  if (!amount || amount.minor <= 0n) return { ok: false, code: "INVALID_AMOUNT" };


  const workspace = await dependencies.workspaces.findMemberContext(parsed.data.workspaceId, actor.userId);
  if (!workspace) return { ok: false, code: "WORKSPACE_FORBIDDEN" };

  let occurredAt: Date;
  try {
    occurredAt = resolveManualOccurredAt(
      parsed.data.date,
      parsed.data.time ?? null,
      workspace.preferences.timezone,
    );
  } catch {
    return { ok: false, code: "INVALID_OCCURRED_AT" };
  }

  try {
    const commandFingerprint = manualTransactionCommandFingerprint([
      ["kind", "TRANSFER"],
      ["fromAccountId", parsed.data.fromAccountId],
      ["toAccountId", parsed.data.toAccountId],
      ["amountMinor", amount.minor.toString()],
      ["currency", currency],
      ["occurredAt", occurredAt.toISOString()],
      ["note", parsed.data.note ?? null],
    ]);
    const transaction = await dependencies.ledger.createTransactionIdempotently(actor, parsed.data.workspaceId, {
      kind: "TRANSFER",
      status: "POSTED",
      accountId: parsed.data.fromAccountId,
      transferAccountId: parsed.data.toAccountId,
      amountMinor: amount.minor,
      currency,
      occurredAt,
      source: { provider: "manual", origin: "MANUAL", commandFingerprint },
      deduplicationFingerprint: manualTransactionFingerprint(actor.userId, parsed.data.idempotencyKey),
      note: parsed.data.note ?? undefined,
    });
    assertPersistedTransferMatches(
      transaction,
      parsed.data,
      amount.minor,
      currency,
      occurredAt,
      actor.userId,
      commandFingerprint,
    );
    return { ok: true, transfer: toCreatedTransferDTO(transaction) };
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      return { ok: false, code: "INSUFFICIENT_FUNDS", details: insufficientFundsDetails(error.spendability) };
    }
    return { ok: false, code: transferLedgerErrorCode(error) };
  }
}

export const parseTransferAmount = parseManualTransactionAmount;
export const resolveTransferOccurredAt = resolveManualOccurredAt;

function transferValidationErrorCode(
  error: { readonly issues: readonly { readonly path: readonly PropertyKey[] }[] },
): CreateTransferErrorCode {
  const fields = new Set(error.issues.map((issue) => issue.path[0]));
  if (fields.has("fromAccountId")) return "FROM_ACCOUNT_NOT_FOUND";
  if (fields.has("toAccountId")) return "TO_ACCOUNT_NOT_FOUND";
  if (fields.has("amount")) return "INVALID_AMOUNT";
  if (fields.has("currency")) return "INVALID_CURRENCY";
  if (fields.has("date") || fields.has("time")) return "INVALID_OCCURRED_AT";
  if (fields.has("note")) return "INVALID_NOTE";
  return "TRANSFER_CREATE_FAILED";
}

function transferLedgerErrorCode(error: unknown): CreateTransferErrorCode {
  if (error instanceof AuthorizationError) return "WORKSPACE_FORBIDDEN";
  if (error instanceof InsufficientFundsError) return "INSUFFICIENT_FUNDS";
  if (error instanceof AccountSpendabilityUnsupportedError) return "ACCOUNT_SPENDABILITY_UNSUPPORTED";
  if (error instanceof DomainConflictError) {
    if (error.code === "SAME_TRANSFER_ACCOUNT") return "SAME_TRANSFER_ACCOUNT";
    if (error.code === "CROSS_CURRENCY_TRANSFER_UNSUPPORTED") {
      return "CROSS_CURRENCY_TRANSFER_UNSUPPORTED";
    }
    if (error.code === "IDEMPOTENCY_KEY_REUSED") return "IDEMPOTENCY_KEY_REUSED";
    if (error.code === "CONCURRENT_MODIFICATION") return "CONCURRENT_MODIFICATION";
    if (error.code === "ACCOUNT_UNAVAILABLE") return "ACCOUNT_UNAVAILABLE";
  }
  if (error instanceof NotFoundError) {
    if (error.message.startsWith("From account")) return "FROM_ACCOUNT_NOT_FOUND";
    if (error.message.startsWith("To account")) return "TO_ACCOUNT_NOT_FOUND";
  }
  if (error instanceof ConflictError) {
    if (error.message.startsWith("Archived accounts")) return "ACCOUNT_UNAVAILABLE";
    if (error.message.startsWith("Transaction currency")) return "CURRENCY_MISMATCH";
  }
  return "TRANSFER_CREATE_FAILED";
}

function assertPersistedTransferMatches(
  transaction: LedgerTransactionRecord,
  input: import("./create-transfer-contract").CreateTransferInput,
  amountMinor: bigint,
  currency: string,
  occurredAt: Date,
  actorUserId: string,
  commandFingerprint: string,
): void {
  const matches =
    transaction.workspaceId === input.workspaceId
    && transaction.kind === "TRANSFER"
    && transaction.status === "POSTED"
    && transaction.amountMinor === amountMinor
    && transaction.currency === currency
    && transaction.accountId === input.fromAccountId
    && transaction.transferAccountId === input.toAccountId
    && transaction.categoryId === null
    && transaction.merchantId === null
    && transaction.transferGroupId !== null
    && transaction.refundedTransactionId === null
    && transaction.createdByUserId === actorUserId
    && transaction.occurredAt.getTime() === occurredAt.getTime()
    && transaction.note === (input.note ?? null)
    && transaction.source.provider === "manual"
    && transaction.source.origin === "MANUAL"
    && transaction.source.commandFingerprint === commandFingerprint
    && transaction.deduplicationFingerprint === manualTransactionFingerprint(actorUserId, input.idempotencyKey);

  if (!matches) {
    throw new DomainConflictError(
      "IDEMPOTENCY_KEY_REUSED",
      "This submission key has already been used for a different transaction.",
    );
  }
}

function toCreatedTransferDTO(transaction: LedgerTransactionRecord): CreatedTransferDTO {
  if (
    transaction.kind !== "TRANSFER"
    || !transaction.accountId
    || !transaction.transferAccountId
    || !transaction.transferGroupId
  ) {
    throw new Error("Ledger returned a record incompatible with the manual transfer operation.");
  }

  return {
    id: transaction.id,
    type: "TRANSFER",
    transferGroupId: transaction.transferGroupId,
    fromAccountId: transaction.accountId,
    toAccountId: transaction.transferAccountId,
    amountMinor: transaction.amountMinor.toString(),
    currency: toCurrencyCode(transaction.currency),
    occurredAt: transaction.occurredAt.toISOString(),
    note: transaction.note,
    status: transaction.status,
  };
}
