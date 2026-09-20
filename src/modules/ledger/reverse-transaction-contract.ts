import { z } from "zod";

const entityId = z.string().trim().uuid();
const workspaceId = z.string().trim().min(1).max(255);
const idempotencyKey = z.string().trim().uuid();

export const reverseTransactionSchema = z.object({
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
}).strict();

export type ReverseTransactionInput = z.input<typeof reverseTransactionSchema>;
export type ReverseTransactionCommand = z.output<typeof reverseTransactionSchema>;

export type ReversedTransactionDTO = {
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

export type ReverseTransactionErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_REVERSAL_NOT_ALLOWED"
  | "TRANSACTION_ALREADY_REVERSED"
  | "TRANSACTION_NOT_CURRENT"
  | "TRANSACTION_HAS_ACTIVE_REFUNDS"
  | "CONCURRENT_MODIFICATION"
  | "REVERSAL_ALREADY_PROCESSED"
  | "INVALID_REVERSAL"
  | "TRANSACTION_REVERSAL_FAILED";

export type ReverseTransactionResult =
  | {
      readonly ok: true;
      readonly reversal: {
        readonly originalTransaction: ReversedTransactionDTO;
        readonly reversalTransaction: ReversedTransactionDTO;
        readonly effectiveState: "REVERSED";
      };
    }
  | { readonly ok: false; readonly code: ReverseTransactionErrorCode };
