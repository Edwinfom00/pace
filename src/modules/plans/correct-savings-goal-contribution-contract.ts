import { z } from "zod";

import { isCurrencyCode } from "@/money/currency";

export const correctSavingsGoalContributionCommand = z.object({
  amountMinor: z.string().regex(/^\d+$/),
  currency: z.string().trim().toUpperCase().refine(isCurrencyCode),
  effectiveAt: z.string().datetime(),
  note: z.string().trim().max(500).nullable().optional(),
  expectedUpdatedAt: z.string().datetime(),
  idempotencyKey: z.string().trim().uuid(),
});
