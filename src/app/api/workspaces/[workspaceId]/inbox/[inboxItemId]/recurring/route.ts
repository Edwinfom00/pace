import { revalidatePath } from "next/cache";

import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { inboxRecurringResolutionSchema } from "@/modules/financial-inbox/inbox-recurring-resolution-contract";
import { presentInboxRecurringResolution } from "@/modules/financial-inbox/inbox-recurring-resolution-presenter";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";

export async function POST(
  request: Request,
  context: RouteContext<"/api/workspaces/[workspaceId]/inbox/[inboxItemId]/recurring">,
): Promise<Response> {
  try {
    const [{ workspaceId, inboxItemId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, inboxRecurringResolutionSchema),
    ]);
    const service = getFinancialInboxService();
    const result = input.action === "CONFIRM"
      ? await service.confirmInboxRecurring(actor, {
          workspaceId,
          inboxItemId,
          expectedInboxUpdatedAt: input.expectedInboxUpdatedAt,
          idempotencyKey: input.idempotencyKey,
        })
      : await service.ignoreInboxRecurring(actor, {
          workspaceId,
          inboxItemId,
          expectedInboxUpdatedAt: input.expectedInboxUpdatedAt,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
        });
    revalidatePath("/w/[workspaceSlug]/overview", "page");
    revalidatePath("/w/[workspaceSlug]/inbox", "page");
    revalidatePath("/w/[workspaceSlug]/inbox/[inboxItemId]", "page");
    revalidatePath("/w/[workspaceSlug]/recurring", "page");
    revalidatePath("/w/[workspaceSlug]/recurring/[recurringId]", "page");
    return Response.json({ result: presentInboxRecurringResolution(result) });
  } catch (error) {
    return jsonError(error);
  }
}
