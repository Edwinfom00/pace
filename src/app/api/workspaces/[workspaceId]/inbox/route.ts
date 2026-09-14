import { jsonError } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/workspaces/[workspaceId]/inbox">,
): Promise<Response> {
  try {
    const [{ workspaceId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    const items = await getFinancialInboxService().listInbox(actor, workspaceId);
    return Response.json({ items });
  } catch (error) {
    return jsonError(error);
  }
}
