import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { canPerformWorkspaceAction } from "@/authorization/workspace-permissions";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { transactionImportHref } from "@/modules/imports/ui/import-upload-flow";
import { getImportUploadLabels } from "@/modules/imports/ui/import-upload-labels";
import { ImportUploadView } from "@/modules/imports/ui/views/import-upload-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

export default async function TransactionImportPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo(transactionImportHref(workspaceSlug)));
  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(
    workspaceSlug,
    actor.userId,
  );
  if (!workspace) notFound();
  if (!canPerformWorkspaceAction(workspace.membership.role, "manage_ledger")) {
    redirect(`/w/${workspace.workspace.slug}/transactions`);
  }
  const language = await getPersistedDashboardLanguage(actor.userId);
  return (
    <ImportUploadView
      key={workspace.workspace.id}
      labels={getImportUploadLabels(language)}
      locale={workspace.preferences.locale}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
