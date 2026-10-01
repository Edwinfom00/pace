import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { correctSavingsGoalContributionCommand } from "@/modules/plans/correct-savings-goal-contribution-contract";
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
        parseJson(request, correctSavingsGoalContributionCommand),
      ]);
    const correction = await getPlansService().correctSavingsGoalContribution(
      actor,
      workspaceId,
      goalId,
      contributionId,
      {
        ...input,
        amountMinor: BigInt(input.amountMinor),
        effectiveAt: new Date(input.effectiveAt),
        expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      },
    );
    return Response.json({
      reversal: { id: correction.reversal.id },
      replacement: { id: correction.replacement.id },
    });
  } catch (error) {
    return jsonError(error);
  }
}
