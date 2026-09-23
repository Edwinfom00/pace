import { jsonError } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { parseInboxOverviewSearchParams } from "@/modules/financial-inbox/queries/inbox-overview-search-params";
import { getServerInboxOverview } from "@/modules/financial-inbox/server/get-inbox-overview";

export async function GET(
  request: Request,
  context: RouteContext<"/api/workspaces/[workspaceId]/inbox">,
): Promise<Response> {
  try {
    const [{ workspaceId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    const language = await getPersistedDashboardLanguage(actor.userId);
    const labels = getDashboardLabels(language);
    const searchParams = new URL(request.url).searchParams;
    const filters = parseInboxOverviewSearchParams({
      page: searchParams.get("page") ?? undefined,
      reason: searchParams.get("reason") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
    });
    const overview = await getServerInboxOverview({
      actor,
      workspaceId,
      reason: filters.reason,
      sort: filters.sort,
      page: filters.page,
      unknownMerchantName: labels["transactions.merchant.unknown"],
    });
    return Response.json(overview);
  } catch (error) {
    return jsonError(error);
  }
}
