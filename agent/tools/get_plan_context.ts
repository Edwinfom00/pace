import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAgentActionService } from "@/modules/agent-actions/server";

export default defineTool({
  description:
    "Get the authenticated workspace's authoritative plan context before drafting a budget or savings-goal change. It includes currency, timezone, expense categories, existing budgets, and savings goals.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const scope = requirePaceEveScope(ctx);
    return getAgentActionService().getPlanContext(scope.actor, scope.workspaceId);
  },
});
