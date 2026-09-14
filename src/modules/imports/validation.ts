import { z } from "zod";

import { IMPORT_FIELDS } from "./domain";

const optionalColumnSchema = z.string().min(1).max(200).optional();

export const importMappingSchema = z
  .object({
    columns: z
      .object(Object.fromEntries(IMPORT_FIELDS.map((field) => [field, optionalColumnSchema])))
      .partial(),
    amountMode: z.enum(["SIGNED", "DEBIT_CREDIT"]),
    signedAmountDirection: z.enum(["POSITIVE_IS_INCOME", "POSITIVE_IS_EXPENSE"]).nullable(),
    dateFormat: z.enum(["AUTO", "YMD", "DMY", "MDY"]),
    decimalSeparator: z.enum(["AUTO", ".", ","]),
    accountId: z.string().min(1).max(180),
    transferAccountId: z.string().min(1).max(180).nullable(),
    fallbackCurrency: z.string().length(3).nullable(),
    defaultExpenseCategoryId: z.string().min(1).max(180),
    defaultIncomeCategoryId: z.string().min(1).max(180),
  })
  .superRefine((mapping, context) => {
    if (!mapping.columns.transactionDate && !mapping.columns.bookingDate) {
      context.addIssue({
        code: "custom",
        path: ["columns", "transactionDate"],
        message: "Map either a transaction date or booking date column.",
      });
    }
    if (mapping.amountMode === "SIGNED" && !mapping.columns.amount) {
      context.addIssue({
        code: "custom",
        path: ["columns", "amount"],
        message: "A signed amount column is required.",
      });
    }
    if (mapping.amountMode === "SIGNED" && !mapping.signedAmountDirection) {
      context.addIssue({
        code: "custom",
        path: ["signedAmountDirection"],
        message: "Choose how signed amounts represent income and expenses.",
      });
    }
    if (
      mapping.amountMode === "DEBIT_CREDIT" &&
      !mapping.columns.debit &&
      !mapping.columns.credit
    ) {
      context.addIssue({
        code: "custom",
        path: ["columns", "debit"],
        message: "Map at least one debit or credit column.",
      });
    }
  });

export const importMappingRequestSchema = z.object({ mapping: importMappingSchema });
