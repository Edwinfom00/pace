import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { parseAccountDetailChartRange } from "@/modules/accounts/domain/account-detail";
import { getAccountDetail } from "@/modules/accounts/queries/get-account-detail";
import { getAccountDetailUiLabels } from "@/modules/accounts/ui/account-detail-ui-labels";
import { AccountDetailView } from "@/modules/accounts/ui/views/account-detail-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type AccountDetailPageProps = {
  params: Promise<{ workspaceSlug: string; accountId: string }>;
  searchParams: Promise<{ chart?: string | string[] }>;
};

export default async function AccountDetailPage({ params, searchParams }: AccountDetailPageProps) {
  const [{ workspaceSlug, accountId }, query] = await Promise.all([params, searchParams]);
  const destination = `/w/${workspaceSlug}/accounts/${accountId}`;
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo(destination));

  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(workspaceSlug, actor.userId);
  if (!workspace) notFound();

  const [language, detail] = await Promise.all([
    getPersistedDashboardLanguage(actor.userId),
    getAccountDetail({
      actor,
      workspaceId: workspace.workspace.id,
      accountId,
      chartRange: parseAccountDetailChartRange(query.chart),
      timeZone: workspace.preferences.timezone,
    }),
  ]);
  if (!detail) notFound();

  return (
    <AccountDetailView
      detail={detail}
      labels={getAccountDetailUiLabels(getDashboardLabels(language))}
      language={language}
      locale={workspace.preferences.locale}
      now={new Date().toISOString()}
      timeZone={workspace.preferences.timezone}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
