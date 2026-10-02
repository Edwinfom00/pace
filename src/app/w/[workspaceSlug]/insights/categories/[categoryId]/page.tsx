import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { calendarMonthPeriod } from "@/money/period";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { getCategoryAnalysis } from "@/modules/insights/category/category-analysis-server";
import {
  parseInsightsCurrency,
  parseInsightsRange,
} from "@/modules/insights/overview/insights-overview.types";
import { CategoryAnalysisView } from "@/modules/insights/ui/views/category-analysis-view";
import { overviewPeriodKey } from "@/modules/overview/domain/overview-financial-summary";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type InsightsCategoryPageProps = {
  params: Promise<{ workspaceSlug: string; categoryId: string }>;
  searchParams: Promise<{
    period?: string | string[];
    range?: string | string[];
    currency?: string | string[];
  }>;
};

export default async function InsightsCategoryPage({
  params,
  searchParams,
}: InsightsCategoryPageProps) {
  const { workspaceSlug, categoryId } = await params;
  const query = await searchParams;
  const actor = await getAuthenticatedActor();

  if (!actor) {
    redirect(
      loginPathForReturnTo(
        `/w/${workspaceSlug}/insights/categories/${encodeURIComponent(categoryId)}`,
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
  const analysis = await getCategoryAnalysis({
    actor,
    workspaceId: workspace.workspace.id,
    categoryId,
    workspaceCurrency: currency,
    locale,
    timeZone: timezone,
    labels,
    range: parseInsightsRange(query.range),
    periodKey: Array.isArray(query.period) ? query.period[0] : query.period,
    requestedCurrency: parseInsightsCurrency(query.currency),
    now,
  });

  if (!analysis) {
    notFound();
  }

  return (
    <CategoryAnalysisView
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
