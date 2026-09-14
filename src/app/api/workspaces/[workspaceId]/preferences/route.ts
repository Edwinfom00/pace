import { requireAuthenticatedActor } from "@/authorization/session";
import { getWorkspaceService } from "@/modules/workspaces/server";
import { updateWorkspacePreferencesSchema } from "@/modules/workspaces/validation";

import { jsonError, parseJson } from "../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor, preferences] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, updateWorkspacePreferencesSchema),
    ]);
    const updated = await getWorkspaceService().updatePreferences(actor, workspaceId, preferences);
    return Response.json({ preferences: updated });
  } catch (error) {
    return jsonError(error);
  }
}
