import { requireAuthenticatedActor } from "@/authorization/session";
import { getWorkspaceService } from "@/modules/workspaces/server";

import { jsonError } from "../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string; invitationId: string }>;
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId, invitationId }, actor] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
    ]);
    await getWorkspaceService().revokeInvitation(actor, workspaceId, invitationId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
