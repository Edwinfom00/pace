import { z } from "zod";

import { isCurrencyCode } from "@/money/currency";

const id = z.string().trim().uuid();
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const createBudgetCommand = z.object({
  categoryId: id,
  subcategoryIds: z.array(id).max(100),
  amountMinor: z.string().regex(/^\d+$/),
  currency: z.string().trim().toUpperCase().refine(isCurrencyCode),
  period,
  idempotencyKey: id,
});
