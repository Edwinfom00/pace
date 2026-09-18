import { z } from "zod";

import { validateManualTransactionDate } from "./manual-transaction-contract";
import type { LedgerTransactionKind } from "./domain";

const entityId = z.string().trim().uuid();
const workspaceId = z.string().trim().min(1).max(255);
const localDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTime = z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

const occurredAtPatch = z
  .object({
    date: localDate,
    time: localTime.nullish(),
  })
  .strict()
  .superRefine(validateManualTransactionDate);

function nullableNormalizedText(maxLength: number) {
  return z
    .string()
    .transform((value) => value.normalize("NFKC").trim())
    .refine((value) => value.length <= maxLength, `Must not exceed ${maxLength} characters.`)
    .transform((value) => value || null)
    .nullable();
}

const counterparty = nullableNormalizedText(160).optional();
const note = nullableNormalizedText(1_000).optional();
const categoryId = entityId.nullable().optional();

export const expenseTransactionDetailsPatchSchema = z
  .object({
    merchant: counterparty,
    categoryId,
    occurredAt: occurredAtPatch.optional(),
    note,
  })
  .strict();

export const incomeTransactionDetailsPatchSchema = z
  .object({
    source: counterparty,
    categoryId,
    occurredAt: occurredAtPatch.optional(),
    note,
  })
  .strict();

export const transferTransactionDetailsPatchSchema = z
  .object({
    occurredAt: occurredAtPatch.optional(),
    note,
  })
  .strict();

const refundTransactionDetailsPatchSchema = z.object({}).strict();


export const updateTransactionDetailsSchema = z
  .object({
    workspaceId,
    transactionId: entityId,
    /** The Detail DTO's `updatedAt` value, used as the optimistic lock token. */
    expectedUpdatedAt: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .refine((value) => !Number.isNaN(value.getTime()), "Must be a valid timestamp."),
    patch: z.unknown(),
  })
  .strict();

export type ExpenseTransactionDetailsPatch = z.output<typeof expenseTransactionDetailsPatchSchema>;
export type IncomeTransactionDetailsPatch = z.output<typeof incomeTransactionDetailsPatchSchema>;
export type TransferTransactionDetailsPatch = z.output<typeof transferTransactionDetailsPatchSchema>;
export type UpdateTransactionDetailsInput = z.input<typeof updateTransactionDetailsSchema>;
export type ParsedUpdateTransactionDetailsInput = z.output<typeof updateTransactionDetailsSchema>;
export type TransactionDetailsPatch =
  | ExpenseTransactionDetailsPatch
  | IncomeTransactionDetailsPatch
  | TransferTransactionDetailsPatch;

export function parseTransactionDetailsPatch(
  kind: LedgerTransactionKind,
  patch: unknown,
): TransactionDetailsPatch {
  switch (kind) {
    case "EXPENSE":
      return expenseTransactionDetailsPatchSchema.parse(patch);
    case "INCOME":
      return incomeTransactionDetailsPatchSchema.parse(patch);
    case "TRANSFER":
      return transferTransactionDetailsPatchSchema.parse(patch);
    case "REFUND":
      return refundTransactionDetailsPatchSchema.parse(patch);
  }
}

export type TransactionUpdateErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_EDIT_NOT_ALLOWED"
  | "INVALID_CATEGORY"
  | "CATEGORY_NOT_ALLOWED"
  | "INVALID_COUNTERPARTY"
  | "INVALID_OCCURRED_AT"
  | "CONCURRENT_MODIFICATION"
  | "TRANSACTION_UPDATE_FAILED";

export function transactionUpdateValidationErrorCode(
  error: z.ZodError,
): TransactionUpdateErrorCode {
  const fields = new Set(error.issues.map((issue) => issue.path[0]));
  // Strict-object errors store unknown keys in issue metadata instead of their
  // path. The serialized issue keeps the public error mapping deterministic.
  const mentions = (field: string) => fields.has(field) || error.issues.some((issue) => JSON.stringify(issue).includes(`\"${field}\"`));
  if (mentions("categoryId")) return "INVALID_CATEGORY";
  if (mentions("merchant") || mentions("source")) return "INVALID_COUNTERPARTY";
  if (fields.has("occurredAt") || fields.has("date") || fields.has("time")) {
    return "INVALID_OCCURRED_AT";
  }
  return "TRANSACTION_UPDATE_FAILED";
}
