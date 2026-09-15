import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import {
  transactionUiFixturePagination,
  transactionUiFixtures,
} from "@/modules/transactions/fixtures/transaction-ui-fixtures";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";
import { TransactionsTableView } from "@/modules/transactions/ui/views/transactions-table-view";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type TransactionsPageProps = {
  params: Promise<{ workspaceSlug: string }>;
};

export default async function TransactionsPage({ params }: TransactionsPageProps) {
  const { workspaceSlug } = await params;
  const destination = `/w/${workspaceSlug}/transactions`;
  const actor = await getAuthenticatedActor();

  if (!actor) {
    redirect(loginPathForReturnTo(destination));
  }

  const workspace = await new DatabaseWorkspaceRepository().findMemberContextBySlug(
    workspaceSlug,
    actor.userId,
  );

  if (!workspace) notFound();

  const language = await getPersistedDashboardLanguage(actor.userId);
  const labels = getTransactionUiLabels(getDashboardLabels(language));
  const showDevelopmentFixtures = process.env.NODE_ENV === "development";

  return (
    <TransactionsTableView
      labels={labels}
      locale={workspace.preferences.locale}
      now={new Date().toISOString()}
      pagination={showDevelopmentFixtures ? transactionUiFixturePagination : undefined}
      timeZone={workspace.preferences.timezone}
      transactions={showDevelopmentFixtures ? transactionUiFixtures : []}
    />
  );
}
