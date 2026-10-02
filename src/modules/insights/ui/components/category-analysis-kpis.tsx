import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import type { CategoryAnalysis } from "../../category/category-analysis.types";
import type { InsightsMetric } from "../../overview/insights-overview.types";
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

export function CategoryAnalysisKpis({
  analysis,
  labels,
}: {
  readonly analysis: CategoryAnalysis;
  readonly labels: DashboardLabels;
}) {
  const comparison = formatComparisonPeriod(
    analysis.previous,
    labels,
    analysis.locale,
  );
  const money = (minor: string) =>
    formatInsightsMoney(minor, analysis.currency, analysis.locale);
  const count = analysis.kpis.transactionCount;
  const countFormatter = new Intl.NumberFormat(analysis.locale);

  return (
    <section
      aria-label={labels["insights.category.kpi.label"]}
      className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <MetricCard
        className="col-span-2 lg:col-span-1"
        comparison={comparison}
        label={labels["insights.category.kpi.spent"]}
        labels={labels}
        metric={analysis.kpis.spent}
        money={money}
      />
      <article className="flex min-h-28 min-w-0 flex-col justify-between gap-2 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
        <p className="text-[13px] leading-5 font-medium text-[#667085]">
          {labels["insights.category.kpi.count"]}
        </p>
        <p className="text-[19px] leading-7 font-semibold tracking-tight text-[#101a35] tabular-nums sm:text-[22px]">
          {countFormatter.format(count.current)}
        </p>
        <p className="min-w-0 text-[12px] leading-4.5 font-medium text-[#667085]">
          {formatDashboardLabel(labels, "insights.category.kpi.previousCount", {
            count: countFormatter.format(count.previous),
          })}
        </p>
      </article>
      <MetricCard
        comparison={comparison}
        label={labels["insights.category.kpi.average"]}
        labels={labels}
        metric={analysis.kpis.averageTransaction}
        money={money}
      />
    </section>
  );
}

function MetricCard({
  className,
  comparison,
  label,
  labels,
  metric,
  money,
}: {
  readonly className?: string;
  readonly comparison: string;
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
        {money(metric.minor)}
      </p>
      <p
        className={cn(
          "min-w-0 text-[12px] leading-4.5 font-medium",
          metric.percentage === null && metric.direction !== "neutral"
            ? "text-[#98a2b3]"
            : sentimentClasses[metric.sentiment],
        )}
        title={`${money(metric.previousMinor)} · ${comparison}`}>
        {change.arrow ? <span aria-hidden="true">{change.arrow} </span> : null}
        {change.text}
        <span className="sr-only">
          {" "}
          · {money(metric.previousMinor)} · {comparison}
        </span>
      </p>
    </article>
  );
}
