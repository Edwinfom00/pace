import { jsonError } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { getAgentActionService } from "@/modules/agent-actions/server";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/workspaces/[workspaceId]/agent-actions/[actionId]/reject">,
): Promise<Response> {
  try {
    const [{ workspaceId, actionId }, actor] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
    ]);
    const action = await getAgentActionService().rejectAction(actor, workspaceId, actionId);
    return Response.json({ action });
  } catch (error) {
    return jsonError(error);
  }
}
