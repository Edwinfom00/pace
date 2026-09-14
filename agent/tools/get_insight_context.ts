import { defineTool } from "eve/tools";
import { z } from "zod";

import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";
import { presentInsight } from "@/modules/insights/presenters";
import { getInsightService } from "@/modules/insights/server";


export default defineTool({
  description: "Get current deterministic financial insights for the authenticated workspace. Use before explaining financial trends or suggesting a review.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const scope = requirePaceEveScope(ctx);
    const refreshed = await getInsightService().refreshForMember(scope.actor, scope.workspaceId);
    const language = ctx.session.auth.current?.attributes?.preferredLanguage;
    return {
      workspaceId: scope.workspaceId,
      insights: refreshed.insights.map((insight) => presentInsight(insight, typeof language === "string" ? language : null)),
      mutationLifecycle: ["get_plan_context", "create_plan_draft", "submit_plan_draft"],
    };
  },
});
