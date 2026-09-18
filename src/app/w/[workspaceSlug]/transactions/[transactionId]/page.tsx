import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { getServerTransactionDetail } from "@/modules/transactions/server/get-transaction-detail";
import { getServerTransactionCategoryOptions } from "@/modules/transactions/server/get-transaction-category-options";
import { TransactionDetailView } from "@/modules/transactions/ui/views/transaction-detail-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type TransactionDetailPageProps = {
  params: Promise<{ workspaceSlug: string; transactionId: string }>;
};

export default async function TransactionDetailPage({ params }: TransactionDetailPageProps) {
  const { workspaceSlug, transactionId } = await params;
  const destination = `/w/${workspaceSlug}/transactions/${transactionId}`;
  const actor = await getAuthenticatedActor();

  if (!actor) redirect(loginPathForReturnTo(destination));

  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(workspaceSlug, actor.userId);
  if (!workspace) notFound();

  const [language, transaction, categories] = await Promise.all([
    getPersistedDashboardLanguage(actor.userId),
    getServerTransactionDetail({
      actor,
      workspaceId: workspace.workspace.id,
      transactionId,
      timeZone: workspace.preferences.timezone,
    }),
    getServerTransactionCategoryOptions({ actor, workspaceId: workspace.workspace.id }),
  ]);

 
  if (!transaction) notFound();

  return (
    <TransactionDetailView
      categories={categories}
      language={language}
      locale={workspace.preferences.locale}
      timeZone={workspace.preferences.timezone}
      transaction={transaction}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
    />
  );
}
