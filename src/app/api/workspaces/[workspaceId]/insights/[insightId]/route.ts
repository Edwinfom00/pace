import { requireAuthenticatedActor } from "@/authorization/session";
import { getInsightService } from "@/modules/insights/server";
import { insightLifecycleSchema } from "@/modules/insights/validation";

import { jsonError, parseJson } from "../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string; insightId: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId, insightId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, insightLifecycleSchema),
    ]);
    const service = getInsightService();
    const insight = input.status === "READ"
      ? await service.markRead(actor, workspaceId, insightId)
      : await service.dismiss(actor, workspaceId, insightId);
    return Response.json({ insight });
  } catch (error) {
    return jsonError(error);
  }
}
