import { FiBarChart2 } from "react-icons/fi";

import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";

import type { CategoryAnalysis } from "../../category/category-analysis.types";
import {
  CategoryMerchantBreakdown,
  CategorySubcategoryBreakdown,
} from "../components/category-analysis-breakdown";
import { CategoryAnalysisHeader } from "../components/category-analysis-header";
import { CategoryAnalysisInsights } from "../components/category-analysis-insights";
import { CategoryAnalysisKpis } from "../components/category-analysis-kpis";
import { CategoryAnalysisRightRail } from "../components/category-analysis-right-rail";
import { CategoryAnalysisTransactions } from "../components/category-analysis-transactions";
import {
  InsightsLoadingSurface,
  InsightsNavigationProvider,
} from "../components/insights-navigation";
import { InsightsSpendingTrendChart } from "../components/insights-spending-trend-chart";
import {
  InsightsFilters,
  InsightsPeriodControls,
} from "../components/insights-toolbar";
import {
  formatComparisonPeriod,
  formatInsightsWindow,
} from "../insights-format";

export function CategoryAnalysisView({
  analysis,
  currentPeriodKey,
  labels,
  language,
  timeZone,
  workspaceId,
  workspaceSlug,
}: {
  readonly analysis: CategoryAnalysis;
  readonly currentPeriodKey: string;
  readonly labels: DashboardLabels;
  readonly language: "en" | "fr" | "de";
  readonly timeZone: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  return (
    <InsightsNavigationProvider>
      <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
        <div className="mx-auto grid w-full max-w-355 gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(330px,26vw,370px)] xl:items-start">
          <div className="min-w-0 space-y-4 sm:space-y-5">
            <CategoryAnalysisHeader
              analysis={analysis}
              labels={labels}
              workspaceSlug={workspaceSlug}
            />
            <div className="space-y-1">
              <InsightsPeriodControls
                currentPeriodKey={currentPeriodKey}
                labels={labels}
                locale={analysis.locale}
                periodKey={analysis.periodKey}
              />
              <p className="text-[13px] leading-5 text-[#667085]">
                {formatInsightsWindow(analysis.current, analysis.locale)}
                <span aria-hidden="true"> · </span>
                <span className="text-[#8a96ab]">
                  {formatComparisonPeriod(
                    analysis.previous,
                    labels,
                    analysis.locale,
                  )}
                </span>
              </p>
            </div>
            <InsightsFilters
              currencies={analysis.currencies}
              currency={analysis.currency}
              labels={labels}
              range={analysis.range}
              workspaceCurrency={analysis.workspaceCurrency}
            />
            <InsightsLoadingSurface
              detail={labels["insights.category.loadingDetail"]}
              label={labels["insights.category.loading"]}
              labels={labels}>
              {analysis.hasActivity ? (
                <div className="space-y-4 sm:space-y-5">
                  <CategoryAnalysisKpis analysis={analysis} labels={labels} />
                  <InsightsSpendingTrendChart
                    labels={labels}
                    overview={analysis}
                  />
                  <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
                    <CategoryMerchantBreakdown
                      analysis={analysis}
                      labels={labels}
                    />
                    {analysis.subcategories ? (
                      <CategorySubcategoryBreakdown
                        analysis={analysis}
                        labels={labels}
                        workspaceSlug={workspaceSlug}
                      />
                    ) : (
                      <CategoryAnalysisInsights
                        analysis={analysis}
                        labels={labels}
                        workspaceSlug={workspaceSlug}
                      />
                    )}
                  </div>
                  {analysis.subcategories ? (
                    <CategoryAnalysisInsights
                      analysis={analysis}
                      labels={labels}
                      workspaceSlug={workspaceSlug}
                    />
                  ) : null}
                  <CategoryAnalysisTransactions
                    analysis={analysis}
                    labels={labels}
                    workspaceSlug={workspaceSlug}
                  />
                </div>
              ) : (
                <section className="flex min-h-80 flex-col items-center justify-center rounded-[10px] border border-[#e8ecf2] bg-white px-6 py-10 text-center">
                  <span
                    aria-hidden="true"
                    className="grid size-11 place-items-center rounded-[12px] bg-[#eef4ff] text-[#2f6fed]">
                    <FiBarChart2 className="size-5" />
                  </span>
                  <h2 className="mt-4 text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]">
                    {labels["insights.category.empty.title"]}
                  </h2>
                  <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-[#667085]">
                    {formatDashboardLabel(
                      labels,
                      "insights.category.empty.description",
                      { category: analysis.category.name },
                    )}
                  </p>
                </section>
              )}
            </InsightsLoadingSurface>
          </div>
          <div className="min-w-0 xl:sticky xl:top-5">
            <CategoryAnalysisRightRail
              analysis={analysis}
              labels={labels}
              language={language}
              timeZone={timeZone}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
            />
          </div>
        </div>
      </main>
    </InsightsNavigationProvider>
  );
}
