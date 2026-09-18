"use client";

import { getDashboardLabels, type DashboardLanguage } from "@/i18n/dashboard-messages";
import { TransactionErrorState } from "@/modules/transactions/ui/components/transaction-error-state";
import { getTransactionDetailLabels } from "@/modules/transactions/ui/transaction-detail-labels";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";

function currentLanguage(): DashboardLanguage {
  if (typeof navigator === "undefined") return "en";
  const language = navigator.language.toLowerCase();
  return language.startsWith("fr") ? "fr" : language.startsWith("de") ? "de" : "en";
}

export default function TransactionDetailError({ reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  const language = currentLanguage();
  const labels = getTransactionDetailLabels(getDashboardLabels(language));
  const transactionLabels = getTransactionUiLabels(getDashboardLabels(language));

  return <TransactionErrorState onRetry={reset} retry={transactionLabels.errorRetry} title={labels.errorTitle} />;
}
