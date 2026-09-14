import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAgentActionService } from "@/modules/agent-actions/server";

export default defineTool({
  description:
    "Edit an existing DRAFT transaction using only account and category ids returned by get_transaction_context. Use this when the user supplies missing or corrected details.",
  inputSchema: z
    .object({
      actionId: z.string().uuid(),
      amountText: z.string().trim().max(80).nullable().optional(),
      occurredAtText: z.string().trim().max(40).nullable().optional(),
      accountId: z.string().uuid().nullable().optional(),
      transferAccountId: z.string().uuid().nullable().optional(),
      categoryId: z.string().uuid().nullable().optional(),
      merchantName: z.string().trim().max(160).nullable().optional(),
      note: z.string().trim().max(1_000).nullable().optional(),
    })
    .strict(),
  async execute({ actionId, ...input }, ctx) {
    const scope = requirePaceEveScope(ctx);
    const action = await getAgentActionService().editTransactionDraft(
      scope.actor,
      scope.workspaceId,
      actionId,
      input,
    );
    return { actionId: action.id, status: action.status, draft: action.draft };
  },
});
