import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { TransactionDetailSkeleton } from "@/modules/transactions/ui/components/transaction-detail-skeleton";
import { getTransactionDetailLabels } from "@/modules/transactions/ui/transaction-detail-labels";

export default async function TransactionDetailLoading() {
  const actor = await getAuthenticatedActor();
  const language = actor ? await getPersistedDashboardLanguage(actor.userId) : "en";
  const labels = getTransactionDetailLabels(getDashboardLabels(language));

  return <TransactionDetailSkeleton loadingLabel={labels.loading} />;
}
