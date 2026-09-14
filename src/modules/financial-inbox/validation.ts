import { z } from "zod";

import { INBOX_ACTIONS } from "./domain";

export const resolveFinancialInboxItemSchema = z
  .object({
    action: z.enum(INBOX_ACTIONS),
    categoryId: z.string().uuid().optional(),
  })
  .strict();
