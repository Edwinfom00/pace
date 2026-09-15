import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import {
  loginPathForReturnTo,
  workspaceOverviewPath,
} from "@/modules/auth/post-auth-resolver";
import {
  overviewPeriodFromKey,
  overviewPeriodKey,
} from "@/modules/overview/domain/overview-financial-summary";
import { parseOverviewFilter } from "@/modules/overview/domain/overview.types";
import { getOverviewFinancialSummary } from "@/modules/overview/queries/get-overview-financial-summary";
import { getOverviewInboxPreview } from "@/modules/overview/queries/get-overview-inbox-preview";
import { getOverviewRecentTransactions } from "@/modules/overview/queries/get-overview-recent-transactions";
import { OverviewFinancialSummaryView } from "@/modules/overview/ui/views/overview-financial-summary-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type WorkspaceOverviewPageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ filter?: string | string[]; period?: string | string[] }>;
};

export default async function WorkspaceOverviewScaffoldPage({
  params,
  searchParams,
}: WorkspaceOverviewPageProps) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const actor = await getAuthenticatedActor();
  const destination = workspaceOverviewPath(workspaceSlug);

  if (!actor) {
    redirect(loginPathForReturnTo(destination));
  }

  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(
    workspaceSlug,
    actor.userId,
  );

  if (!workspace) {
    notFound();
  }

  const now = new Date();
  const period = overviewPeriodFromKey(
    Array.isArray(query.period) ? query.period[0] : query.period,
    workspace.preferences.timezone,
    now,
  );
  const currentPeriodKey = overviewPeriodKey(
    overviewPeriodFromKey(undefined, workspace.preferences.timezone, now),
    workspace.preferences.timezone,
  );
  const [language, summary, recentTransactions, inbox] = await Promise.all([
    getPersistedDashboardLanguage(actor.userId),
    getOverviewFinancialSummary({
      actor,
      workspaceId: workspace.workspace.id,
      filter: parseOverviewFilter(query.filter),
      period,
      currency: workspace.preferences.currency,
      locale: workspace.preferences.locale,
      timeZone: workspace.preferences.timezone,
    }),
    getOverviewRecentTransactions({
      actor,
      workspaceId: workspace.workspace.id,
      limit: 4,
    }),
    getOverviewInboxPreview({
      actor,
      workspaceId: workspace.workspace.id,
      limit: 4,
    }),
  ]);

  return (
    <OverviewFinancialSummaryView
      currentPeriodKey={currentPeriodKey}
      labels={getDashboardLabels(language)}
      periodKey={overviewPeriodKey(period, workspace.preferences.timezone)}
      summary={summary}
      inbox={inbox}
      now={now.toISOString()}
      recentTransactions={recentTransactions}
      timeZone={workspace.preferences.timezone}
      language={language}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
