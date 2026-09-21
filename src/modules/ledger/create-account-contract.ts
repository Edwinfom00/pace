import { z } from "zod";

import { isCurrencyCode, type CurrencyCode } from "@/money/currency";

import { LEDGER_ACCOUNT_TYPES, type LedgerAccountType } from "./domain";

const workspaceIdSchema = z.string().trim().min(1).max(255);
const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isCurrencyCode, "Currency must be a supported ISO 4217 monetary currency code.");

/**
 * Shared account-creation boundary. Both the browser and server use this
 * exact schema; the server remains the authoritative validation boundary.
 */
export const createAccountSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    name: z.string().trim().min(1).max(120),
    type: z.enum(LEDGER_ACCOUNT_TYPES),
    currency: currencySchema,
    // Kept temporarily so the pre-existing create-account surface fails
    // explicitly instead of silently losing money while no Opening Balance UI
    // has been approved. The canonical command requires effectiveAt.
    openingBalance: z.string().trim().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.openingBalance && value.openingBalance !== "") {
      context.addIssue({
        code: "custom",
        path: ["openingBalance"],
        message: "Opening balances require an effective date and must be set through the canonical command.",
      });
    }
  });

export type CreateAccountInput = z.input<typeof createAccountSchema>;

export type CreatedAccountDTO = {
  readonly id: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly currency: CurrencyCode;
};

export type CreateAccountErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "INVALID_ACCOUNT_NAME"
  | "INVALID_ACCOUNT_TYPE"
  | "INVALID_CURRENCY"
  | "INVALID_OPENING_BALANCE"
  | "OPENING_BALANCE_EFFECTIVE_AT_REQUIRED"
  | "ACCOUNT_CREATE_FAILED";

export type CreateAccountResult =
  | { readonly ok: true; readonly account: CreatedAccountDTO }
  | { readonly ok: false; readonly code: CreateAccountErrorCode };
