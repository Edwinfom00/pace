import { requireAuthenticatedActor } from "@/authorization/session";
import { getInsightService } from "@/modules/insights/server";

import { jsonError } from "../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    return Response.json({ notifications: await getInsightService().listNotifications(actor, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}
