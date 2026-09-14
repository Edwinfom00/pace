import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAgentActionService } from "@/modules/agent-actions/server";

const inputSchema = z.object({ actionId: z.string().uuid() }).strict();

export default defineTool({
  description:
    "Submit a complete budget or savings-goal draft for human approval and, only after Eve approves it, persist it through Pace's deterministic plan service.",
  inputSchema,
  approval: {
    async request(ctx) {
      try {
        const scope = requirePaceEveScope(ctx);
        await getAgentActionService().requestApproval(scope.actor, scope.workspaceId, ctx.toolInput?.actionId ?? "");
        return "user-approval";
      } catch (error) {
        return {
          type: "denied",
          reason: error instanceof Error ? error.message : "The plan draft cannot be submitted.",
        };
      }
    },
    async response(ctx) {
      try {
        const scope = requirePaceEveScope({ session: { auth: { current: ctx.responder } } });
        await getAgentActionService().approveAction(
          scope.actor,
          scope.workspaceId,
          ctx.request.toolInput?.actionId ?? "",
        );
        return { status: "allowed" };
      } catch (error) {
        return {
          status: "rejected",
          reason: error instanceof Error ? error.message : "Approval could not be authorized.",
        };
      }
    },
  },
  async execute({ actionId }, ctx) {
    const scope = requirePaceEveScope(ctx);
    return getAgentActionService().executeApprovedPlan(scope.actor, scope.workspaceId, actionId);
  },
});
