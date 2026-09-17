import { z } from "zod";

import type { CurrencyCode } from "@/money/currency";

import type { LedgerTransactionStatus } from "./domain";
import {
  manualTransactionCommonCommandFields,
  manualTransactionEntityId,
  validateManualTransactionDate,
} from "./manual-transaction-contract";


export const createTransferSchema = z
  .object({
    ...manualTransactionCommonCommandFields,
    fromAccountId: manualTransactionEntityId,
    toAccountId: manualTransactionEntityId,
  })
  .strict()
  .superRefine(validateManualTransactionDate);

export type CreateTransferInput = z.input<typeof createTransferSchema>;


export type CreatedTransferDTO = {
  readonly id: string;
  readonly type: "TRANSFER";
  readonly transferGroupId: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly amountMinor: string;
  readonly currency: CurrencyCode;
  readonly occurredAt: string;
  readonly note: string | null;
  readonly status: LedgerTransactionStatus;
};

export type CreateTransferErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "FROM_ACCOUNT_NOT_FOUND"
  | "TO_ACCOUNT_NOT_FOUND"
  | "ACCOUNT_UNAVAILABLE"
  | "SAME_TRANSFER_ACCOUNT"
  | "INVALID_AMOUNT"
  | "INVALID_CURRENCY"
  | "CURRENCY_MISMATCH"
  | "CROSS_CURRENCY_TRANSFER_UNSUPPORTED"
  | "INVALID_OCCURRED_AT"
  | "INVALID_NOTE"
  | "TRANSFER_CREATE_FAILED";

export type CreateTransferResult =
  | { readonly ok: true; readonly transfer: CreatedTransferDTO }
  | { readonly ok: false; readonly code: CreateTransferErrorCode };
