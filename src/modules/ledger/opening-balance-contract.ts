import { z } from "zod";

import { isCurrencyCode, type CurrencyCode } from "@/money/currency";

const entityId = z.string().trim().uuid();
const workspaceId = z.string().trim().min(1).max(255);
const idempotencyKey = z.string().trim().uuid();
const reason = z.string().trim().min(1).max(500).optional();
const expectedVersion = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), "Expected version must be a valid timestamp.")
  .optional();
const amountMinor = z
  .union([
    z.bigint(),
    z.string().trim().regex(/^-?\d+$/, "Amount must be an integer minor-unit string.").transform(BigInt),
  ])
  .refine(
    (value) => value >= -9_223_372_036_854_775_808n && value <= 9_223_372_036_854_775_807n,
    "Amount must fit in PostgreSQL bigint.",
  );
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isCurrencyCode, "Currency must be a supported ISO 4217 monetary currency code.")
  .transform((value) => value as CurrencyCode);
const effectiveAt = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), "effectiveAt must be a valid timestamp.");

export const setOpeningBalanceSchema = z.object({
  workspaceId,
  accountId: entityId,
  amountMinor,
  currency,
  effectiveAt,
  idempotencyKey,
}).strict();

export const correctOpeningBalanceSchema = z.object({
  workspaceId,
  accountId: entityId,
  newAmountMinor: amountMinor,
  reason,
  idempotencyKey,
  expectedVersion,
}).strict();

export type SetOpeningBalanceInput = z.input<typeof setOpeningBalanceSchema>;
export type SetOpeningBalanceCommand = z.output<typeof setOpeningBalanceSchema>;
export type CorrectOpeningBalanceInput = z.input<typeof correctOpeningBalanceSchema>;
export type CorrectOpeningBalanceCommand = z.output<typeof correctOpeningBalanceSchema>;

export type OpeningBalanceDTO = {
  readonly amountMinor: string;
  readonly currency: CurrencyCode;
  readonly effectiveAt: string;
  readonly hasBeenCorrected: boolean;
  /** Optimistic token for the server-only correction command. */
  readonly updatedAt: string;
};

export type SetOpeningBalanceErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_WORKSPACE_MISMATCH"
  | "ACCOUNT_UNAVAILABLE"
  | "OPENING_BALANCE_ALREADY_EXISTS"
  | "NEGATIVE_OPENING_BALANCE_NOT_ALLOWED"
  | "CURRENCY_MISMATCH"
  | "INVALID_OPENING_BALANCE"
  | "OPENING_BALANCE_ALREADY_PROCESSED"
  | "CONCURRENT_MODIFICATION"
  | "OPENING_BALANCE_FAILED";

export type CorrectOpeningBalanceErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_WORKSPACE_MISMATCH"
  | "ACCOUNT_UNAVAILABLE"
  | "OPENING_BALANCE_NOT_FOUND"
  | "NEGATIVE_OPENING_BALANCE_NOT_ALLOWED"
  | "INVALID_OPENING_BALANCE"
  | "CONCURRENT_MODIFICATION"
  | "OPENING_BALANCE_ALREADY_PROCESSED"
  | "OPENING_BALANCE_CORRECTION_FAILED";

export type SetOpeningBalanceResult =
  | { readonly ok: true; readonly openingBalance: OpeningBalanceDTO }
  | { readonly ok: false; readonly code: SetOpeningBalanceErrorCode };

export type CorrectOpeningBalanceResult =
  | { readonly ok: true; readonly openingBalance: OpeningBalanceDTO }
  | { readonly ok: false; readonly code: CorrectOpeningBalanceErrorCode };
