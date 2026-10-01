import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { manageSavingsGoalCommand } from "@/modules/plans/manage-savings-goal-contract";
import { getPlansService } from "@/modules/plans/server";

interface RouteContext {
  params: Promise<{ workspaceId: string; goalId: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const [{ workspaceId, goalId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, manageSavingsGoalCommand),
    ]);
    const service = getPlansService();
    const goal =
      input.action === "ARCHIVE"
        ? await service.archiveSavingsGoal(actor, workspaceId, goalId, input)
        : input.action === "COMPLETE"
          ? await service.completeSavingsGoal(actor, workspaceId, goalId, input)
          : await service.editSavingsGoal(actor, workspaceId, goalId, input);
    return Response.json({
      goal: {
        id: goal.id,
        status: goal.status,
        updatedAt: goal.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
