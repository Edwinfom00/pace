import type { DashboardLabels } from "@/i18n/dashboard-messages";

import {
  DEFAULT_TRENDS_RANGE,
  TRENDS_RANGES,
  type InsightsTrends,
} from "../../trends/insights-trends.types";
import { InsightsAccounts } from "../components/insights-accounts";
import { InsightsEmptyState } from "../components/insights-empty-state";
import {
  InsightsLoadingSurface,
  InsightsNavigationProvider,
} from "../components/insights-navigation";
import { InsightsSectionTabs } from "../components/insights-section-tabs";
import {
  InsightsFilters,
  InsightsPeriodControls,
} from "../components/insights-toolbar";
import { TrendsCashFlowChart } from "../components/trends-cash-flow-chart";
import { TrendsCategoryEvolution } from "../components/trends-category-evolution";
import { TrendsChanges } from "../components/trends-changes";
import { TrendsRecurring } from "../components/trends-recurring";
import { TrendsSignals } from "../components/trends-signals";
import { TrendsSummary } from "../components/trends-summary";
import {
  formatComparisonPeriod,
  formatInsightsWindow,
} from "../insights-format";

export function InsightsTrendsView({
  currentPeriodKey,
  labels,
  trends,
  workspaceSlug,
}: {
  readonly currentPeriodKey: string;
  readonly labels: DashboardLabels;
  readonly trends: InsightsTrends;
  readonly workspaceSlug: string;
}) {
  return (
    <InsightsNavigationProvider>
      <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
        <h1 className="sr-only">{labels["insights.trends.title"]}</h1>
        <div className="mx-auto w-full max-w-355 space-y-4 sm:space-y-5">
          <InsightsSectionTabs
            active="trends"
            labels={labels}
            workspaceSlug={workspaceSlug}
          />
          <div className="space-y-1">
            <InsightsPeriodControls
              currentPeriodKey={currentPeriodKey}
              labels={labels}
              locale={trends.locale}
              periodKey={trends.periodKey}
            />
            <p className="text-[13px] leading-5 text-[#667085]">
              {formatInsightsWindow(trends.current, trends.locale)}
              <span aria-hidden="true"> · </span>
              <span className="text-[#8a96ab]">
                {formatComparisonPeriod(trends.previous, labels, trends.locale)}
              </span>
            </p>
          </div>
          <InsightsFilters
            currencies={trends.currencies}
            currency={trends.currency}
            defaultRange={DEFAULT_TRENDS_RANGE}
            labels={labels}
            range={trends.range}
            ranges={TRENDS_RANGES}
            workspaceCurrency={trends.workspaceCurrency}
          />
          <InsightsLoadingSurface
            detail={labels["insights.trends.loadingDetail"]}
            label={labels["insights.trends.loading"]}
            labels={labels}>
            {trends.hasActivity ? (
              <div className="space-y-4 sm:space-y-5">
                <TrendsSummary labels={labels} trends={trends} />
                <TrendsCashFlowChart labels={labels} trends={trends} />
                <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
                  <TrendsCategoryEvolution
                    labels={labels}
                    trends={trends}
                    workspaceSlug={workspaceSlug}
                  />
                  <TrendsChanges
                    labels={labels}
                    trends={trends}
                    workspaceSlug={workspaceSlug}
                  />
                </div>
                <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
                  <TrendsRecurring
                    labels={labels}
                    trends={trends}
                    workspaceSlug={workspaceSlug}
                  />
                  <TrendsSignals
                    labels={labels}
                    trends={trends}
                    workspaceSlug={workspaceSlug}
                  />
                </div>
                <InsightsAccounts
                  accounts={trends.accounts}
                  labels={labels}
                  overview={trends}
                  workspaceSlug={workspaceSlug}
                />
              </div>
            ) : (
              <InsightsEmptyState
                labels={labels}
                workspaceSlug={workspaceSlug}
              />
            )}
          </InsightsLoadingSurface>
        </div>
      </main>
    </InsightsNavigationProvider>
  );
}
