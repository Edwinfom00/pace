import { z } from "zod";

const version = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), "Expected Inbox version must be a valid timestamp.");

const idempotencyKey = z.string().trim().min(1).max(180);


export const inboxRecurringResolutionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CONFIRM"),
    expectedInboxUpdatedAt: version,
    idempotencyKey,
  }).strict(),
  z.object({
    action: z.literal("IGNORE"),
    expectedInboxUpdatedAt: version,
    idempotencyKey,
    reason: z.string().trim().max(500).optional(),
  }).strict(),
]);

export type InboxRecurringResolutionInput = z.output<typeof inboxRecurringResolutionSchema>;
