import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { calendarMonthPeriod } from "@/money/period";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { parseInsightsCurrency } from "@/modules/insights/overview/insights-overview.types";
import { getInsightsRecurring } from "@/modules/insights/recurring/insights-recurring-server";
import { parseRecurringHorizon } from "@/modules/insights/recurring/insights-recurring.types";
import { parseTrendsRange } from "@/modules/insights/trends/insights-trends.types";
import { InsightsRecurringView } from "@/modules/insights/ui/views/insights-recurring-view";
import { overviewPeriodKey } from "@/modules/overview/domain/overview-financial-summary";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type InsightsRecurringPageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    period?: string | string[];
    range?: string | string[];
    currency?: string | string[];
    horizon?: string | string[];
  }>;
};

export default async function InsightsRecurringPage({
  params,
  searchParams,
}: InsightsRecurringPageProps) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const actor = await getAuthenticatedActor();

  if (!actor) {
    redirect(loginPathForReturnTo(`/w/${workspaceSlug}/insights/recurring`));
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
  const recurring = await getInsightsRecurring({
    actor,
    workspaceId: workspace.workspace.id,
    workspaceCurrency: currency,
    locale,
    timeZone: timezone,
    range: parseTrendsRange(query.range),
    horizon: parseRecurringHorizon(query.horizon),
    periodKey: Array.isArray(query.period) ? query.period[0] : query.period,
    requestedCurrency: parseInsightsCurrency(query.currency),
    now,
  });

  return (
    <InsightsRecurringView
      currentPeriodKey={overviewPeriodKey(
        calendarMonthPeriod(now, timezone),
        timezone,
      )}
      labels={getDashboardLabels(language)}
      recurring={recurring}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
