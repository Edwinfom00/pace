import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAssistantExpenses } from "@/modules/pace-assistant/server/read-tools";

export default defineTool({
  description: "Read the authenticated workspace's largest posted expenses for the requested month. Returns deterministic money and transaction data; do not fabricate expense rows.",
  inputSchema: z.object({ period: z.enum(["CURRENT_MONTH", "PREVIOUS_MONTH"]).default("CURRENT_MONTH"), limit: z.number().int().min(1).max(20).default(5) }).strict(),
  async execute({ period, limit }, ctx) {
    const scope = requirePaceEveScope(ctx);
    return getAssistantExpenses(scope, { period, limit });
  },
});
