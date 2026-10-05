import { defineTool } from "eve/tools";

import { bindPaceEveTool } from "@/modules/pace-agents/eve/tool-binding";

const capability = bindPaceEveTool("submit_recurring_draft");

export default defineTool({
  description: capability.description,
  inputSchema: capability.inputSchema,
  approval: {
    request: (ctx) => capability.requestApproval(ctx, "The recurring draft cannot be submitted."),
    response: (ctx) => capability.respondToApproval(ctx),
  },
  execute: (input, ctx) => capability.execute(input, ctx),
});
