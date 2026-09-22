import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { parseRecurringOverviewFilter } from "@/modules/recurring/domain/recurring-overview";
import { getRecurringOverview } from "@/modules/recurring/queries/get-recurring-overview";
import { getRecurringUiLabels } from "@/modules/recurring/ui/recurring-ui-labels";
import { RecurringOverviewView } from "@/modules/recurring/ui/views/recurring-overview-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type RecurringPageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ filter?: string | string[] }>;
};

export default async function RecurringPage({ params, searchParams }: RecurringPageProps) {
  const [{ workspaceSlug }, query] = await Promise.all([params, searchParams]);
  const destination = `/w/${workspaceSlug}/recurring`;
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo(destination));

  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(workspaceSlug, actor.userId);
  if (!workspace) notFound();

  const language = await getPersistedDashboardLanguage(actor.userId);
  const overview = await getRecurringOverview({
    actor,
    workspaceId: workspace.workspace.id,
    filter: parseRecurringOverviewFilter(query.filter),
    timeZone: workspace.preferences.timezone,
  });

  return (
    <RecurringOverviewView
      language={language}
      labels={getRecurringUiLabels(getDashboardLabels(language))}
      locale={workspace.preferences.locale}
      overview={overview}
      timeZone={workspace.preferences.timezone}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
