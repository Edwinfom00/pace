import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAssistantRecurringPayments } from "@/modules/pace-assistant/server/read-tools";

export default defineTool({
  description: "Read detected recurring payments for the authenticated workspace. Use a recurring-list block rather than a Markdown list when presenting them.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(10) }).strict(),
  async execute({ limit }, ctx) {
    const scope = requirePaceEveScope(ctx);
    return getAssistantRecurringPayments(scope, limit);
  },
});
