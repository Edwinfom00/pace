import Link from "next/link";

import { getAuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { getTransactionDetailLabels } from "@/modules/transactions/ui/transaction-detail-labels";

export default async function TransactionDetailNotFound() {
  const actor = await getAuthenticatedActor();
  const language = actor ? await getPersistedDashboardLanguage(actor.userId) : "en";
  const labels = getTransactionDetailLabels(getDashboardLabels(language));

  return (
    <main className="mx-auto flex min-h-[52vh] w-full max-w-190 flex-col justify-center px-4 py-10 sm:px-6">
      <p className="text-[13px] font-medium text-[#637491]">{labels.notFound.eyebrow}</p>
      <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[#101a35]">{labels.notFound.title}</h1>
      <p className="mt-3 max-w-140 text-[14px] leading-6 text-[#71809a]">{labels.notFound.description}</p>
      <Link className="mt-6 inline-flex w-fit items-center rounded-[8px] bg-[#2563eb] px-3.5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]" href="../">{labels.notFound.back}</Link>
    </main>
  );
}
