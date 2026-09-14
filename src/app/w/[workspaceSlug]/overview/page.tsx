import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import {
  loginPathForReturnTo,
  workspaceOverviewPath,
} from "@/modules/auth/post-auth-resolver";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type WorkspaceOverviewPageProps = {
  params: Promise<{ workspaceSlug: string }>;
};


export default async function WorkspaceOverviewScaffoldPage({ params }: WorkspaceOverviewPageProps) {
  const { workspaceSlug } = await params;
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

  return <div data-temporary-route="workspace-overview" />;
}
