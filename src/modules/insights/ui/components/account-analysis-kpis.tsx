import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import type { AccountAnalysis } from "../../account/account-analysis.types";
import type { InsightsMetric } from "../../overview/insights-overview.types";
import { formatSignedMoney } from "../account-analysis-format";
import {
  formatComparisonPeriod,
  formatInsightsComparison,
  formatInsightsMoney,
} from "../insights-format";

const sentimentClasses = {
  positive: "text-[#0b8c5a]",
  negative: "text-[#c9483c]",
  neutral: "text-[#667085]",
} as const;

export function AccountAnalysisKpis({
  analysis,
  labels,
}: {
  readonly analysis: AccountAnalysis;
  readonly labels: DashboardLabels;
}) {
  const comparison = formatComparisonPeriod(
    analysis.previous,
    labels,
    analysis.locale,
  );
  const money = (minor: string) =>
    formatInsightsMoney(minor, analysis.currency, analysis.locale);
  const { balances } = analysis;

  return (
    <section
      aria-label={labels["insights.account.kpi.label"]}
      className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <article className="col-span-2 flex min-h-28 min-w-0 flex-col justify-between gap-2 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5 lg:col-span-1">
        <p className="text-[13px] leading-5 font-medium text-[#667085]">
          {labels["insights.account.kpi.currentBalance"]}
        </p>
        <p className="min-w-0 wrap-break-word text-[19px] leading-7 font-semibold tracking-tight text-[#101a35] tabular-nums sm:text-[22px]">
          {money(balances.currentMinor)}
        </p>
        <p className="min-w-0 text-[12px] leading-4.5 font-medium text-[#667085] tabular-nums">
          {balances.availableMinor === null
            ? labels["insights.account.kpi.availableUnsupported"]
            : formatDashboardLabel(labels, "insights.account.kpi.available", {
                amount: money(balances.availableMinor),
              })}
        </p>
      </article>
      <MetricCard
        comparison={comparison}
        label={labels["insights.account.kpi.inflows"]}
        labels={labels}
        metric={analysis.kpis.inflows}
        money={money}
      />
      <MetricCard
        comparison={comparison}
        label={labels["insights.account.kpi.outflows"]}
        labels={labels}
        metric={analysis.kpis.outflows}
        money={money}
      />
      <MetricCard
        className="col-span-2 lg:col-span-1"
        comparison={comparison}
        display={(minor) =>
          formatSignedMoney(minor, analysis.currency, analysis.locale)
        }
        label={labels["insights.account.kpi.net"]}
        labels={labels}
        metric={analysis.kpis.net}
        money={money}
      />
    </section>
  );
}

function MetricCard({
  className,
  comparison,
  display,
  label,
  labels,
  metric,
  money,
}: {
  readonly className?: string;
  readonly comparison: string;
  readonly display?: (minor: string) => string;
  readonly label: string;
  readonly labels: DashboardLabels;
  readonly metric: InsightsMetric;
  readonly money: (minor: string) => string;
}) {
  const change = formatInsightsComparison(metric, labels);
  return (
    <article
      className={cn(
        "flex min-h-28 min-w-0 flex-col justify-between gap-2 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5",
        className,
      )}>
      <p className="text-[13px] leading-5 font-medium text-[#667085]">
        {label}
      </p>
      <p className="min-w-0 wrap-break-word text-[19px] leading-7 font-semibold tracking-tight text-[#101a35] tabular-nums sm:text-[22px]">
        {(display ?? money)(metric.minor)}
      </p>
      <p
        className={cn(
          "min-w-0 text-[12px] leading-4.5 font-medium",
          metric.percentage === null && metric.direction !== "neutral"
            ? "text-[#98a2b3]"
            : sentimentClasses[metric.sentiment],
        )}
        title={`${(display ?? money)(metric.previousMinor)} · ${comparison}`}>
        {change.arrow ? <span aria-hidden="true">{change.arrow} </span> : null}
        {change.text}
        <span className="sr-only">
          {" "}
          · {(display ?? money)(metric.previousMinor)} · {comparison}
        </span>
      </p>
    </article>
  );
}
