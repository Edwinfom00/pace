import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { manageBudgetCommand } from "@/modules/plans/manage-budget-contract";
import { getPlansService } from "@/modules/plans/server";

interface RouteContext {
  params: Promise<{ workspaceId: string; budgetId: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const [{ workspaceId, budgetId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, manageBudgetCommand),
    ]);
    const service = getPlansService();
    const budget =
      input.action === "ARCHIVE"
        ? await service.archiveBudget(actor, workspaceId, budgetId, input)
        : await service.editBudget(actor, workspaceId, budgetId, input);
    return Response.json({
      budget: {
        id: budget.id,
        status: budget.status,
        updatedAt: budget.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
