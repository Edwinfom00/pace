import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { isCurrencyCode, toCurrencyCode } from "@/money/currency";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { parseRecurringOverviewFilter } from "@/modules/recurring/domain/recurring-overview";
import { getRecurringOverview } from "@/modules/recurring/queries/get-recurring-overview";
import { getRecurringUiLabels } from "@/modules/recurring/ui/recurring-ui-labels";
import { RecurringOverviewView } from "@/modules/recurring/ui/views/recurring-overview-view";
import { loadTransactionAccountOptions } from "@/modules/transactions/domain/transaction-account-options";
import { loadTransactionCategoryOptions } from "@/modules/transactions/domain/transaction-category-options";
import { getServerTransactionAccountOptions } from "@/modules/transactions/server/get-transaction-account-options";
import { getServerTransactionCategoryOptions } from "@/modules/transactions/server/get-transaction-category-options";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type RecurringPageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ filter?: string | string[] }>;
};

export default async function RecurringPage({ params, searchParams }: RecurringPageProps) {
  const [{ workspaceSlug }, query] = await Promise.all([params, searchParams]);
  const destination = `/w/${workspaceSlug}/recurring`;
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo(destination));

  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(workspaceSlug, actor.userId);
  if (!workspace) notFound();

  const language = await getPersistedDashboardLanguage(actor.userId);
  const overview = getRecurringOverview({
    actor,
    workspaceId: workspace.workspace.id,
    filter: parseRecurringOverviewFilter(query.filter),
    timeZone: workspace.preferences.timezone,
  });
  const accountOptions = loadTransactionAccountOptions(() => getServerTransactionAccountOptions({
    actor,
    workspaceId: workspace.workspace.id,
  }));
  const categoryOptions = loadTransactionCategoryOptions(() => getServerTransactionCategoryOptions({
    actor,
    workspaceId: workspace.workspace.id,
  }));
  const [recurringOverview, recurringAccounts, recurringCategories] = await Promise.all([
    overview,
    accountOptions,
    categoryOptions,
  ]);

  return (
    <RecurringOverviewView
      language={language}
      labels={getRecurringUiLabels(getDashboardLabels(language))}
      locale={workspace.preferences.locale}
      overview={recurringOverview}
      timeZone={workspace.preferences.timezone}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
      accountOptions={recurringAccounts.accounts}
      accountAvailability={recurringAccounts.status}
      categoryOptions={recurringCategories.categories}
      categoryAvailability={recurringCategories.status}
      defaultCurrency={isCurrencyCode(workspace.preferences.currency) ? workspace.preferences.currency : toCurrencyCode("USD")}
    />
  );
}
