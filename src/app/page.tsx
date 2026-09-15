import { redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { loginPathForReturnTo, workspaceOverviewPath } from "@/modules/auth/post-auth-resolver";
import { getWorkspaceService } from "@/modules/workspaces/server";

export default async function Home() {
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo("/"));

  const workspaces = await getWorkspaceService().listWorkspaces(actor);
  const workspace = workspaces[0];
  if (!workspace) redirect("/onboarding");

  redirect(workspaceOverviewPath(workspace.slug));
}
