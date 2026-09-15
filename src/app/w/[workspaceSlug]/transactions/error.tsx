"use client";

import { getDashboardLabels, type DashboardLanguage } from "@/i18n/dashboard-messages";
import { TransactionErrorState } from "@/modules/transactions/ui/components/transaction-error-state";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";

function currentLanguage(): DashboardLanguage {
  if (typeof navigator === "undefined") return "en";
  const language = navigator.language.toLowerCase();
  return language.startsWith("fr") ? "fr" : language.startsWith("de") ? "de" : "en";
}

export default function TransactionsError({ reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  const labels = getTransactionUiLabels(getDashboardLabels(currentLanguage()));
  return <TransactionErrorState onRetry={reset} retry={labels.errorRetry} title={labels.errorTitle} />;
}
