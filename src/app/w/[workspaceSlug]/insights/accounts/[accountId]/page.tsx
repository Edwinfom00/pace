import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { calendarMonthPeriod } from "@/money/period";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { getAccountAnalysis } from "@/modules/insights/account/account-analysis-server";
import { parseInsightsRange } from "@/modules/insights/overview/insights-overview.types";
import { AccountAnalysisView } from "@/modules/insights/ui/views/account-analysis-view";
import { overviewPeriodKey } from "@/modules/overview/domain/overview-financial-summary";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type InsightsAccountPageProps = {
  params: Promise<{ workspaceSlug: string; accountId: string }>;
  searchParams: Promise<{
    period?: string | string[];
    range?: string | string[];
  }>;
};

export default async function InsightsAccountPage({
  params,
  searchParams,
}: InsightsAccountPageProps) {
  const { workspaceSlug, accountId } = await params;
  const query = await searchParams;
  const actor = await getAuthenticatedActor();

  if (!actor) {
    redirect(
      loginPathForReturnTo(
        `/w/${workspaceSlug}/insights/accounts/${encodeURIComponent(accountId)}`,
      ),
    );
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
  const analysis = await getAccountAnalysis({
    actor,
    workspaceId: workspace.workspace.id,
    accountId,
    workspaceCurrency: currency,
    locale,
    timeZone: timezone,
    labels,
    range: parseInsightsRange(query.range),
    periodKey: Array.isArray(query.period) ? query.period[0] : query.period,
    now,
  });

  if (!analysis) {
    notFound();
  }

  return (
    <AccountAnalysisView
      analysis={analysis}
      currentPeriodKey={overviewPeriodKey(
        calendarMonthPeriod(now, timezone),
        timezone,
      )}
      labels={labels}
      language={language}
      timeZone={timezone}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
