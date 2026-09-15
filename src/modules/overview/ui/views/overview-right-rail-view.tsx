import type { DashboardLabels } from "@/i18n/dashboard-messages";
import type { PacePageContext } from "@/modules/pace-assistant/domain/page-context";

import type { OverviewRightRailData } from "../../queries/get-overview-right-rail";
import { OverviewAskPace } from "../components/overview-ask-pace";
import { OverviewTip } from "../components/overview-tip";
import { UpcomingBills } from "../components/upcoming-bills";
import { DailyBrief } from "../components/daily-brief";

export function OverviewRightRailView({
  rail,
  labels,
  workspaceSlug,
  workspaceId,
  language,
  locale,
  timeZone,
  now,
  pageContext,
}: {
  readonly rail: OverviewRightRailData;
  readonly labels: DashboardLabels;
  readonly workspaceSlug: string;
  readonly workspaceId: string;
  readonly language: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly pageContext: PacePageContext;
}) {
  return (
    <aside aria-label={labels["overview.rightRail.label"]} className="overflow-hidden rounded-[14px] border border-[#e5e9f0] bg-white">
      <DailyBrief brief={rail.dailyBrief} labels={labels} locale={locale} now={now} timeZone={timeZone} unavailable={rail.dailyBriefUnavailable} />
      <UpcomingBills bills={rail.upcomingBills} labels={labels} locale={locale} timeZone={timeZone} unavailable={rail.upcomingBillsUnavailable} workspaceSlug={workspaceSlug} />
      <OverviewTip labels={labels} tip={rail.dailyBrief?.tip ?? null} />
      <OverviewAskPace language={language} locale={locale} pageContext={pageContext} timeZone={timeZone} workspaceId={workspaceId} />
    </aside>
  );
}
