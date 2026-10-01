import { requireAuthenticatedActor } from "@/authorization/session";
import { toCurrencyCode } from "@/money/currency";
import { zonedLocalDateTimeToInstant } from "@/money/period";
import { createSavingsGoalCommand } from "@/modules/plans/create-savings-goal-contract";
import { getPlansService } from "@/modules/plans/server";

import { jsonError, parseJson } from "../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const [{ workspaceId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, createSavingsGoalCommand),
    ]);
    const service = getPlansService();
    const planContext = await service.getContext(actor, workspaceId);
    if (
      toCurrencyCode(input.currency) !== toCurrencyCode(planContext.currency)
    ) {
      return Response.json({ code: "CURRENCY_MISMATCH" }, { status: 400 });
    }
    const targetDate = input.targetDate
      ? zonedLocalDateTimeToInstant(
          {
            year: Number(input.targetDate.slice(0, 4)),
            month: Number(input.targetDate.slice(5, 7)),
            day: Number(input.targetDate.slice(8, 10)),
          },
          { hour: 0, minute: 0 },
          planContext.timezone,
        )
      : null;
    const goal = await service.createSavingsGoal(actor, workspaceId, {
      name: input.name,
      targetAmountMinor: BigInt(input.targetAmountMinor),
      currentSavedMinor:
        input.currentSavedMinor === undefined
          ? undefined
          : BigInt(input.currentSavedMinor),
      targetDate,
      agentActionId: input.idempotencyKey,
    });
    return Response.json({ goal: { id: goal.id } }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
