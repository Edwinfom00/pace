import { z } from "zod";

import { isCurrencyCode, type CurrencyCode } from "@/money/currency";

import type { LedgerTransactionStatus } from "./domain";

const workspaceId = z.string().trim().min(1).max(255);
const entityId = z.string().trim().uuid();
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isCurrencyCode, "Currency must be a supported ISO 4217 monetary currency code.");
const localDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTime = z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

/**
 * The server command accepts civil date/time values from the transaction form.
 * They are resolved against the server-read workspace timezone, never a browser
 * timezone or a date-only UTC parse.
 */
export const createExpenseSchema = z
  .object({
    workspaceId,
    accountId: entityId,
    amount: z.string().trim().min(1).max(80),
    currency,
    categoryId: entityId.nullish(),
    merchant: z.string().trim().min(1).max(160).nullish(),
    date: localDate,
    time: localTime.nullish(),
    note: z.string().trim().min(1).max(1_000).nullish(),
  })
  .strict()
  .superRefine((value, context) => {
    const [year, month, day] = value.date.split("-").map(Number);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
      candidate.getUTCFullYear() !== year
      || candidate.getUTCMonth() !== month - 1
      || candidate.getUTCDate() !== day
    ) {
      context.addIssue({ code: "custom", path: ["date"], message: "Date must be a real calendar date." });
    }
  });

export type CreateExpenseInput = z.input<typeof createExpenseSchema>;

export type CreatedExpenseDTO = {
  readonly id: string;
  readonly type: "EXPENSE";
  /** Exact minor units are serialized because bigint is not JSON-safe. */
  readonly amountMinor: string;
  readonly currency: CurrencyCode;
  readonly accountId: string;
  readonly categoryId: string | null;
  readonly merchantId: string | null;
  readonly occurredAt: string;
  readonly note: string | null;
  readonly status: LedgerTransactionStatus;
};

export type CreateExpenseErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_UNAVAILABLE"
  | "INVALID_AMOUNT"
  | "INVALID_CURRENCY"
  | "CURRENCY_MISMATCH"
  | "CATEGORY_NOT_ALLOWED"
  | "INVALID_MERCHANT"
  | "INVALID_OCCURRED_AT"
  | "INVALID_NOTE"
  | "EXPENSE_CREATE_FAILED";

export type CreateExpenseResult =
  | { readonly ok: true; readonly expense: CreatedExpenseDTO }
  | { readonly ok: false; readonly code: CreateExpenseErrorCode };
