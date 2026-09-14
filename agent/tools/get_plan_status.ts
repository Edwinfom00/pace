import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAgentActionService } from "@/modules/agent-actions/server";

export default defineTool({
  description:
    "Read deterministic budget and savings-goal status for the authenticated workspace. It returns current posted spend, remaining amount, usage versus elapsed-period expectation, and explicit savings-goal progress and required pace. Never calculate or infer those values yourself.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const scope = requirePaceEveScope(ctx);
    return getAgentActionService().getPlanStatus(scope.actor, scope.workspaceId);
  },
});
