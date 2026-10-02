import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { InsightsAccountSummary } from "../../account/account-analysis.types";
import type {
  InsightsDeterministicInsights,
  InsightsOverview,
} from "../../overview/insights-overview.types";
import { InsightsAccounts } from "../components/insights-accounts";
import { InsightsCategoryBreakdown } from "../components/insights-category-breakdown";
import { InsightsEmptyState } from "../components/insights-empty-state";
import { InsightsIncomeSpendingChart } from "../components/insights-income-spending-chart";
import { InsightsKpis } from "../components/insights-kpis";
import {
  InsightsLoadingSurface,
  InsightsNavigationProvider,
} from "../components/insights-navigation";
import { InsightsRightRail } from "../components/insights-right-rail";
import { InsightsSpendingTrendChart } from "../components/insights-spending-trend-chart";
import {
  InsightsFilters,
  InsightsPeriodControls,
} from "../components/insights-toolbar";
import { InsightsTopChanges } from "../components/insights-top-changes";
import {
  formatComparisonPeriod,
  formatInsightsWindow,
} from "../insights-format";

export function InsightsOverviewView({
  accounts,
  currentPeriodKey,
  insights,
  labels,
  overview,
  workspaceSlug,
}: {
  readonly accounts: readonly InsightsAccountSummary[];
  readonly currentPeriodKey: string;
  readonly insights: InsightsDeterministicInsights;
  readonly labels: DashboardLabels;
  readonly overview: InsightsOverview;
  readonly workspaceSlug: string;
}) {
  return (
    <InsightsNavigationProvider>
      <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
        <h1 className="sr-only">{labels["insights.page.title"]}</h1>
        <div className="mx-auto grid w-full max-w-355 gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(330px,26vw,370px)] xl:items-start">
          <div className="min-w-0 space-y-4 sm:space-y-5">
            <div className="space-y-1">
              <InsightsPeriodControls
                currentPeriodKey={currentPeriodKey}
                labels={labels}
                locale={overview.locale}
                periodKey={overview.periodKey}
              />
              <p className="text-[13px] leading-5 text-[#667085]">
                {formatInsightsWindow(overview.current, overview.locale)}
                <span aria-hidden="true"> · </span>
                <span className="text-[#8a96ab]">
                  {formatComparisonPeriod(
                    overview.previous,
                    labels,
                    overview.locale,
                  )}
                </span>
              </p>
            </div>
            <InsightsFilters
              currencies={overview.currencies}
              currency={overview.currency}
              labels={labels}
              range={overview.range}
              workspaceCurrency={overview.workspaceCurrency}
            />
            <InsightsLoadingSurface labels={labels}>
              {overview.hasActivity ? (
                <div className="space-y-4 sm:space-y-5">
                  <InsightsKpis labels={labels} overview={overview} />
                  <InsightsSpendingTrendChart
                    labels={labels}
                    overview={overview}
                  />
                  <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
                    <InsightsIncomeSpendingChart
                      labels={labels}
                      overview={overview}
                    />
                    <InsightsCategoryBreakdown
                      labels={labels}
                      overview={overview}
                      workspaceSlug={workspaceSlug}
                    />
                  </div>
                  <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
                    <InsightsTopChanges labels={labels} overview={overview} />
                    <InsightsAccounts
                      accounts={accounts}
                      labels={labels}
                      overview={overview}
                      workspaceSlug={workspaceSlug}
                    />
                  </div>
                </div>
              ) : (
                <InsightsEmptyState
                  labels={labels}
                  workspaceSlug={workspaceSlug}
                />
              )}
            </InsightsLoadingSurface>
          </div>
          <div className="min-w-0 xl:sticky xl:top-5">
            <InsightsRightRail
              insights={insights}
              labels={labels}
              overview={overview}
            />
          </div>
        </div>
      </main>
    </InsightsNavigationProvider>
  );
}
