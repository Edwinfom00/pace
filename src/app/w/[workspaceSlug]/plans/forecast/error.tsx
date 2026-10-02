"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FiArrowLeft } from "react-icons/fi";

import { type DashboardLanguage } from "@/i18n/dashboard-messages";
import { ForecastErrorState } from "@/modules/forecast/ui/components/forecast-state-panels";
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
  const labels = getPlansUiLabels(currentLanguage());
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-355">
        <Link
          className="inline-flex items-center gap-2 text-[13px] text-[#526788] hover:text-[#14213c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          href={`/w/${workspaceSlug}/plans`}
        >
          <FiArrowLeft aria-hidden />
          {labels.forecast.back}
        </Link>
        <h1 className="mt-4 text-[28px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">
          {labels.forecast.title}
        </h1>
        <div className="mt-6">
          <ForecastErrorState labels={labels.forecast} onRetry={reset} />
        </div>
      </div>
    </main>
  );
}
