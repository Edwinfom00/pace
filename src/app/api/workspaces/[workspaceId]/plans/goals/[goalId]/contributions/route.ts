import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { addSavingsGoalContributionCommand } from "@/modules/plans/add-savings-goal-contribution-contract";
import { getPlansService } from "@/modules/plans/server";

interface RouteContext {
  params: Promise<{ workspaceId: string; goalId: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const [{ workspaceId, goalId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, addSavingsGoalContributionCommand),
    ]);
    const contribution = await getPlansService().addSavingsGoalContribution(
      actor,
      workspaceId,
      goalId,
      {
        ...input,
        amountMinor: BigInt(input.amountMinor),
        effectiveAt: new Date(input.effectiveAt),
        expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      },
    );
    return Response.json({ contribution: { id: contribution.id } });
  } catch (error) {
    return jsonError(error);
  }
}
