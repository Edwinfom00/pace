import Link from "next/link";
import { FiBarChart2 } from "react-icons/fi";

import type { DashboardLabels } from "@/i18n/dashboard-messages";

export function InsightsEmptyState({
  labels,
  workspaceSlug,
}: {
  readonly labels: DashboardLabels;
  readonly workspaceSlug: string;
}) {
  return (
    <section className="flex min-h-[320px] flex-col items-center justify-center rounded-[10px] border border-[#e8ecf2] bg-white px-6 py-10 text-center">
      <span aria-hidden="true" className="grid size-11 place-items-center rounded-[12px] bg-[#eef4ff] text-[#2f6fed]">
        <FiBarChart2 className="size-5" />
      </span>
      <h2 className="mt-4 text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]">{labels["insights.empty.title"]}</h2>
      <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-[#667085]">{labels["insights.empty.description"]}</p>
      <Link
        className="mt-5 inline-flex h-9 items-center rounded-[8px] border border-[#e5eaf1] bg-white px-3.5 text-[13px] font-medium text-[#25314a] outline-none transition-colors hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
        href={`/w/${workspaceSlug}/transactions`}
      >
        {labels["insights.empty.action"]}
      </Link>
    </section>
  );
}
