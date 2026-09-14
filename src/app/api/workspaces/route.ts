import { requireAuthenticatedActor } from "@/authorization/session";
import { getWorkspaceService } from "@/modules/workspaces/server";
import { createWorkspaceSchema } from "@/modules/workspaces/validation";

import { jsonError, parseJson } from "../_lib/http";

export async function GET(): Promise<Response> {
  try {
    const actor = await requireAuthenticatedActor();
    const workspaces = await getWorkspaceService().listWorkspaces(actor);
    return Response.json({ workspaces });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const [actor, input] = await Promise.all([
      requireAuthenticatedActor(),
      parseJson(request, createWorkspaceSchema),
    ]);
    const workspace = await getWorkspaceService().createWorkspace(actor, input);
    return Response.json({ workspace }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
