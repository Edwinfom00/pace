import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { parseInboxOverviewSearchParams } from "@/modules/financial-inbox/queries/inbox-overview-search-params";
import { getServerInboxOverview } from "@/modules/financial-inbox/server/get-inbox-overview";
import { InboxOverviewView } from "@/modules/financial-inbox/ui/views/inbox-overview-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type InboxPageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InboxPage({ params, searchParams }: InboxPageProps) {
  const [{ workspaceSlug }, query] = await Promise.all([params, searchParams]);
  const destination = `/w/${workspaceSlug}/inbox`;
  const actor = await getAuthenticatedActor();

  if (!actor) redirect(loginPathForReturnTo(destination));

  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(
    workspaceSlug,
    actor.userId,
  );
  if (!workspace) notFound();

  const language = await getPersistedDashboardLanguage(actor.userId);
  const labels = getDashboardLabels(language);
  const filters = parseInboxOverviewSearchParams(query);
  const overview = await getServerInboxOverview({
    actor,
    workspaceId: workspace.workspace.id,
    reason: filters.reason,
    sort: filters.sort,
    page: filters.page,
    unknownMerchantName: labels["transactions.merchant.unknown"],
  });

  return (
    <InboxOverviewView
      labels={labels}
      language={language}
      locale={workspace.preferences.locale}
      now={new Date().toISOString()}
      overview={overview}
      timeZone={workspace.preferences.timezone}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
