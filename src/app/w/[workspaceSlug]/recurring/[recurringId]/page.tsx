import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { parseRecurringDetailTab } from "@/modules/recurring/domain/recurring-detail";
import { getRecurringDetail } from "@/modules/recurring/queries/get-recurring-detail";
import { getRecurringDetailUiLabels } from "@/modules/recurring/ui/recurring-detail-ui-labels";
import { RecurringDetailView } from "@/modules/recurring/ui/views/recurring-detail-view";
import { loadTransactionAccountOptions } from "@/modules/transactions/domain/transaction-account-options";
import { loadTransactionCategoryOptions } from "@/modules/transactions/domain/transaction-category-options";
import { getServerTransactionAccountOptions } from "@/modules/transactions/server/get-transaction-account-options";
import { getServerTransactionCategoryOptions } from "@/modules/transactions/server/get-transaction-category-options";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type RecurringDetailPageProps = {
  params: Promise<{ workspaceSlug: string; recurringId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export default async function RecurringDetailPage({ params, searchParams }: RecurringDetailPageProps) {
  const [{ workspaceSlug, recurringId }, query] = await Promise.all([params, searchParams]);
  const destination = `/w/${workspaceSlug}/recurring/${recurringId}`;
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo(destination));

  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(workspaceSlug, actor.userId);
  // Intentionally return the canonical not-found response for a missing or
  // inaccessible workspace, preserving the same non-enumerating boundary as
  // every workspace detail route.
  if (!workspace) notFound();

  const [language, detail, recurringAccounts, recurringCategories] = await Promise.all([
    getPersistedDashboardLanguage(actor.userId),
    getRecurringDetail({
      actor,
      workspaceId: workspace.workspace.id,
      recurringId,
      timeZone: workspace.preferences.timezone,
    }),
    loadTransactionAccountOptions(() => getServerTransactionAccountOptions({
      actor,
      workspaceId: workspace.workspace.id,
    })),
    loadTransactionCategoryOptions(() => getServerTransactionCategoryOptions({
      actor,
      workspaceId: workspace.workspace.id,
    })),
  ]);
  // The composed reader only searches recurring records within workspaceId.
  if (!detail) notFound();

  return (
    <RecurringDetailView
      detail={detail}
      accountAvailability={recurringAccounts.status}
      accountOptions={recurringAccounts.accounts}
      categoryAvailability={recurringCategories.status}
      categoryOptions={recurringCategories.categories}
      labels={getRecurringDetailUiLabels(getDashboardLabels(language))}
      language={language}
      locale={workspace.preferences.locale}
      now={new Date().toISOString()}
      selectedTab={parseRecurringDetailTab(query.tab)}
      timeZone={workspace.preferences.timezone}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
