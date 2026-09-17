import { z } from "zod";

import {
  manualTransactionCommandFields,
  validateManualTransactionDate,
  type CreatedManualTransactionDTO,
  type ManualTransactionErrorCode,
} from "./manual-transaction-contract";


export const createIncomeSchema = z
  .object({
    ...manualTransactionCommandFields,
    source: z.string().trim().min(1).max(160).nullish(),
  })
  .strict()
  .superRefine(validateManualTransactionDate);

export type CreateIncomeInput = z.input<typeof createIncomeSchema>;
export type CreatedIncomeDTO = CreatedManualTransactionDTO<"INCOME">;

export type CreateIncomeErrorCode = Exclude<ManualTransactionErrorCode, "INVALID_COUNTERPARTY"> | "INVALID_SOURCE";

export type CreateIncomeResult =
  | { readonly ok: true; readonly income: CreatedIncomeDTO }
  | { readonly ok: false; readonly code: CreateIncomeErrorCode };
