import type { DashboardLabels } from "@/i18n/dashboard-messages";

import { formatOverviewMoney } from "../../domain/overview-formatters";
import type { OverviewFinancialSummary } from "../../domain/overview.types";
import { PaceKpiCard } from "./pace-kpi-card";

export function OverviewKpis({ summary, labels }: { summary: OverviewFinancialSummary; labels: DashboardLabels }) {
  const primaryLabel = summary.filter === "INCOME"
    ? labels["overview.kpi.income"]
    : summary.filter === "TRANSFER"
      ? labels["overview.kpi.transfers"]
      : labels["overview.kpi.spent"];
  const formatValue = (minor: string | null) =>
    minor === null ? null : formatOverviewMoney(minor, summary.currency, summary.locale);
  const trendDirectionLabels = {
    up: labels["overview.kpi.trend.up"],
    down: labels["overview.kpi.trend.down"],
    neutral: labels["overview.kpi.trend.neutral"],
  };

  return (
    <section aria-label={labels["overview.kpi.label"]} className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2 lg:grid-cols-3">
      <PaceKpiCard
        label={primaryLabel}
        metric={summary.primary}
        notApplicableLabel={labels["overview.kpi.notApplicable"]}
        noComparisonLabel={labels["overview.kpi.noComparison"]}
        trendDirectionLabels={trendDirectionLabels}
        value={formatValue(summary.primary.minor)}
        versusLabel={labels["overview.kpi.vs"]}
      />
      <PaceKpiCard
        label={labels["overview.kpi.yourPace"]}
        metric={summary.pace}
        notApplicableLabel={labels["overview.kpi.notApplicable"]}
        noComparisonLabel={labels["overview.kpi.noComparison"]}
        perDayLabel={summary.pace.availability === "value" ? labels["overview.kpi.perDay"] : undefined}
        trendDirectionLabels={trendDirectionLabels}
        value={formatValue(summary.pace.minor)}
        versusLabel={labels["overview.kpi.vs"]}
      />
      <PaceKpiCard
        label={labels["overview.kpi.expectedMonth"]}
        metric={summary.expectedMonth}
        notApplicableLabel={labels["overview.kpi.notApplicable"]}
        noComparisonLabel={labels["overview.kpi.noComparison"]}
        trendDirectionLabels={trendDirectionLabels}
        value={formatValue(summary.expectedMonth.minor)}
        versusLabel={labels["overview.kpi.vs"]}
      />
    </section>
  );
}
