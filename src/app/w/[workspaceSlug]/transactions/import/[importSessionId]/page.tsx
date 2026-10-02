import { notFound, redirect } from "next/navigation";

import { AuthorizationError, NotFoundError } from "@/authorization/errors";
import { getAuthenticatedActor } from "@/authorization/session";
import { canPerformWorkspaceAction } from "@/authorization/workspace-permissions";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { initialColumnAssignments } from "@/modules/imports/mapping/column-mapping";
import { getImportService } from "@/modules/imports/server";
import { getImportMappingLabels } from "@/modules/imports/ui/import-mapping-labels";
import { importSessionHref } from "@/modules/imports/ui/import-upload-flow";
import { ImportMappingView } from "@/modules/imports/ui/views/import-mapping-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

export default async function TransactionImportMappingPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; importSessionId: string }>;
}) {
  const { workspaceSlug, importSessionId } = await params;
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo(importSessionHref(workspaceSlug, importSessionId)));
  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(workspaceSlug, actor.userId);
  if (!workspace) notFound();
  if (!canPerformWorkspaceAction(workspace.membership.role, "manage_ledger")) {
    redirect(`/w/${workspace.workspace.slug}/transactions`);
  }
  const [language, view] = await Promise.all([
    getPersistedDashboardLanguage(actor.userId),
    getImportService()
      .getColumnMapping(actor, workspace.workspace.id, importSessionId)
      .catch((error: unknown) => {
        if (error instanceof NotFoundError || error instanceof AuthorizationError) return null;
        throw error;
      }),
  ]);
  if (!view) notFound();
  return (
    <ImportMappingView
      columns={view.columns}
      editable={view.editable}
      initialAssignments={initialColumnAssignments(view.columns, view.saved)}
      key={`${view.session.id}:${view.session.fileChecksum}`}
      labels={getImportMappingLabels(language)}
      locale={workspace.preferences.locale}
      session={view.session}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
