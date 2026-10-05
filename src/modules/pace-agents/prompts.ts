import type { PaceSubAgentRegistry } from "./registry";

export function renderSubAgentInstructions(registry: PaceSubAgentRegistry): string {
  return registry.agents
    .map((agent) => {
      const tools = agent.capabilities
        .map((capability) => `${capability.tool} (${capability.access}${capability.approval === "required" ? ", approval required" : ""})`)
        .join(", ");
      return `## ${agent.label} sub-agent\n${agent.description}\nTools it owns: ${tools}.\n\n${agent.instructions}`;
    })
    .join("\n\n");
}
