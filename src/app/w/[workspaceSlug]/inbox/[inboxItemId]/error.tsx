"use client";

import { getDashboardLabels, type DashboardLanguage } from "@/i18n/dashboard-messages";
import { TransactionErrorState } from "@/modules/transactions/ui/components/transaction-error-state";

import { getInboxDetailLabels } from "@/modules/financial-inbox/ui/inbox-detail-labels";

function currentLanguage(): DashboardLanguage {
  if (typeof navigator === "undefined") return "en";
  const language = navigator.language.toLowerCase();
  return language.startsWith("fr") ? "fr" : language.startsWith("de") ? "de" : "en";
}

export default function InboxItemDetailError({ reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  const dashboardLabels = getDashboardLabels(currentLanguage());
  const labels = getInboxDetailLabels(dashboardLabels);
  return <TransactionErrorState onRetry={reset} retry={dashboardLabels["transactions.error.retry"]} title={labels.errorTitle} />;
}
