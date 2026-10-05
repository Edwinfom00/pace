import { defineTool } from "eve/tools";
import { z } from "zod";

import { paceSubAgentRegistry } from "@/modules/pace-agents/registry";
import { routePaceRequest, subAgentForPage } from "@/modules/pace-agents/routing";

export default defineTool({
  description:
    "Deterministically route a member request to the Pace sub-agents that own it. Returns the ordered sub-agents, the tools each one owns, and whether the request spans several domains. Call it when a request may span more than one domain or when it is unclear which tools apply; follow the returned routes in order and never use a tool outside them.",
  inputSchema: z
    .object({
      request: z.string().trim().min(1).max(1_000),
      page: z.string().trim().max(40).optional(),
    })
    .strict(),
  async execute({ request, page }) {
    const plan = routePaceRequest(paceSubAgentRegistry, request, { preferredAgent: subAgentForPage(page) });
    return {
      status: plan.status,
      composition: plan.composition,
      intent: plan.intent,
      routes: plan.routes.map((route) => {
        const agent = paceSubAgentRegistry.get(route.agentId)!;
        return {
          subAgent: agent.id,
          label: agent.label,
          reason: route.reason,
          matched: route.matched,
          tools: agent.capabilities.map((capability) => ({
            tool: capability.tool,
            access: capability.access,
            approval: capability.approval,
          })),
        };
      }),
      fallback: plan.fallback,
    };
  },
});
