import { z } from "zod";

export const reverseSavingsGoalContributionCommand = z.object({
  effectiveAt: z.string().datetime(),
  note: z.string().trim().max(500).nullable().optional(),
  expectedUpdatedAt: z.string().datetime(),
  idempotencyKey: z.string().trim().uuid(),
});
