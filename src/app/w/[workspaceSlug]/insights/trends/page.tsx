import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { calendarMonthPeriod } from "@/money/period";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { parseInsightsCurrency } from "@/modules/insights/overview/insights-overview.types";
import { getInsightsTrends } from "@/modules/insights/trends/insights-trends-server";
import { parseTrendsRange } from "@/modules/insights/trends/insights-trends.types";
import { InsightsTrendsView } from "@/modules/insights/ui/views/insights-trends-view";
import { overviewPeriodKey } from "@/modules/overview/domain/overview-financial-summary";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type InsightsTrendsPageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    period?: string | string[];
    range?: string | string[];
    currency?: string | string[];
  }>;
};

export default async function InsightsTrendsPage({
  params,
  searchParams,
}: InsightsTrendsPageProps) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const actor = await getAuthenticatedActor();

  if (!actor) {
    redirect(loginPathForReturnTo(`/w/${workspaceSlug}/insights/trends`));
  }

  const workspace =
    await new DatabaseWorkspaceRepository().findMemberContextBySlug(
      workspaceSlug,
      actor.userId,
    );

  if (!workspace) {
    notFound();
  }

  const now = new Date();
  const { currency, locale, timezone } = workspace.preferences;
  const language = await getPersistedDashboardLanguage(actor.userId);
  const labels = getDashboardLabels(language);
  const trends = await getInsightsTrends({
    actor,
    workspaceId: workspace.workspace.id,
    workspaceCurrency: currency,
    locale,
    timeZone: timezone,
    labels,
    range: parseTrendsRange(query.range),
    periodKey: Array.isArray(query.period) ? query.period[0] : query.period,
    requestedCurrency: parseInsightsCurrency(query.currency),
    now,
  });

  return (
    <InsightsTrendsView
      currentPeriodKey={overviewPeriodKey(
        calendarMonthPeriod(now, timezone),
        timezone,
      )}
      labels={labels}
      trends={trends}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
