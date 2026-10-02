import { notFound, redirect } from "next/navigation";

import { AuthorizationError, NotFoundError } from "@/authorization/errors";
import { getAuthenticatedActor } from "@/authorization/session";
import { canPerformWorkspaceAction } from "@/authorization/workspace-permissions";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { getImportService } from "@/modules/imports/server";
import { getImportExecutionLabels } from "@/modules/imports/ui/import-execution-labels";
import { importMappingHref } from "@/modules/imports/ui/import-execution-flow";
import { importPreviewHref } from "@/modules/imports/ui/import-mapping-flow";
import { ImportReviewView } from "@/modules/imports/ui/views/import-review-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

export default async function TransactionImportReviewPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; importSessionId: string }>;
}) {
  const { workspaceSlug, importSessionId } = await params;
  const actor = await getAuthenticatedActor();
  if (!actor)
    redirect(
      loginPathForReturnTo(importPreviewHref(workspaceSlug, importSessionId)),
    );
  const workspace =
    await new DatabaseWorkspaceRepository().findMemberContextBySlug(
      workspaceSlug,
      actor.userId,
    );
  if (!workspace) notFound();
  if (!canPerformWorkspaceAction(workspace.membership.role, "manage_ledger")) {
    redirect(`/w/${workspace.workspace.slug}/transactions`);
  }
  const [language, review] = await Promise.all([
    getPersistedDashboardLanguage(actor.userId),
    getImportService()
      .getImportReview(actor, workspace.workspace.id, importSessionId)
      .catch((error: unknown) => {
        if (
          error instanceof NotFoundError ||
          error instanceof AuthorizationError
        )
          return null;
        throw error;
      }),
  ]);
  if (!review) notFound();
  if (review.state === "MAPPING_REQUIRED")
    redirect(importMappingHref(workspace.workspace.slug, importSessionId));
  return (
    <ImportReviewView
      initialReview={review}
      key={review.session.id}
      labels={getImportExecutionLabels(language)}
      locale={workspace.preferences.locale}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
