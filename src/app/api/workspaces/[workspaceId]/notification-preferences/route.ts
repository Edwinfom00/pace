import { requireAuthenticatedActor } from "@/authorization/session";
import { getInsightService } from "@/modules/insights/server";
import { notificationPreferenceSchema } from "@/modules/insights/validation";

import { jsonError, parseJson } from "../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    return Response.json({ preference: await getInsightService().getNotificationPreference(actor, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, notificationPreferenceSchema),
    ]);
    return Response.json({ preference: await getInsightService().updateNotificationPreference(actor, workspaceId, input) });
  } catch (error) {
    return jsonError(error);
  }
}
