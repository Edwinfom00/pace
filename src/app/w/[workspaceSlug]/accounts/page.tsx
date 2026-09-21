import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { isCurrencyCode, toCurrencyCode } from "@/money/currency";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { parseAccountListFilter } from "@/modules/accounts/domain/accounts-overview";
import { getAccountsOverview } from "@/modules/accounts/queries/get-accounts-overview";
import { getAccountsUiLabels } from "@/modules/accounts/ui/accounts-ui-labels";
import { AccountsOverviewView } from "@/modules/accounts/ui/views/accounts-overview-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type AccountsPageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ filter?: string | string[] }>;
};

export default async function AccountsPage({ params, searchParams }: AccountsPageProps) {
  const [{ workspaceSlug }, query] = await Promise.all([params, searchParams]);
  const destination = `/w/${workspaceSlug}/accounts`;
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo(destination));

  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(workspaceSlug, actor.userId);
  if (!workspace) notFound();

  const language = await getPersistedDashboardLanguage(actor.userId);
  const overview = await getAccountsOverview({
    actor,
    workspaceId: workspace.workspace.id,
    filter: parseAccountListFilter(query.filter),
  });

  return (
    <AccountsOverviewView
      defaultCurrency={isCurrencyCode(workspace.preferences.currency) ? workspace.preferences.currency : toCurrencyCode("USD")}
      labels={getAccountsUiLabels(getDashboardLabels(language))}
      language={language}
      locale={workspace.preferences.locale}
      overview={overview}
      timeZone={workspace.preferences.timezone}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
