import { z } from "zod";

import { BUDGET_SCOPES } from "./domain";

const id = z.string().trim().uuid();
const version = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const base = {
  expectedUpdatedAt: version,
  idempotencyKey: z.string().trim().min(1).max(180),
};

export const manageBudgetCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("EDIT"),
      ...base,
      scope: z.enum(BUDGET_SCOPES).optional(),
      categoryId: id.nullable().optional(),
      subcategoryIds: z.array(id).max(100).optional(),
      amountMinor: z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(BigInt)
        .optional(),
      startsOn: version.optional(),
      endsOn: version.nullable().optional(),
    })
    .strict(),
  z.object({ action: z.literal("ARCHIVE"), ...base }).strict(),
]);
