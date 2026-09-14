import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAgentActionService } from "@/modules/agent-actions/server";

export default defineTool({
  description:
    "Edit a DRAFT budget or savings-goal action. Only edit an action id created in this workspace; use ids from get_plan_context and preserve exact user money text.",
  inputSchema: z
    .object({
      actionId: z.string().uuid(),
      scope: z.enum(["OVERALL", "CATEGORY"]).nullable().optional(),
      categoryId: z.string().uuid().nullable().optional(),
      amountText: z.string().trim().max(80).nullable().optional(),
      startsOnText: z.string().trim().max(20).nullable().optional(),
      endsOnText: z.string().trim().max(20).nullable().optional(),
      budgetStatus: z.enum(["ACTIVE", "ARCHIVED"]).nullable().optional(),
      name: z.string().trim().max(160).nullable().optional(),
      targetAmountText: z.string().trim().max(80).nullable().optional(),
      currentSavedText: z.string().trim().max(80).nullable().optional(),
      targetDateText: z.string().trim().max(20).nullable().optional(),
      clearTargetDate: z.boolean().nullable().optional(),
      goalStatus: z.enum(["ACTIVE", "COMPLETED", "PAUSED", "ARCHIVED"]).nullable().optional(),
      sourceText: z.string().trim().max(1_000).nullable().optional(),
    })
    .strict(),
  async execute({ actionId, ...input }, ctx) {
    const scope = requirePaceEveScope(ctx);
    const action = await getAgentActionService().editPlanDraft(
      scope.actor,
      scope.workspaceId,
      actionId,
      input,
    );
    return { actionId: action.id, status: action.status, draft: action.draft };
  },
});
