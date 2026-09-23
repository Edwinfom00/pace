import { redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { getWorkspaceService } from "@/modules/workspaces/server";

export default async function InboxPage() {
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo("/inbox"));

  const workspace = (await getWorkspaceService().listWorkspaces(actor))[0];
  if (!workspace) redirect("/onboarding");

  redirect(`/w/${workspace.slug}/inbox`);
}
