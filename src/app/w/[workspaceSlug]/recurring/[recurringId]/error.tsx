"use client";

import { getDashboardLabels, type DashboardLanguage } from "@/i18n/dashboard-messages";
import { getRecurringUiLabels } from "@/modules/recurring/ui/recurring-ui-labels";

function currentLanguage(): DashboardLanguage {
  if (typeof navigator === "undefined") return "en";
  const language = navigator.language.toLowerCase();
  return language.startsWith("fr") ? "fr" : language.startsWith("de") ? "de" : "en";
}

export default function RecurringDetailError({ reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  const labels = getRecurringUiLabels(getDashboardLabels(currentLanguage()));
  return (
    <main className="mx-auto flex min-h-[52vh] w-full max-w-190 flex-col justify-center px-4 py-10 sm:px-6">
      <h1 className="text-[26px] font-semibold tracking-[-0.035em] text-[#101a35]">{labels.errorTitle}</h1>
      <button className="mt-6 inline-flex w-fit items-center rounded-[8px] bg-[#2563eb] px-3.5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]" onClick={reset} type="button">{labels.errorRetry}</button>
    </main>
  );
}
