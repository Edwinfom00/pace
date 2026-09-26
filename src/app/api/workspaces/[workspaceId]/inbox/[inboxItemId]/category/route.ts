import { revalidatePath } from "next/cache";

import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import {
  inboxCategoryResolutionSchema,
} from "@/modules/financial-inbox/inbox-category-resolution-contract";
import { presentInboxCategoryResolution } from "@/modules/financial-inbox/inbox-category-resolution-presenter";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";


export async function POST(
  request: Request,
  context: RouteContext<"/api/workspaces/[workspaceId]/inbox/[inboxItemId]/category">,
): Promise<Response> {
  try {
    const [{ workspaceId, inboxItemId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, inboxCategoryResolutionSchema),
    ]);
    const service = getFinancialInboxService();
    const result = input.action === "ACCEPT_SUGGESTION"
      ? await service.acceptInboxCategorySuggestion(actor, {
          workspaceId,
          inboxItemId,
          expectedInboxUpdatedAt: input.expectedInboxUpdatedAt,
          expectedTransactionUpdatedAt: input.expectedTransactionUpdatedAt,
          expectedSuggestionCategoryId: input.expectedSuggestionCategoryId,
          expectedSuggestionUpdatedAt: input.expectedSuggestionUpdatedAt,
          idempotencyKey: input.idempotencyKey,
        })
      : await service.chooseInboxCategory(actor, {
          workspaceId,
          inboxItemId,
          categoryId: input.categoryId,
          expectedInboxUpdatedAt: input.expectedInboxUpdatedAt,
          expectedTransactionUpdatedAt: input.expectedTransactionUpdatedAt,
          idempotencyKey: input.idempotencyKey,
        });
    revalidatePath("/w/[workspaceSlug]/inbox", "page");
    revalidatePath("/w/[workspaceSlug]/inbox/[inboxItemId]", "page");
    return Response.json({ result: presentInboxCategoryResolution(result) });
  } catch (error) {
    return jsonError(error);
  }
}
