import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const editTransactionDraftSchema = z
  .object({
    amountText: optionalText(80),
    occurredAtText: optionalText(40),
    accountId: z.string().uuid().nullable().optional(),
    transferAccountId: z.string().uuid().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    merchantName: optionalText(160),
    note: optionalText(1_000),
  })
  .strict();

export const updatePreferredLanguageSchema = z
  .object({ language: z.enum(["en", "fr"]) })
  .strict();
