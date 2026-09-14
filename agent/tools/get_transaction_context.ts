import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAgentActionService } from "@/modules/agent-actions/server";

export default defineTool({
  description:
    "Get the authenticated workspace's authoritative accounts, categories, currency, locale, and timezone before creating or editing a transaction draft.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const scope = requirePaceEveScope(ctx);
    return getAgentActionService().getTransactionContext(scope.actor, scope.workspaceId);
  },
});
