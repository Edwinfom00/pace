import { z } from "zod";

import { isCurrencyCode } from "@/money/currency";

const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  });

export const createSavingsGoalCommand = z.object({
  name: z.string().trim().min(1).max(160),
  targetAmountMinor: z.string().regex(/^\d+$/),
  currentSavedMinor: z.string().regex(/^\d+$/).optional(),
  currency: z.string().trim().toUpperCase().refine(isCurrencyCode),
  targetDate: localDate.nullable(),
  idempotencyKey: z.string().trim().uuid(),
});
