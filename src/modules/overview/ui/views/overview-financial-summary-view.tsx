import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { OverviewFinancialSummary } from "../../domain/overview.types";
import type { OverviewRightRailData } from "../../queries/get-overview-right-rail";
import { OverviewFilters } from "../components/overview-filters";
import { OverviewKpis } from "../components/overview-kpis";
import { OverviewPeriodControls } from "../components/overview-period-controls";
import { SpendingPaceChart } from "../components/spending-pace-chart";
import type {
  OverviewInboxPreview,
  OverviewRecentTransaction,
} from "../../domain/overview-activity.types";
import { OverviewActivityView } from "./overview-activity-view";
import { OverviewRightRailView } from "./overview-right-rail-view";

export function OverviewFinancialSummaryView({
  labels,
  currentPeriodKey,
  periodKey,
  summary,
  recentTransactions,
  inbox,
  workspaceSlug,
  workspaceId,
  language,
  timeZone,
  now,
  rightRail,
}: {
  labels: DashboardLabels;
  currentPeriodKey: string;
  periodKey: string;
  summary: OverviewFinancialSummary;
  recentTransactions: readonly OverviewRecentTransaction[];
  inbox: OverviewInboxPreview;
  workspaceSlug: string;
  workspaceId: string;
  language: "en" | "fr" | "de";
  timeZone: string;
  now: string;
  rightRail: OverviewRightRailData;
}) {
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto grid w-full max-w-[1420px] gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(330px,26vw,370px)] xl:items-start">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <OverviewPeriodControls
            currentPeriodKey={currentPeriodKey}
            labels={labels}
            locale={summary.locale}
            periodKey={periodKey}
          />
          <OverviewFilters labels={labels} selectedFilter={summary.filter} />
          <OverviewKpis labels={labels} summary={summary} />
          <SpendingPaceChart labels={labels} summary={summary} />
          <OverviewActivityView
            inbox={inbox}
            labels={labels}
            locale={summary.locale}
            now={now}
            recentTransactions={recentTransactions}
            timeZone={timeZone}
            workspaceSlug={workspaceSlug}
          />
        </div>
        <div className="min-w-0 xl:sticky xl:top-5">
          <OverviewRightRailView
            labels={labels}
            language={language}
            locale={summary.locale}
            now={now}
            pageContext={{ page: "overview", period: periodKey, transactionType: summary.filter }}
            rail={rightRail}
            timeZone={timeZone}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
          />
        </div>
      </div>
    </main>
  );
}
