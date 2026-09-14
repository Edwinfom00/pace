import { requireAuthenticatedActor } from "@/authorization/session";
import { getPersistedUserLanguage } from "@/i18n/server";
import { presentInsight } from "@/modules/insights/presenters";
import { getInsightService } from "@/modules/insights/server";

import { jsonError } from "../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}


export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    const [result, language] = await Promise.all([
      getInsightService().refreshForMember(actor, workspaceId),
      getPersistedUserLanguage(actor.userId),
    ]);
    return Response.json({ insights: result.insights.map((insight) => presentInsight(insight, language)) });
  } catch (error) {
    return jsonError(error);
  }
}
