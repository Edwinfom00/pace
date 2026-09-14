import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import { resolveFinancialInboxItemSchema } from "@/modules/financial-inbox/validation";

export async function POST(
  request: Request,
  context: RouteContext<"/api/workspaces/[workspaceId]/inbox/[inboxItemId]/resolve">,
): Promise<Response> {
  try {
    const [{ workspaceId, inboxItemId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, resolveFinancialInboxItemSchema),
    ]);
    const item = await getFinancialInboxService().resolveInboxItem(actor, workspaceId, inboxItemId, input);
    return Response.json({ item });
  } catch (error) {
    return jsonError(error);
  }
}
