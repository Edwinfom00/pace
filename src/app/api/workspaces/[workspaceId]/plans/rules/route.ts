import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { createRuleCommand } from "@/modules/plans/rules/rule-contract";
import { getRulesService } from "@/modules/plans/rules/server";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, createRuleCommand),
    ]);
    const rule = await getRulesService().createRule(actor, workspaceId, input);
    return Response.json(
      { rule: { id: rule.id, enabled: rule.enabled, updatedAt: rule.updatedAt.toISOString() } },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
