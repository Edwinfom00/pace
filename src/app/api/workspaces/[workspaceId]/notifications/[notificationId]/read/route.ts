import { requireAuthenticatedActor } from "@/authorization/session";
import { getInsightService } from "@/modules/insights/server";

import { jsonError } from "../../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string; notificationId: string }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId, notificationId }, actor] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
    ]);
    return Response.json({ notification: await getInsightService().markNotificationRead(actor, workspaceId, notificationId) });
  } catch (error) {
    return jsonError(error);
  }
}
