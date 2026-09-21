"use client";

import { FiAlertTriangle } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import { getDashboardLabels, toDashboardLanguage } from "@/i18n/dashboard-messages";
import { getRecurringUiLabels } from "@/modules/recurring/ui/recurring-ui-labels";

function currentLanguage() {
  if (typeof navigator === "undefined") return "en";
  return toDashboardLanguage(navigator.language.toLowerCase().slice(0, 2));
}

export default function RecurringError({
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const labels = getRecurringUiLabels(getDashboardLabels(currentLanguage()));
  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <section aria-live="polite" className="flex min-h-70 flex-col items-center justify-center rounded-[12px] border border-[#f1d9d5] bg-[#fffdfd] px-6 text-center">
        <span className="grid size-10 place-items-center rounded-[12px] bg-[#fff2f0] text-[#b5473c]">
          <FiAlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-3 text-[15px] font-semibold text-[#522b26]">{labels.errorTitle}</h1>
        <Button className="mt-4 h-8 rounded-[8px] border-[#ead6d1] bg-white px-3 text-[12px] font-medium text-[#9b4036] hover:bg-[#fff7f6]" onClick={reset} variant="outline">
          {labels.errorRetry}
        </Button>
      </section>
    </main>
  );
}
