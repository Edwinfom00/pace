"use client";

import { getDashboardLabels, type DashboardLanguage } from "@/i18n/dashboard-messages";
import { getAccountsUiLabels } from "@/modules/accounts/ui/accounts-ui-labels";
import { AccountsErrorState } from "@/modules/accounts/ui/components/accounts-error-state";

function currentLanguage(): DashboardLanguage {
  if (typeof navigator === "undefined") return "en";
  const language = navigator.language.toLowerCase();
  return language.startsWith("fr") ? "fr" : language.startsWith("de") ? "de" : "en";
}

export default function AccountsError({ reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  const labels = getAccountsUiLabels(getDashboardLabels(currentLanguage()));
  return <AccountsErrorState onRetry={reset} retry={labels.errorRetry} title={labels.errorTitle} />;
}
