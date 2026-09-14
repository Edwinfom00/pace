import { requireAuthenticatedActor } from "@/authorization/session";
import { getWorkspaceService } from "@/modules/workspaces/server";
import { joinInvitationSchema } from "@/modules/workspaces/validation";

import { jsonError, parseJson } from "../../_lib/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const [actor, input] = await Promise.all([
      requireAuthenticatedActor(),
      parseJson(request, joinInvitationSchema),
    ]);
    const membership = await getWorkspaceService().joinInvitation(actor, input);
    return Response.json({ membership }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
