import { z } from "zod";

export const pacePageContextSchema = z.discriminatedUnion("page", [
  z.object({ page: z.literal("overview"), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), transactionType: z.enum(["ALL", "EXPENSE", "INCOME", "TRANSFER"]) }).strict(),
  z.object({
    page: z.literal("transactions"),
    filters: z.object({
      search: z.string().max(200).optional(),
      type: z.enum(["ALL", "EXPENSE", "INCOME", "TRANSFER", "REFUND"]).optional(),
      categoryId: z.string().uuid().optional(),
      accountId: z.string().uuid().optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      sort: z.enum(["NEWEST", "OLDEST", "HIGHEST", "LOWEST"]).optional(),
    }).strict().optional(),
    selectedTransactionId: z.string().uuid().optional(),
  }).strict(),
  z.object({ page: z.literal("inbox"), selectedInboxItemId: z.string().uuid().optional() }).strict(),
  z.object({ page: z.literal("plans"), selectedPlanId: z.string().uuid().optional() }).strict(),
  z.object({ page: z.literal("insights"), selectedInsightId: z.string().uuid().optional() }).strict(),
]);

export type PacePageContext = z.infer<typeof pacePageContextSchema>;

export function parsePacePageContext(value: unknown): PacePageContext | null {
  const parsed = pacePageContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
