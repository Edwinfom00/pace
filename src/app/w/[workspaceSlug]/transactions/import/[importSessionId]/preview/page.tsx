import { notFound, redirect } from "next/navigation";

import { AuthorizationError, NotFoundError } from "@/authorization/errors";
import { getAuthenticatedActor } from "@/authorization/session";
import { canPerformWorkspaceAction } from "@/authorization/workspace-permissions";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { isCurrencyCode, toCurrencyCode } from "@/money/currency";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { getImportService } from "@/modules/imports/server";
import { getImportExecutionLabels } from "@/modules/imports/ui/import-execution-labels";
import { importMappingHref } from "@/modules/imports/ui/import-execution-flow";
import { importPreviewHref } from "@/modules/imports/ui/import-mapping-flow";
import { importAccountLabels } from "@/modules/imports/ui/import-execution-labels";
import { ImportReviewView } from "@/modules/imports/ui/views/import-review-view";
import { loadTransactionAccountOptions } from "@/modules/transactions/domain/transaction-account-options";
import { getServerTransactionAccountOptions } from "@/modules/transactions/server/get-transaction-account-options";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";
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
  const workspaceId = workspace.workspace.id;
  const [language, review] = await Promise.all([
    getPersistedDashboardLanguage(actor.userId),
    getImportService()
      .getImportReview(actor, workspaceId, importSessionId)
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
  const accountOptions = await loadTransactionAccountOptions(() =>
    getServerTransactionAccountOptions({ actor, workspaceId }),
  );
  return (
    <ImportReviewView
      accountLabels={importAccountLabels(
        getTransactionUiLabels(getDashboardLabels(language)),
      )}
      accountOptions={accountOptions.accounts}
      defaultCurrency={
        isCurrencyCode(workspace.preferences.currency)
          ? workspace.preferences.currency
          : toCurrencyCode("USD")
      }
      initialReview={review}
      key={review.session.id}
      labels={getImportExecutionLabels(language)}
      language={language}
      locale={workspace.preferences.locale}
      workspaceId={workspaceId}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
