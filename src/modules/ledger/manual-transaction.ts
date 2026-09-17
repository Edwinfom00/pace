import { createHash } from "node:crypto";

import {
  AuthorizationError,
  ConflictError,
  DomainConflictError,
  NotFoundError,
} from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { getCurrencyExponent, toCurrencyCode, type CurrencyCode } from "@/money/currency";
import { parseDecimalMoney } from "@/money/money";
import { zonedLocalDateTimeToInstant } from "@/money/period";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { LedgerService } from "./ledger-service";
import type { LedgerTransactionRecord } from "./domain";
import { normalizeMerchantName } from "./domain";
import type {
  CreatedManualTransactionDTO,
  ManualTransactionErrorCode,
} from "./manual-transaction-contract";

type ManualTransactionKind = "EXPENSE" | "INCOME";

export type ValidManualTransactionCommand<Kind extends ManualTransactionKind> = {
  readonly workspaceId: string;
  readonly idempotencyKey: string;
  readonly accountId: string;
  readonly amount: string;
  readonly currency: string;
  readonly categoryId?: string | null;
  readonly counterparty?: string | null;
  readonly date: string;
  readonly time?: string | null;
  readonly note?: string | null;
  readonly kind: Kind;
};

export type CreateManualTransactionDependencies = {
  readonly ledger: Pick<LedgerService, "createTransactionIdempotently">;
  readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">;
};

export type CreateManualTransactionResult<Kind extends ManualTransactionKind> =
  | { readonly ok: true; readonly transaction: CreatedManualTransactionDTO<Kind> }
  | { readonly ok: false; readonly code: ManualTransactionErrorCode };


export async function createManualTransactionForActor<Kind extends ManualTransactionKind>(
  actor: AuthenticatedActor | null,
  input: ValidManualTransactionCommand<Kind>,
  dependencies: CreateManualTransactionDependencies,
): Promise<CreateManualTransactionResult<Kind>> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };

  const currency = toCurrencyCode(input.currency);
  const amount = parseManualTransactionAmount(input.amount, currency);
  if (!amount || amount.minor <= 0n) return { ok: false, code: "INVALID_AMOUNT" };

  // The trusted workspace context provides a deterministic timezone. LedgerService
  // remains the final authority for membership role and write permission checks.
  const workspace = await dependencies.workspaces.findMemberContext(input.workspaceId, actor.userId);
  if (!workspace) return { ok: false, code: "WORKSPACE_FORBIDDEN" };

  let occurredAt: Date;
  try {
    occurredAt = resolveManualOccurredAt(input.date, input.time ?? null, workspace.preferences.timezone);
  } catch {
    return { ok: false, code: "INVALID_OCCURRED_AT" };
  }

  try {
    const commandFingerprint = manualTransactionCommandFingerprint([
      ["kind", input.kind],
      ["accountId", input.accountId],
      ["categoryId", input.categoryId ?? null],
      ["counterparty", input.counterparty ? normalizeMerchantName(input.counterparty) : null],
      ["amountMinor", amount.minor.toString()],
      ["currency", currency],
      ["occurredAt", occurredAt.toISOString()],
      ["note", input.note ?? null],
    ]);
    const transaction = await dependencies.ledger.createTransactionIdempotently(actor, input.workspaceId, {
      kind: input.kind,
      status: "POSTED",
      accountId: input.accountId,
      categoryId: input.categoryId ?? undefined,
      merchantName: input.counterparty ?? undefined,
      amountMinor: amount.minor,
      currency,
      occurredAt,
      source: { provider: "manual", origin: "MANUAL", commandFingerprint },
      deduplicationFingerprint: manualTransactionFingerprint(actor.userId, input.idempotencyKey),
      note: input.note ?? undefined,
    });
    assertPersistedManualTransactionMatches(
      transaction,
      input,
      amount.minor,
      currency,
      occurredAt,
      actor.userId,
      commandFingerprint,
    );
    return { ok: true, transaction: toCreatedManualTransactionDTO(transaction, input.kind) };
  } catch (error) {
    return { ok: false, code: manualLedgerErrorCode(error) };
  }
}


/** The persisted retry fingerprint is actor-scoped and bounded in length. */
export function manualTransactionFingerprint(actorUserId: string, idempotencyKey: string): string {
  const digest = createHash("sha256")
    .update(`${actorUserId}:${idempotencyKey}`)
    .digest("hex");
  return `manual:${digest}`;
}


export function manualTransactionCommandFingerprint(
  fields: readonly (readonly [string, string | null])[],
): string {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

export function assertPersistedManualTransactionMatches<Kind extends ManualTransactionKind>(
  transaction: LedgerTransactionRecord,
  input: ValidManualTransactionCommand<Kind>,
  amountMinor: bigint,
  currency: CurrencyCode,
  occurredAt: Date,
  actorUserId: string,
  commandFingerprint: string,
): void {
  const matches =
    transaction.workspaceId === input.workspaceId
    && transaction.kind === input.kind
    && transaction.status === "POSTED"
    && transaction.amountMinor === amountMinor
    && transaction.currency === currency
    && transaction.accountId === input.accountId
    && transaction.transferAccountId === null
    && transaction.categoryId === (input.categoryId ?? null)
    && transaction.transferGroupId === null
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



export function resolveManualOccurredAt(date: string, time: string | null, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = (time ?? "12:00").split(":").map(Number);
  return zonedLocalDateTimeToInstant({ year, month, day }, { hour, minute }, timeZone);
}


/**
 * Converts familiar form decimal/grouping input to an exact decimal string
 * before it reaches the bigint Money parser. No floating-point value is used.
 */
export function parseManualTransactionAmount(value: string, currency: CurrencyCode | string) {
  const normalized = normalizeManualTransactionDecimal(value, getCurrencyExponent(currency));
  return normalized ? parseDecimalMoney(normalized, currency) : null;
}

function normalizeManualTransactionDecimal(value: string, exponent: number): string | null {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.startsWith("+")) return null;
  if (normalized.startsWith("-")) return /^-\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
  if (!/^[\d., ]+$/.test(normalized)) return null;

  const compact = normalized.replaceAll(" ", "");
  const commas = [...compact].filter((character) => character === ",").length;
  const dots = [...compact].filter((character) => character === ".").length;
  if (!commas && !dots) return /^\d+$/.test(compact) ? compact : null;

  if (commas && dots) {
    const decimal = compact.lastIndexOf(",") > compact.lastIndexOf(".") ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    const [integer, fraction] = splitDecimal(compact, decimal);
    if (!fraction || !isGroupedInteger(integer, grouping)) return null;
    return `${integer.replaceAll(grouping, "")}.${fraction}`;
  }

  const separator = commas ? "," : ".";
  const parts = compact.split(separator);
  if (parts.some((part) => !part)) return null;
  if (parts.length > 2) {
    return isGroupedInteger(compact, separator) ? parts.join("") : null;
  }

  const [integer, fraction] = parts;
  if (!integer || !fraction || !/^\d+$/.test(integer) || !/^\d+$/.test(fraction)) return null;
  // A lone three-digit suffix is familiar thousands grouping, even for a
  // three-decimal currency: 24,850 remains twenty-four thousand eight hundred fifty.
  if (fraction.length === 3 && isGroupedInteger(compact, separator)) return `${integer}${fraction}`;
  if (fraction.length > exponent) return null;
  return `${integer}.${fraction}`;
}

function splitDecimal(value: string, separator: "." | ","): [string, string] {
  const position = value.lastIndexOf(separator);
  return [value.slice(0, position), value.slice(position + 1)];
}

function isGroupedInteger(value: string, separator: string): boolean {
  const parts = value.split(separator);
  return /^\d{1,3}$/.test(parts[0] ?? "") && parts.slice(1).every((part) => /^\d{3}$/.test(part));
}

function toCreatedManualTransactionDTO<Kind extends ManualTransactionKind>(
  transaction: LedgerTransactionRecord,
  kind: Kind,
): CreatedManualTransactionDTO<Kind> {
  if (transaction.kind !== kind || !transaction.accountId) {
    throw new Error("Ledger returned a record incompatible with the manual transaction operation.");
  }
  return {
    id: transaction.id,
    type: kind,
    amountMinor: transaction.amountMinor.toString(),
    currency: toCurrencyCode(transaction.currency),
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
    merchantId: transaction.merchantId,
    occurredAt: transaction.occurredAt.toISOString(),
    note: transaction.note,
    status: transaction.status,
  };
}

export function manualValidationErrorCode(
  error: { readonly issues: readonly { readonly path: readonly PropertyKey[] }[] },
  counterpartyField: "merchant" | "source",
): ManualTransactionErrorCode {
  const fields = new Set(error.issues.map((issue) => issue.path[0]));
  if (fields.has("amount")) return "INVALID_AMOUNT";
  if (fields.has("currency")) return "INVALID_CURRENCY";
  if (fields.has("accountId")) return "ACCOUNT_NOT_FOUND";
  if (fields.has("categoryId")) return "CATEGORY_NOT_ALLOWED";
  if (fields.has(counterpartyField)) return "INVALID_COUNTERPARTY";
  if (fields.has("date") || fields.has("time")) return "INVALID_OCCURRED_AT";
  if (fields.has("note")) return "INVALID_NOTE";
  return "TRANSACTION_CREATE_FAILED";
}

function manualLedgerErrorCode(error: unknown): ManualTransactionErrorCode {
  if (error instanceof AuthorizationError) return "WORKSPACE_FORBIDDEN";
  if (error instanceof DomainConflictError && error.code === "IDEMPOTENCY_KEY_REUSED") {
    return "IDEMPOTENCY_KEY_REUSED";
  }
  if (error instanceof NotFoundError) {
    if (error.message.startsWith("Account")) return "ACCOUNT_NOT_FOUND";
    if (error.message.startsWith("Category")) return "CATEGORY_NOT_ALLOWED";
    if (error.message.startsWith("Merchant")) return "INVALID_COUNTERPARTY";
  }
  if (error instanceof ConflictError) {
    if (error.message.startsWith("Archived accounts")) return "ACCOUNT_UNAVAILABLE";
    if (error.message.startsWith("Transaction currency")) return "CURRENCY_MISMATCH";
  }
  return "TRANSACTION_CREATE_FAILED";
}
