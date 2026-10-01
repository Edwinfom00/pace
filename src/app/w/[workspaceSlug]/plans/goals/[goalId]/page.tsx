import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { getSavingsGoalDetail } from "@/modules/plans/queries/get-savings-goal-detail";
import { SavingsGoalDetailView } from "@/modules/plans/ui/views/savings-goal-detail-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

export default async function SavingsGoalPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; goalId: string }>;
}) {
  const { workspaceSlug, goalId } = await params;
  const actor = await getAuthenticatedActor();
  if (!actor)
    redirect(loginPathForReturnTo(`/w/${workspaceSlug}/plans/goals/${goalId}`));
  const workspace =
    await new DatabaseWorkspaceRepository().findMemberContextBySlug(
      workspaceSlug,
      actor.userId,
    );
  if (!workspace) notFound();
  const [language, detail] = await Promise.all([
    getPersistedDashboardLanguage(actor.userId),
    getSavingsGoalDetail({
      actor,
      workspaceId: workspace.workspace.id,
      goalId,
      now: new Date(),
    }),
  ]);
  if (!detail) notFound();
  return (
    <SavingsGoalDetailView
      detail={detail}
      language={language}
      locale={workspace.preferences.locale}
      timeZone={workspace.preferences.timezone}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspaceSlug}
    />
  );
}
