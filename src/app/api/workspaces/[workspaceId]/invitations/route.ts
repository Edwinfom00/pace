import { requireAuthenticatedActor } from "@/authorization/session";
import { getWorkspaceService } from "@/modules/workspaces/server";
import { createInvitationSchema } from "@/modules/workspaces/validation";

import { jsonError, parseJson } from "../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, createInvitationSchema),
    ]);
    const created = await getWorkspaceService().createInvitation(actor, workspaceId, input);
    const baseUrl = new URL(process.env.BETTER_AUTH_URL ?? request.url);
    const inviteUrl = new URL(`/join?token=${created.inviteUrlToken}`, baseUrl).toString();

    return Response.json(
      {
        invitation: created.invitation,
        inviteUrl,
        shortCode: created.shortCode,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
