import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { OverviewFinancialSummary } from "../../domain/overview.types";
import { OverviewFilters } from "../components/overview-filters";
import { OverviewKpis } from "../components/overview-kpis";
import { OverviewPeriodControls } from "../components/overview-period-controls";
import { SpendingPaceChart } from "../components/spending-pace-chart";

export function OverviewFinancialSummaryView({
  labels,
  currentPeriodKey,
  periodKey,
  summary,
}: {
  labels: DashboardLabels;
  currentPeriodKey: string;
  periodKey: string;
  summary: OverviewFinancialSummary;
}) {
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto w-full max-w-[1100px] space-y-4 sm:space-y-5">
        <OverviewPeriodControls
          currentPeriodKey={currentPeriodKey}
          labels={labels}
          locale={summary.locale}
          periodKey={periodKey}
        />
        <OverviewFilters labels={labels} selectedFilter={summary.filter} />
        <OverviewKpis labels={labels} summary={summary} />
        <SpendingPaceChart labels={labels} summary={summary} />
      </div>
    </main>
  );
}
