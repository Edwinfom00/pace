import Link from "next/link";
import { FiAlertCircle, FiRepeat } from "react-icons/fi";

import type { ForecastLabels } from "@/modules/forecast/ui/forecast-format";

export function ForecastEmptyState({
  labels,
  workspaceSlug,
}: {
  labels: ForecastLabels;
  workspaceSlug: string;
}) {
  return (
    <section className="grid min-h-80 place-items-center rounded-[14px] border border-[#e5eaf1] bg-white px-5 py-12 text-center">
      <div className="max-w-sm">
        <span
          aria-hidden
          className="mx-auto grid size-12 place-items-center rounded-full bg-[#eaf2ff] text-[#1769e8]">
          <FiRepeat className="size-5" />
        </span>
        <h2 className="mt-4 text-[16px] font-semibold text-[#18243b]">
          {labels.noRecurringTitle}
        </h2>
        <p className="mt-2 text-[13px] leading-5 text-[#71809a]">
          {labels.noRecurringDescription}
        </p>
        <Link
          className="mt-5 inline-flex h-10 items-center rounded-[9px] bg-[#1769e8] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#105bd0] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#1769e8]"
          href={`/w/${workspaceSlug}/recurring`}>
          {labels.addRecurring}
        </Link>
      </div>
    </section>
  );
}

export function ForecastErrorState({
  labels,
  onRetry,
}: {
  labels: ForecastLabels;
  onRetry: () => void;
}) {
  return (
    <section
      className="grid min-h-80 place-items-center rounded-[14px] border border-[#fbd5d9] bg-[#fff5f6] px-5 py-12 text-center"
      role="alert">
      <div className="max-w-sm">
        <span
          aria-hidden
          className="mx-auto grid size-11 place-items-center rounded-[11px] bg-[#e5484d] text-white shadow-[0_6px_16px_rgb(229_72_77/28%)]">
          <FiAlertCircle className="size-5" />
        </span>
        <h2 className="mt-4 text-[16px] font-semibold text-[#c62f3b]">
          {labels.errorTitle}
        </h2>
        <p className="mt-2 text-[13px] leading-5 text-[#71809a]">
          {labels.errorDescription}
        </p>
        <button
          className="mt-5 inline-flex h-10 min-w-28 items-center justify-center rounded-[9px] border border-[#dce4ef] bg-white px-5 text-[13px] font-semibold text-[#34425c] transition-colors hover:border-[#b9c8dc] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#1769e8]"
          onClick={onRetry}
          type="button">
          {labels.retry}
        </button>
      </div>
    </section>
  );
}
