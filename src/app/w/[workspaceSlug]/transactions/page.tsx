import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { isSupportedCurrency } from "@/modules/onboarding/metadata";
import { transactionListHref } from "@/modules/transactions/domain/transaction-list-url";
import { parseTransactionSearchParams } from "@/modules/transactions/queries/transaction-search-params";
import { getServerTransactionsPage } from "@/modules/transactions/server/get-transactions-page";
import { getServerTransactionAccountOptions } from "@/modules/transactions/server/get-transaction-account-options";
import { getServerTransactionCategoryOptions } from "@/modules/transactions/server/get-transaction-category-options";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";
import { TransactionsTableView } from "@/modules/transactions/ui/views/transactions-table-view";
import {
  loadTransactionAccountOptions,
} from "@/modules/transactions/domain/transaction-account-options";
import {
  loadTransactionCategoryOptions,
} from "@/modules/transactions/domain/transaction-category-options";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

type TransactionsPageProps = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransactionsPage({ params, searchParams }: TransactionsPageProps) {
  const [{ workspaceSlug }, query] = await Promise.all([params, searchParams]);
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
  const filters = parseTransactionSearchParams(query);
  const accountOptions = loadTransactionAccountOptions(() => getServerTransactionAccountOptions({
    actor,
    workspaceId: workspace.workspace.id,
  }));
  const categoryOptions = loadTransactionCategoryOptions(() => getServerTransactionCategoryOptions({
    actor,
    workspaceId: workspace.workspace.id,
  }));
  const page = getServerTransactionsPage({
    actor,
    workspaceId: workspace.workspace.id,
    filters,
    timeZone: workspace.preferences.timezone,
    unknownMerchantName: labels.unknownMerchant,
  });
  const [transactionsPage, transactionAccounts, transactionCategories] = await Promise.all([
    page,
    accountOptions,
    categoryOptions,
  ]);
  const canonicalHref = transactionListHref(destination, { ...transactionsPage.filters, page: transactionsPage.page });
  const requestedHref = requestHref(destination, query);


  if (requestedHref !== canonicalHref) redirect(canonicalHref);

  return (
    <TransactionsTableView
      accountOptions={transactionAccounts}
      categoryOptions={transactionCategories}
      amountSortingAvailable={transactionsPage.amountSortingAvailable}
      defaultCurrency={isSupportedCurrency(workspace.preferences.currency) ? workspace.preferences.currency : "USD"}
      filterOptions={transactionsPage.options}
      filterState={{ ...transactionsPage.filters, page: transactionsPage.page }}
      labels={labels}
      locale={workspace.preferences.locale}
      now={new Date().toISOString()}
      pagination={transactionsPage.pagination}
      timeZone={workspace.preferences.timezone}
      transactions={transactionsPage.items}
      workspaceId={workspace.workspace.id}
      workspaceSlug={workspace.workspace.slug}
      language={language}
    />
  );
}

function requestHref(pathname: string, query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}
