import { PaceLogo } from "@/components/pace/brand/pace-logo";
import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { OverviewDailyBrief } from "../../domain/overview-right-rail";
import { formatOverviewRightRailDate } from "../../domain/overview-right-rail-formatters";
import { DailyBriefItem } from "./daily-brief-item";

export function DailyBrief({
  brief,
  unavailable,
  labels,
  locale,
  timeZone,
  now,
}: {
  readonly brief: OverviewDailyBrief | null;
  readonly unavailable: boolean;
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
}) {
  return (
    <section aria-labelledby="overview-daily-brief-heading" className="px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <PaceLogo alt="" height={24} variant="icon" width={24} />
        <span className="text-[13px] font-semibold text-[#263149]">Pace</span>
        <span className="rounded-[5px] bg-[#eef4ff] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-[#2f6fed]">AI</span>
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-3">
        <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[#101a35]" id="overview-daily-brief-heading">
          {labels["overview.dailyBrief.title"]}
        </h2>
        <p className="shrink-0 text-[12px] text-[#71809a]">{formatOverviewRightRailDate(now, locale, timeZone)}</p>
      </div>
      {unavailable ? (
        <p className="pt-4 text-[13px] leading-5 text-[#71809a]" role="status">{labels["overview.dailyBrief.error"]}</p>
      ) : brief?.items.length ? (
        <div className="mt-4 divide-y divide-[#edf0f4]">{brief.items.map((item) => <DailyBriefItem item={item} key={item.id} />)}</div>
      ) : (
        <p className="pt-4 text-[13px] leading-5 text-[#71809a]">{labels["overview.dailyBrief.empty"]}</p>
      )}
    </section>
  );
}
