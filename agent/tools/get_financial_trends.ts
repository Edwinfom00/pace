import { defineTool } from "eve/tools";

import { bindPaceEveTool } from "@/modules/pace-agents/eve/tool-binding";

const capability = bindPaceEveTool("get_financial_trends");

export default defineTool({
  description: capability.description,
  inputSchema: capability.inputSchema,
  execute: (input, ctx) => capability.execute(input, ctx),
});
