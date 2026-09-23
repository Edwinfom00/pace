import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { InboxItemDetailSkeleton } from "@/modules/financial-inbox/ui/components/inbox-item-detail-skeleton";
import { getInboxDetailLabels } from "@/modules/financial-inbox/ui/inbox-detail-labels";

export default async function InboxItemDetailLoading() {
  const actor = await getAuthenticatedActor();
  const language = actor ? await getPersistedDashboardLanguage(actor.userId) : "en";
  return <InboxItemDetailSkeleton loadingLabel={getInboxDetailLabels(getDashboardLabels(language)).loading} />;
}
