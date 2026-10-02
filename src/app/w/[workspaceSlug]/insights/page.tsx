import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { calendarMonthPeriod } from "@/money/period";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { overviewPeriodKey } from "@/modules/overview/domain/overview-financial-summary";
import { getInsightsOverview } from "@/modules/insights/overview/insights-overview-server";
import {
  parseInsightsCurrency,
  parseInsightsRange,
} from "@/modules/insights/overview/insights-overview.types";
import { InsightsOverviewView } from "@/modules/insights/ui/views/insights-overview-view";
import { parseReportLanguage } from "@/modules/reports/domain/financial-report.types";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type WorkspaceInsightsPageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    period?: string | string[];
    range?: string | string[];
    currency?: string | string[];
  }>;
};

export default async function WorkspaceInsightsPage({
  params,
  searchParams,
}: WorkspaceInsightsPageProps) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const actor = await getAuthenticatedActor();

  if (!actor) {
    redirect(loginPathForReturnTo(`/w/${workspaceSlug}/insights`));
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
  const { overview, insights, accounts } = await getInsightsOverview({
    actor,
    workspaceId: workspace.workspace.id,
    workspaceSlug: workspace.workspace.slug,
    workspaceCurrency: currency,
    locale,
    timeZone: timezone,
    labels,
    range: parseInsightsRange(query.range),
    periodKey: Array.isArray(query.period) ? query.period[0] : query.period,
    requestedCurrency: parseInsightsCurrency(query.currency),
    now,
  });

  return (
    <InsightsOverviewView
      accounts={accounts}
      currentPeriodKey={overviewPeriodKey(
        calendarMonthPeriod(now, timezone),
        timezone,
      )}
      insights={insights}
      labels={labels}
      overview={overview}
      reportLanguage={parseReportLanguage(language)}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
