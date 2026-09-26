import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getSafeInternalReturnTo, loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { getServerInboxItemDetail } from "@/modules/financial-inbox/server/get-inbox-item-detail";
import { getInboxDetailLabels } from "@/modules/financial-inbox/ui/inbox-detail-labels";
import { InboxItemDetailView } from "@/modules/financial-inbox/ui/views/inbox-item-detail-view";
import { loadTransactionCategoryOptions } from "@/modules/transactions/domain/transaction-category-options";
import { getServerTransactionCategoryOptions } from "@/modules/transactions/server/get-transaction-category-options";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type InboxItemDetailPageProps = {
  params: Promise<{ workspaceSlug: string; inboxItemId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

export default async function InboxItemDetailPage({ params, searchParams }: InboxItemDetailPageProps) {
  const [{ workspaceSlug, inboxItemId }, query] = await Promise.all([params, searchParams]);
  const destination = `/w/${workspaceSlug}/inbox/${inboxItemId}`;
  const actor = await getAuthenticatedActor();
  if (!actor) redirect(loginPathForReturnTo(destination));

  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(workspaceSlug, actor.userId);
  // Keep foreign and malformed workspace URLs behind the shared 404 boundary.
  if (!workspace) notFound();

  const language = await getPersistedDashboardLanguage(actor.userId);
  const labels = getDashboardLabels(language);
  const [detail, categoryOptions] = await Promise.all([
    getServerInboxItemDetail({
      actor,
      workspaceId: workspace.workspace.id,
      inboxItemId,
      unknownMerchantName: labels["transactions.merchant.unknown"],
    }),
    loadTransactionCategoryOptions(() => getServerTransactionCategoryOptions({
      actor,
      workspaceId: workspace.workspace.id,
    })),
  ]);

  if (!detail) notFound();

  return (
    <InboxItemDetailView
      backHref={inboxBackHref(workspace.workspace.slug, query.returnTo)}
      categoryOptions={categoryOptions}
      detail={detail}
      labels={getInboxDetailLabels(labels)}
      locale={workspace.preferences.locale}
      timeZone={workspace.preferences.timezone}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}

function inboxBackHref(workspaceSlug: string, returnTo: string | string[] | undefined): string {
  const fallback = `/w/${workspaceSlug}/inbox`;
  const requested = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const safe = getSafeInternalReturnTo(requested);
  if (!safe) return fallback;
  try {
    const parsed = new URL(safe, "https://pace.internal");
    return parsed.pathname === fallback ? `${parsed.pathname}${parsed.search}` : fallback;
  } catch {
    return fallback;
  }
}
