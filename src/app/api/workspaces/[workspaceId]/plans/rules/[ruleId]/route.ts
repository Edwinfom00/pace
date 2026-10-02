import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { manageRuleRequest } from "@/modules/plans/rules/rule-contract";
import { getRulesService } from "@/modules/plans/rules/server";

interface RouteContext {
  params: Promise<{ workspaceId: string; ruleId: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const [{ workspaceId, ruleId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, manageRuleRequest),
    ]);
    const service = getRulesService();
    const command = {
      expectedUpdatedAt: input.expectedUpdatedAt,
      idempotencyKey: input.idempotencyKey,
    };
    const rule =
      input.action === "ARCHIVE"
        ? await service.archiveRule(actor, workspaceId, ruleId, command)
        : await service.setRuleEnabled(actor, workspaceId, ruleId, {
            ...command,
            enabled: input.action === "ENABLE",
          });
    return Response.json({
      rule: {
        id: rule.id,
        status: rule.status,
        enabled: rule.enabled,
        updatedAt: rule.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
