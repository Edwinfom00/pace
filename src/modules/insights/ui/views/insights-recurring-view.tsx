import Link from "next/link";
import { FiRepeat } from "react-icons/fi";

import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { InsightsRecurring } from "../../recurring/insights-recurring.types";
import {
  DEFAULT_TRENDS_RANGE,
  TRENDS_RANGES,
} from "../../trends/insights-trends.types";
import {
  InsightsLoadingSurface,
  InsightsNavigationProvider,
} from "../components/insights-navigation";
import { InsightsSectionTabs } from "../components/insights-section-tabs";
import {
  InsightsFilters,
  InsightsPeriodControls,
} from "../components/insights-toolbar";
import { RecurringPriceChanges } from "../components/recurring-price-changes";
import { RecurringShareChart } from "../components/recurring-share-chart";
import { RecurringSignals } from "../components/recurring-signals";
import { RecurringSummary } from "../components/recurring-summary";
import { RecurringTopItems } from "../components/recurring-top-items";
import { RecurringUpcoming } from "../components/recurring-upcoming";
import {
  formatComparisonPeriod,
  formatInsightsWindow,
} from "../insights-format";

export function InsightsRecurringView({
  currentPeriodKey,
  labels,
  recurring,
  workspaceSlug,
}: {
  readonly currentPeriodKey: string;
  readonly labels: DashboardLabels;
  readonly recurring: InsightsRecurring;
  readonly workspaceSlug: string;
}) {
  return (
    <InsightsNavigationProvider>
      <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
        <h1 className="sr-only">{labels["insights.recurring.title"]}</h1>
        <div className="mx-auto w-full max-w-355 space-y-4 sm:space-y-5">
          <InsightsSectionTabs
            active="recurring"
            labels={labels}
            workspaceSlug={workspaceSlug}
          />
          <div className="space-y-1">
            <InsightsPeriodControls
              currentPeriodKey={currentPeriodKey}
              labels={labels}
              locale={recurring.locale}
              periodKey={recurring.periodKey}
            />
            <p className="text-[13px] leading-5 text-[#667085]">
              {formatInsightsWindow(recurring.current, recurring.locale)}
              <span aria-hidden="true"> · </span>
              <span className="text-[#8a96ab]">
                {formatComparisonPeriod(
                  recurring.previous,
                  labels,
                  recurring.locale,
                )}
              </span>
            </p>
          </div>
          <InsightsFilters
            currencies={recurring.currencies}
            currency={recurring.currency}
            defaultRange={DEFAULT_TRENDS_RANGE}
            labels={labels}
            range={recurring.range}
            ranges={TRENDS_RANGES}
            workspaceCurrency={recurring.workspaceCurrency}
          />
          <InsightsLoadingSurface
            detail={labels["insights.recurring.loadingDetail"]}
            label={labels["insights.recurring.loading"]}
            labels={labels}>
            {recurring.hasRecurring ? (
              <div className="space-y-4 sm:space-y-5">
                <RecurringSummary labels={labels} recurring={recurring} />
                <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
                  <RecurringShareChart labels={labels} recurring={recurring} />
                  <RecurringUpcoming
                    labels={labels}
                    recurring={recurring}
                    workspaceSlug={workspaceSlug}
                  />
                </div>
                <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
                  <RecurringTopItems
                    labels={labels}
                    recurring={recurring}
                    workspaceSlug={workspaceSlug}
                  />
                  <div className="space-y-4 sm:space-y-5">
                    <RecurringPriceChanges
                      labels={labels}
                      recurring={recurring}
                      workspaceSlug={workspaceSlug}
                    />
                    <RecurringSignals
                      labels={labels}
                      recurring={recurring}
                      workspaceSlug={workspaceSlug}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <RecurringEmptyState
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

function RecurringEmptyState({
  labels,
  workspaceSlug,
}: {
  readonly labels: DashboardLabels;
  readonly workspaceSlug: string;
}) {
  return (
    <section className="flex min-h-80 flex-col items-center justify-center rounded-[10px] border border-[#e8ecf2] bg-white px-6 py-10 text-center">
      <span
        aria-hidden="true"
        className="grid size-11 place-items-center rounded-[12px] bg-[#eef4ff] text-[#2f6fed]">
        <FiRepeat className="size-5" />
      </span>
      <h2 className="mt-4 text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]">
        {labels["insights.recurring.empty.title"]}
      </h2>
      <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-[#667085]">
        {labels["insights.recurring.empty.description"]}
      </p>
      <Link
        className="mt-5 inline-flex h-9 items-center rounded-[8px] border border-[#e5eaf1] bg-white px-3.5 text-[13px] font-medium text-[#25314a] outline-none transition-colors hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
        href={`/w/${workspaceSlug}/recurring`}>
        {labels["insights.recurring.empty.action"]}
      </Link>
    </section>
  );
}
