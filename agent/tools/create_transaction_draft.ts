import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAgentActionService } from "@/modules/agent-actions/server";

const transactionDraftInput = z
  .object({
    kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
    amountText: z.string().trim().max(80).optional(),
    occurredAtText: z.string().trim().max(40).optional(),
    accountHint: z.string().trim().max(120).optional(),
    transferAccountHint: z.string().trim().max(120).optional(),
    categoryHint: z.string().trim().max(120).optional(),
    merchantName: z.string().trim().max(160).optional(),
    note: z.string().trim().max(1_000).optional(),
    sourceText: z.string().trim().min(1).max(1_000),
  })
  .strict();

export default defineTool({
  description:
    "Create an editable, typed transaction draft from a user's explicit words after get_transaction_context. Supply money as the exact text the user gave, never calculated minor units.",
  inputSchema: transactionDraftInput,
  async execute(input, ctx) {
    const scope = requirePaceEveScope(ctx);
    const action = await getAgentActionService().createTransactionDraft(scope.actor, scope.workspaceId, {
      ...input,
      idempotencyKey: `eve:${ctx.session.id}:${ctx.callId}`,
      eveSessionId: ctx.session.id,
      eveCallId: ctx.callId,
    });
    return {
      actionId: action.id,
      status: action.status,
      draft: action.draft,
      isReadyForApproval: action.draft.missingFields.length === 0,
    };
  },
});
