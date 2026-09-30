import { requireAuthenticatedActor } from "@/authorization/session";
import { toCurrencyCode } from "@/money/currency";
import { zonedLocalDateTimeToInstant } from "@/money/period";
import { createBudgetCommand } from "@/modules/plans/create-budget-contract";
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
      parseJson(request, createBudgetCommand),
    ]);
    const service = getPlansService();
    const planContext = await service.getContext(actor, workspaceId);
    if (
      toCurrencyCode(input.currency) !== toCurrencyCode(planContext.currency)
    ) {
      return Response.json({ code: "CURRENCY_MISMATCH" }, { status: 400 });
    }
    const [year, month] = input.period.split("-").map(Number);
    const startsOn = zonedLocalDateTimeToInstant({ year, month, day: 1 }, { hour: 0, minute: 0 }, planContext.timezone);
    const endsOn = zonedLocalDateTimeToInstant({ year: month === 12 ? year + 1 : year, month: month === 12 ? 1 : month + 1, day: 1 }, { hour: 0, minute: 0 }, planContext.timezone);
    const budget = await service.createBudget(actor, workspaceId, {
      scope: "CATEGORY",
      categoryId: input.categoryId,
      subcategoryIds: input.subcategoryIds,
      amountMinor: BigInt(input.amountMinor),
      startsOn,
      endsOn,
      agentActionId: input.idempotencyKey,
    });
    return Response.json({ budget: { id: budget.id } }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
