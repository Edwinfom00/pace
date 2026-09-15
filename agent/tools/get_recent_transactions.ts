import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAssistantRecentTransactions } from "@/modules/pace-assistant/server/read-tools";

export default defineTool({
  description: "Read recent authenticated-workspace transactions as safe presentation data. Use a structured transaction-list block in the final response.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5) }).strict(),
  async execute({ limit }, ctx) {
    const scope = requirePaceEveScope(ctx);
    return getAssistantRecentTransactions(scope, limit);
  },
});
