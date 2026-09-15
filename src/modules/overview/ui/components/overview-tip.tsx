import { FiSun } from "react-icons/fi";

import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { OverviewTip as OverviewTipData } from "../../domain/overview-right-rail";

export function OverviewTip({ tip, labels }: { readonly tip: OverviewTipData | null; readonly labels: DashboardLabels }) {
  if (!tip) return null;
  return (
    <section aria-label={labels["overview.tip.label"]} className="border-t border-[#edf0f4] px-5 py-5 sm:px-6">
      <div className="flex gap-3 rounded-[10px] bg-[#f1f6ff] px-3.5 py-3 text-[#405777]">
        <FiSun aria-hidden className="mt-0.5 size-4 shrink-0 text-[#2d6df6]" />
        <p className="text-[12px] leading-5"><span className="font-medium text-[#2563eb]">{labels["overview.tip.label"]}:</span> {tip.text}</p>
      </div>
    </section>
  );
}
