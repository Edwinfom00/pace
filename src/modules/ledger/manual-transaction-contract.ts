import { z } from "zod";

import { isCurrencyCode, type CurrencyCode } from "@/money/currency";

import type { LedgerTransactionStatus } from "./domain";

const workspaceId = z.string().trim().min(1).max(255);
export const manualTransactionEntityId = z.string().trim().uuid();

export const manualTransactionIdempotencyKey = z.string().trim().uuid();
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isCurrencyCode, "Currency must be a supported ISO 4217 monetary currency code.");
const localDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTime = z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);


export const manualTransactionCommonCommandFields = {
  workspaceId,
  idempotencyKey: manualTransactionIdempotencyKey,
  amount: z.string().trim().min(1).max(80),
  currency,
  date: localDate,
  time: localTime.nullish(),
  note: z.string().trim().min(1).max(1_000).nullish(),
};

/** The common, untrusted form-command boundary for manual account transactions. */
export const manualTransactionCommandFields = {
  ...manualTransactionCommonCommandFields,
  accountId: manualTransactionEntityId,
  categoryId: manualTransactionEntityId.nullish(),
};

export function validateManualTransactionDate(
  value: { readonly date: string },
  context: z.RefinementCtx,
): void {
  const [year, month, day] = value.date.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    context.addIssue({ code: "custom", path: ["date"], message: "Date must be a real calendar date." });
  }
}

/** A JSON-safe canonical transaction representation returned by manual commands. */
export type CreatedManualTransactionDTO<Type extends "EXPENSE" | "INCOME"> = {
  readonly id: string;
  readonly type: Type;
  /** Exact minor units are serialized because bigint is not JSON-safe. */
  readonly amountMinor: string;
  readonly currency: CurrencyCode;
  readonly accountId: string;
  readonly categoryId: string | null;
  /** The canonical merchant/counterparty relation; Income source text resolves here. */
  readonly merchantId: string | null;
  readonly occurredAt: string;
  readonly note: string | null;
  readonly status: LedgerTransactionStatus;
};

export type ManualTransactionErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_UNAVAILABLE"
  | "INVALID_AMOUNT"
  | "INVALID_CURRENCY"
  | "CURRENCY_MISMATCH"
  | "CATEGORY_NOT_ALLOWED"
  | "INVALID_COUNTERPARTY"
  | "INVALID_OCCURRED_AT"
  | "INVALID_NOTE"
  | "IDEMPOTENCY_KEY_REUSED"
  | "TRANSACTION_CREATE_FAILED";
