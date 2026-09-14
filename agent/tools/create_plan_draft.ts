import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAgentActionService } from "@/modules/agent-actions/server";

const planDraftInput = z
  .object({
    actionType: z.enum(["BUDGET_CREATE", "BUDGET_UPDATE", "SAVINGS_GOAL_CREATE", "SAVINGS_GOAL_UPDATE"]),
    budgetId: z.string().uuid().optional(),
    goalId: z.string().uuid().optional(),
    scope: z.enum(["OVERALL", "CATEGORY"]).optional(),
    categoryId: z.string().uuid().optional(),
    amountText: z.string().trim().max(80).optional(),
    startsOnText: z.string().trim().max(20).optional(),
    endsOnText: z.string().trim().max(20).optional(),
    budgetStatus: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
    name: z.string().trim().max(160).optional(),
    targetAmountText: z.string().trim().max(80).optional(),
    currentSavedText: z.string().trim().max(80).optional(),
    targetDateText: z.string().trim().max(20).optional(),
    clearTargetDate: z.boolean().optional(),
    goalStatus: z.enum(["ACTIVE", "COMPLETED", "PAUSED", "ARCHIVED"]).optional(),
    sourceText: z.string().trim().min(1).max(1_000),
  })
  .strict();

export default defineTool({
  description:
    "Create an editable typed plan draft after get_plan_context. Use ids only from that context, copy money as the user's exact text, and use ISO YYYY-MM-DD dates (or YYYY-MM for a whole budget month). The server resolves currency, parses amounts, and applies known defaults.",
  inputSchema: planDraftInput,
  async execute(input, ctx) {
    const scope = requirePaceEveScope(ctx);
    const action = await getAgentActionService().createPlanDraft(scope.actor, scope.workspaceId, {
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
