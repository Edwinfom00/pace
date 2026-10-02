import { z } from "zod";

import { IMPORT_FIELDS } from "./domain";

const optionalColumnSchema = z.string().min(1).max(200).optional();
const accountAssignmentsSchema = z.record(z.string().min(1).max(180), z.string().min(1).max(180));

export const importMappingSchema = z
  .object({
    columns: z
      .object(
        Object.fromEntries(
          IMPORT_FIELDS.map((field) => [field, optionalColumnSchema]),
        ),
      )
      .partial(),
    amountMode: z.enum(["SIGNED", "DEBIT_CREDIT"]),
    signedAmountDirection: z
      .enum(["POSITIVE_IS_INCOME", "POSITIVE_IS_EXPENSE"])
      .nullable(),
    dateFormat: z.enum(["AUTO", "YMD", "DMY", "MDY"]),
    decimalSeparator: z.enum(["AUTO", ".", ","]),
    accountId: z.string().min(1).max(180),
    transferAccountId: z.string().min(1).max(180).nullable(),
    fallbackCurrency: z.string().length(3).nullable(),
    defaultExpenseCategoryId: z.string().min(1).max(180),
    defaultIncomeCategoryId: z.string().min(1).max(180),
    accountAssignments: accountAssignmentsSchema.optional(),
    transferAccountAssignments: accountAssignmentsSchema.optional(),
    skippedRowNumbers: z.array(z.number().int().positive()).max(10_000).optional(),
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

export const importColumnMappingRequestSchema = z
  .object({
    fileChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    columns: z
      .object(
        Object.fromEntries(
          IMPORT_FIELDS.map((field) => [field, optionalColumnSchema]),
        ),
      )
      .partial()
      .strict(),
    ignoredHeaders: z.array(z.string().min(1).max(200)).max(80),
  })
  .strict();

export const importMappingRequestSchema = z.object({
  mapping: importMappingSchema,
});

export const importReviewRequestSchema = z
  .object({
    accountId: z.string().min(1).max(180),
    transferAccountId: z.string().min(1).max(180).nullable(),
    accountAssignments: accountAssignmentsSchema.optional(),
    transferAccountAssignments: accountAssignmentsSchema.optional(),
    corrections: z
      .array(
        z
          .object({
            sourceRowNumber: z.number().int().positive(),
            field: z.enum(IMPORT_FIELDS),
            value: z.string().max(200),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    skipRows: z.array(z.number().int().positive()).max(500).optional(),
    restoreRows: z.array(z.number().int().positive()).max(500).optional(),
  })
  .strict();

export type ImportReviewRequest = z.infer<typeof importReviewRequestSchema>;
