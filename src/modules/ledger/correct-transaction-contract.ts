import { z } from "zod";

const entityId = z.string().trim().uuid();
const workspaceId = z.string().trim().min(1).max(255);
const idempotencyKey = z.string().trim().uuid();
const MAX_BIGINT = 9_223_372_036_854_775_807n;

const positiveMinorUnits = z
  .string()
  .trim()
  .regex(/^\d+$/, "Amount must be a positive integer minor-unit string.")
  .transform((value) => BigInt(value))
  .refine((value) => value > 0n && value <= MAX_BIGINT, "Amount must fit in PostgreSQL bigint.");

const correctionBase = {
  workspaceId,
  transactionId: entityId,
  idempotencyKey,
  expectedUpdatedAt: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .refine((value) => !Number.isNaN(value.getTime()), "Expected version must be a valid timestamp.")
    .optional(),
  reason: z.string().trim().min(1).max(500).optional(),
};

const expenseChanges = z
  .object({
    amountMinor: positiveMinorUnits.optional(),
    accountId: entityId.optional(),
  })
  .strict()
  .refine((value) => value.amountMinor !== undefined || value.accountId !== undefined, {
    message: "At least one financial value must change.",
  });

const transferChanges = z
  .object({
    amountMinor: positiveMinorUnits.optional(),
    fromAccountId: entityId.optional(),
    toAccountId: entityId.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.amountMinor !== undefined || value.fromAccountId !== undefined || value.toAccountId !== undefined,
    { message: "At least one financial value must change." },
  );


export const correctTransactionSchema = z.discriminatedUnion("kind", [
  z.object({ ...correctionBase, kind: z.literal("EXPENSE"), financialChanges: expenseChanges }).strict(),
  z.object({ ...correctionBase, kind: z.literal("INCOME"), financialChanges: expenseChanges }).strict(),
  z.object({ ...correctionBase, kind: z.literal("TRANSFER"), financialChanges: transferChanges }).strict(),
]);

export type CorrectTransactionInput = z.input<typeof correctTransactionSchema>;
export type CorrectTransactionCommand = z.output<typeof correctTransactionSchema>;

export type CorrectedTransactionDTO = {
  readonly id: string;
  readonly kind: "EXPENSE" | "INCOME" | "TRANSFER";
  readonly amountMinor: string;
  readonly currency: string;
  readonly accountId: string | null;
  readonly transferAccountId: string | null;
  readonly categoryId: string | null;
  readonly merchantId: string | null;
  readonly occurredAt: string;
  readonly note: string | null;
  readonly status: "POSTED" | "PENDING";
  readonly reversalOfTransactionId: string | null;
};

export type CorrectTransactionErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_CORRECTION_NOT_ALLOWED"
  | "TRANSACTION_ALREADY_REVERSED"
  | "TRANSACTION_NOT_CURRENT"
  | "INVALID_CORRECTION"
  | "INVALID_AMOUNT"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_UNAVAILABLE"
  | "ACCOUNT_WORKSPACE_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "SAME_TRANSFER_ACCOUNT"
  | "CROSS_CURRENCY_TRANSFER_UNSUPPORTED"
  | "CONCURRENT_MODIFICATION"
  | "CORRECTION_ALREADY_PROCESSED"
  | "TRANSACTION_CORRECTION_FAILED";

export type CorrectTransactionResult =
  | {
      readonly ok: true;
      readonly correction: {
        readonly id: string;
        readonly reason: string | null;
        readonly originalTransaction: CorrectedTransactionDTO;
        readonly reversalTransaction: CorrectedTransactionDTO;
        readonly replacementTransaction: CorrectedTransactionDTO;
      };
    }
  | { readonly ok: false; readonly code: CorrectTransactionErrorCode };
