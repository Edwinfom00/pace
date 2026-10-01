import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { reverseSavingsGoalContributionCommand } from "@/modules/plans/reverse-savings-goal-contribution-contract";
import { getPlansService } from "@/modules/plans/server";

interface RouteContext {
  params: Promise<{
    workspaceId: string;
    goalId: string;
    contributionId: string;
  }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const [{ workspaceId, goalId, contributionId }, actor, input] =
      await Promise.all([
        context.params,
        requireAuthenticatedActor(),
        parseJson(request, reverseSavingsGoalContributionCommand),
      ]);
    const reversal = await getPlansService().reverseSavingsGoalContribution(
      actor,
      workspaceId,
      goalId,
      contributionId,
      {
        ...input,
        effectiveAt: new Date(input.effectiveAt),
        expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      },
    );
    return Response.json({ reversal: { id: reversal.id } });
  } catch (error) {
    return jsonError(error);
  }
}
