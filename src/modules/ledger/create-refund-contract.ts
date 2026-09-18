import { z } from "zod";

import { isCurrencyCode } from "@/money/currency";

const entityId = z.string().trim().uuid();
const workspaceId = z.string().trim().min(1).max(255);
const MAX_BIGINT = 9_223_372_036_854_775_807n;

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isCurrencyCode, "Currency must be a supported ISO 4217 monetary currency code.");

const positiveMinorUnits = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/, "Refund amount must be a positive integer minor-unit string.")
  .transform((value) => BigInt(value))
  .refine((value) => value <= MAX_BIGINT, "Refund amount must fit in PostgreSQL bigint.");


export const createRefundSchema = z.object({
  workspaceId,
  expenseTransactionId: entityId,
  amountMinor: positiveMinorUnits,
  currency,
  accountId: entityId.optional(),
  occurredAt: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .refine((value) => !Number.isNaN(value.getTime()), "Refund occurrence time must be valid."),
  note: z.string().trim().min(1).max(1_000).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  idempotencyKey: z.string().trim().uuid(),
}).strict();

export type CreateRefundInput = z.input<typeof createRefundSchema>;
export type CreateRefundCommand = z.output<typeof createRefundSchema>;

export type RefundStatus = "NONE" | "PARTIAL" | "FULL";

export type RefundedTransactionDTO = {
  readonly id: string;
  readonly kind: "REFUND";
  readonly status: "POSTED";
  readonly amountMinor: string;
  readonly currency: string;
  readonly accountId: string;
  readonly sourceExpenseId: string;
  readonly occurredAt: string;
  readonly note: string | null;
  readonly reason: string | null;
};

export type CreateRefundErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "TRANSACTION_NOT_FOUND"
  | "REFUND_NOT_ALLOWED"
  | "SOURCE_NOT_EXPENSE"
  | "TRANSACTION_NOT_CURRENT"
  | "EXPENSE_ALREADY_FULLY_REFUNDED"
  | "INVALID_REFUND_AMOUNT"
  | "REFUND_EXCEEDS_REMAINING_AMOUNT"
  | "INVALID_CURRENCY"
  | "INVALID_OCCURRED_AT"
  | "INVALID_NOTE"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_UNAVAILABLE"
  | "ACCOUNT_WORKSPACE_MISMATCH"
  | "CONCURRENT_MODIFICATION"
  | "REFUND_ALREADY_PROCESSED"
  | "REFUND_CREATE_FAILED";

export type CreateRefundResult =
  | {
      readonly ok: true;
      readonly refund: {
        readonly refundTransaction: RefundedTransactionDTO;
        readonly sourceExpenseId: string;
        readonly effectiveExpenseAmountMinor: string;
        readonly totalRefundedMinor: string;
        readonly remainingRefundableMinor: string;
        readonly refundStatus: RefundStatus;
      };
    }
  | { readonly ok: false; readonly code: CreateRefundErrorCode };
