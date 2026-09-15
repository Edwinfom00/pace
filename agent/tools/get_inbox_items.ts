import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { getAssistantInboxItems } from "@/modules/pace-assistant/server/read-tools";

export default defineTool({
  description: "Read open authenticated-workspace financial Inbox items. Use these facts to answer what needs attention; do not invent alerts.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5) }).strict(),
  async execute({ limit }, ctx) {
    const scope = requirePaceEveScope(ctx);
    return getAssistantInboxItems(scope, limit);
  },
});
