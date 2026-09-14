import { requireAuthenticatedActor } from "@/authorization/session";
import { assertManualInviteLookupAllowed } from "@/modules/workspaces/join-rate-limiter";
import { getWorkspaceService } from "@/modules/workspaces/server";
import { joinInvitationSchema } from "@/modules/workspaces/validation";

import { jsonError, parseJson } from "../../_lib/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const [actor, input] = await Promise.all([
      requireAuthenticatedActor(),
      parseJson(request, joinInvitationSchema),
    ]);

    if (input.code) {
      assertManualInviteLookupAllowed(actor.userId);
    }

    const preview = await getWorkspaceService().previewInvitation(actor, input);
    return Response.json({ preview });
  } catch (error) {
    return jsonError(error);
  }
}
