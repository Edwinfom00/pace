import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { dryRunRuleCommand } from "@/modules/plans/rules/rule-contract";
import { getRulesService } from "@/modules/plans/rules/server";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, dryRunRuleCommand),
    ]);
    return Response.json({ dryRun: await getRulesService().dryRunRule(actor, workspaceId, input) });
  } catch (error) {
    return jsonError(error);
  }
}
