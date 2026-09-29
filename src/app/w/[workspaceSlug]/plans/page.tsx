import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { getPlansOverview } from "@/modules/plans/queries/get-plans-overview";
import { getPlansUiLabels } from "@/modules/plans/ui/plans-ui-labels";
import { PlansOverviewView } from "@/modules/plans/ui/views/plans-overview-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

export default async function PlansPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const destination = `/w/${workspaceSlug}/plans`;
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo(destination));
  const workspace =
    await new DatabaseWorkspaceRepository().findMemberContextBySlug(
      workspaceSlug,
      actor.userId,
    );
  if (!workspace) notFound();
  const [language, overview] = await Promise.all([
    getPersistedDashboardLanguage(actor.userId),
    getPlansOverview({
      actor,
      workspaceId: workspace.workspace.id,
      now: new Date(),
    }),
  ]);
  return (
    <PlansOverviewView
      labels={getPlansUiLabels(language)}
      language={language}
      locale={workspace.preferences.locale}
      overview={overview}
      timeZone={workspace.preferences.timezone}
      workspaceId={workspace.workspace.id}
    />
  );
}
