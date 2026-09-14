import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { getAgentActionService } from "@/modules/agent-actions/server";
import { editTransactionDraftSchema } from "@/modules/agent-actions/validation";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/workspaces/[workspaceId]/agent-actions/[actionId]">,
): Promise<Response> {
  try {
    const [{ workspaceId, actionId }, actor] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
    ]);
    const detail = await getAgentActionService().getActionDetail(actor, workspaceId, actionId);
    return Response.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/workspaces/[workspaceId]/agent-actions/[actionId]">,
): Promise<Response> {
  try {
    const [{ workspaceId, actionId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, editTransactionDraftSchema),
    ]);
    const action = await getAgentActionService().editTransactionDraft(actor, workspaceId, actionId, input);
    return Response.json({ action });
  } catch (error) {
    return jsonError(error);
  }
}
