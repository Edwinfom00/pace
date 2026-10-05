import { defineInstructions } from "eve/instructions";

import { renderSubAgentInstructions } from "@/modules/pace-agents/prompts";
import { paceSubAgentRegistry } from "@/modules/pace-agents/registry";

export default defineInstructions({
  content: renderSubAgentInstructions(paceSubAgentRegistry),
});
