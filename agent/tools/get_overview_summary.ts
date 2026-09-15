import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAssistantOverviewSummary } from "@/modules/pace-assistant/server/read-tools";

export default defineTool({
  description: "Read the authenticated workspace's deterministic monthly spending, pace, and expected-month summary. Use it instead of calculating totals yourself.",
  inputSchema: z.object({ period: z.enum(["CURRENT_MONTH", "PREVIOUS_MONTH"]).default("CURRENT_MONTH") }).strict(),
  async execute({ period }, ctx) {
    const scope = requirePaceEveScope(ctx);
    return getAssistantOverviewSummary(scope, period);
  },
});
