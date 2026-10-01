import { z } from "zod";

const version = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const base = {
  expectedUpdatedAt: version,
  idempotencyKey: z.string().trim().min(1).max(180),
};

export const manageSavingsGoalCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("EDIT"),
      ...base,
      name: z.string().trim().min(1).max(160).optional(),
      targetAmountMinor: z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(BigInt)
        .optional(),
      targetDate: version.nullable().optional(),
    })
    .strict(),
  z.object({ action: z.literal("ARCHIVE"), ...base }).strict(),
  z.object({ action: z.literal("COMPLETE"), ...base }).strict(),
]);
