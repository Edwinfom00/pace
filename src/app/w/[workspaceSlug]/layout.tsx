import { notFound, redirect } from "next/navigation";

import { PaceDashboardShell } from "@/components/pace/layout/app-sidebar";
import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import {
  loginPathForReturnTo,
  workspaceOverviewPath,
} from "@/modules/auth/post-auth-resolver";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

export default async function WorkspaceDashboardLayout(props: LayoutProps<"/w/[workspaceSlug]">) {
  const { children, params } = props;
  const { workspaceSlug } = await params;
  const actor = await getAuthenticatedActor();
  const destination = workspaceOverviewPath(workspaceSlug);

  if (!actor) {
    redirect(loginPathForReturnTo(destination));
  }

  const repository = new DatabaseWorkspaceRepository();
  const [activeWorkspace, workspaces, language] = await Promise.all([
    repository.findMemberContextBySlug(workspaceSlug, actor.userId),
    repository.listWorkspacesForUser(actor.userId),
    getPersistedDashboardLanguage(actor.userId),
  ]);

  if (!activeWorkspace) {
    notFound();
  }

  return (
    <PaceDashboardShell
      activeWorkspaceSlug={activeWorkspace.workspace.slug}
      labels={getDashboardLabels(language)}
      workspaces={workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        type: workspace.type,
      }))}
    >
      {children}
    </PaceDashboardShell>
  );
}
