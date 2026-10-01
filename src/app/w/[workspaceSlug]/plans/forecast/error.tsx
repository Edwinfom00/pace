"use client";
import { type DashboardLanguage } from "@/i18n/dashboard-messages";
import { getPlansUiLabels } from "@/modules/plans/ui/plans-ui-labels";

function currentLanguage(): DashboardLanguage {
  if (typeof navigator === "undefined") return "en";
  const language = navigator.language.toLowerCase();
  return language.startsWith("fr")
    ? "fr"
    : language.startsWith("de")
      ? "de"
      : "en";
}

export default function ForecastError({ reset }: { reset: () => void }) {
  const labels = getPlansUiLabels(currentLanguage()).forecast;
  return (
    <main className="mx-auto grid min-h-100 max-w-355 place-items-center px-5">
      <section className="w-full max-w-lg rounded-[12px] border border-[#fee2e2] bg-[#fff8f8] p-6 text-center">
        <h1 className="text-[16px] font-semibold text-[#b4232f]">
          {labels.errorTitle}
        </h1>
        <p className="mt-2 text-[13px] text-[#71809a]">
          {labels.errorDescription}
        </p>
        <button
          className="mt-4 rounded-[8px] border border-[#dce4ef] bg-white px-4 py-2 text-[13px] font-semibold text-[#34425c]"
          onClick={reset}
          type="button">
          {labels.retry}
        </button>
      </section>
    </main>
  );
}
