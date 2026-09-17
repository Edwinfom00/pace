import { z } from "zod";

import { isCurrencyCode } from "@/money/currency";

import {
  LEDGER_ACCOUNT_TYPES,
  LEDGER_CATEGORY_KINDS,
  LEDGER_TRANSACTION_STATUSES,
} from "./domain";

const id = z.string().trim().uuid();
const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isCurrencyCode, "Currency must be a supported ISO 4217 monetary currency code.");
const date = z.coerce.date();
const minorUnits = z
  .union([
    z.bigint(),
    z
      .string()
      .trim()
      .regex(/^[1-9]\d*$/, "Amount must be a positive integer minor-unit string.")
      .transform((value) => BigInt(value)),
  ])
  .refine((value) => value > 0n && value <= 9_223_372_036_854_775_807n, {
    message: "Amount must fit in PostgreSQL bigint and be greater than zero.",
  });

type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.boolean(), z.number().finite(), z.string(), z.null(), z.array(jsonValue), z.record(z.string(), jsonValue)]),
);
const sourceMetadata = z.record(z.string().min(1).max(120), jsonValue);

const transactionFields = {
  status: z.enum(LEDGER_TRANSACTION_STATUSES).default("POSTED"),
  amountMinor: minorUnits,
  currency: currencyCode,
  occurredAt: date,
  paidByUserId: id.optional(),
  source: sourceMetadata.default({}),
  deduplicationFingerprint: z.string().trim().min(1).max(128).optional(),
  note: z.string().trim().min(1).max(1_000).optional(),
};

export const createLedgerAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.enum(LEDGER_ACCOUNT_TYPES),
    currency: currencyCode,
    openingBalanceMinor: z
      .union([
        z.bigint(),
        z
          .string()
          .trim()
          .regex(/^-?\d+$/, "Opening balance must be an integer minor-unit string.")
          .transform((value) => BigInt(value)),
      ])
      .refine((value) => value >= -9_223_372_036_854_775_808n && value <= 9_223_372_036_854_775_807n, {
        message: "Opening balance must fit in PostgreSQL bigint.",
      })
      .default(0n),
  })
  .strict();

export const createLedgerCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(LEDGER_CATEGORY_KINDS),
  })
  .strict();

export const createLedgerMerchantSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
  })
  .strict();

export const createLedgerTransactionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("EXPENSE"),
      ...transactionFields,
      accountId: id,
      categoryId: id,
      merchantId: id.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("INCOME"),
      ...transactionFields,
      accountId: id,
      categoryId: id,
      merchantId: id.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("TRANSFER"),
      ...transactionFields,
      accountId: id,
      transferAccountId: id,
      transferGroupId: id.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("REFUND"),
      ...transactionFields,
      accountId: id,
      refundedTransactionId: id,
    })
    .strict(),
]);

export const listLedgerTransactionsSchema = z
  .object({
    status: z.enum(LEDGER_TRANSACTION_STATUSES).optional(),
    accountId: id.optional(),
    categoryId: id.optional(),
    merchantId: id.optional(),
    occurredFrom: date.optional(),
    occurredTo: date.optional(),
  })
  .strict()
  .refine(
    (value) => !value.occurredFrom || !value.occurredTo || value.occurredFrom <= value.occurredTo,
    "occurredFrom must not be after occurredTo.",
  );

export type CreateLedgerAccountInput = z.output<typeof createLedgerAccountSchema>;
export type CreateLedgerCategoryInput = z.output<typeof createLedgerCategorySchema>;
export type CreateLedgerMerchantInput = z.output<typeof createLedgerMerchantSchema>;
export type CreateLedgerTransactionInput = z.output<typeof createLedgerTransactionSchema>;
