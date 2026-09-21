import { z } from "zod";

import {
  manualTransactionCommandFields,
  validateManualTransactionDate,
  type CreatedManualTransactionDTO,
} from "./manual-transaction-contract";
import type { InsufficientFundsDetails } from "./spendability-policy";

/**
 * The server command accepts civil date/time values from the transaction form.
 * They are resolved against the server-read workspace timezone, never a browser
 * timezone or a date-only UTC parse.
 */
export const createExpenseSchema = z
  .object({
    ...manualTransactionCommandFields,
    merchant: z.string().trim().min(1).max(160).nullish(),
  })
  .strict()
  .superRefine(validateManualTransactionDate);

export type CreateExpenseInput = z.input<typeof createExpenseSchema>;

export type CreatedExpenseDTO = CreatedManualTransactionDTO<"EXPENSE">;

export type CreateExpenseErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_UNAVAILABLE"
  | "ACCOUNT_SPENDABILITY_UNSUPPORTED"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_AMOUNT"
  | "INVALID_CURRENCY"
  | "CURRENCY_MISMATCH"
  | "CATEGORY_NOT_ALLOWED"
  | "INVALID_MERCHANT"
  | "INVALID_OCCURRED_AT"
  | "INVALID_NOTE"
  | "IDEMPOTENCY_KEY_REUSED"
  | "CONCURRENT_MODIFICATION"
  | "EXPENSE_CREATE_FAILED";

export type CreateExpenseResult =
  | { readonly ok: true; readonly expense: CreatedExpenseDTO }
  | { readonly ok: false; readonly code: CreateExpenseErrorCode; readonly details?: InsufficientFundsDetails };
