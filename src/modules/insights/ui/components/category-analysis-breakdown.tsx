import Link from "next/link";

import { formatDashboardLabel, type DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import type { CategoryAnalysis, CategoryAnalysisRow } from "../../category/category-analysis.types";
import { categoryQueryState } from "../category-analysis-format";
import { categoryBarWidth, formatInsightsMoney, formatInsightsShare } from "../insights-format";
import { insightsCategoryHref } from "../insights-links";

type BreakdownRow = {
  readonly key: string;
  readonly name: string;
  readonly muted?: boolean;
  readonly href?: string | null;
  readonly row: Pick<CategoryAnalysisRow, "currentMinor" | "shareBps"> &
    Partial<Pick<CategoryAnalysisRow, "deltaMinor" | "direction" | "previousMinor">>;
};

export function CategoryMerchantBreakdown({
  analysis,
  labels,
}: {
  readonly analysis: CategoryAnalysis;
  readonly labels: DashboardLabels;
}) {
  const { merchants } = analysis;
  const rows: BreakdownRow[] = merchants.items.map((item) => ({
    key: item.id,
    name: item.name ?? labels["insights.category.merchants.unknown"],
    muted: item.name === null,
    row: item,
  }));
  if (merchants.other) {
    rows.push({
      key: "__other__",
      name: formatDashboardLabel(labels, "insights.category.merchants.other", { count: merchants.other.merchantCount }),
      muted: true,
      row: merchants.other,
    });
  }
  return (
    <BreakdownCard
      analysis={analysis}
      empty={labels["insights.category.merchants.empty"]}
      id="category-merchants-title"
      labels={labels}
      rows={rows}
      title={labels["insights.category.merchants.title"]}
    />
  );
}

export function CategorySubcategoryBreakdown({
  analysis,
  labels,
  workspaceSlug,
}: {
  readonly analysis: CategoryAnalysis;
  readonly labels: DashboardLabels;
  readonly workspaceSlug: string;
}) {
  const state = categoryQueryState(analysis);
  const rows: BreakdownRow[] = (analysis.subcategories ?? []).map((item) => ({
    key: item.id,
    name: item.isDirect
      ? formatDashboardLabel(labels, "insights.category.subcategories.direct", { category: analysis.category.name })
      : item.name ?? "",
    muted: item.isDirect,
    href: item.isDirect ? null : insightsCategoryHref(workspaceSlug, item.id, state),
    row: item,
  }));
  return (
    <BreakdownCard
      analysis={analysis}
      empty={labels["insights.category.subcategories.empty"]}
      id="category-subcategories-title"
      labels={labels}
      rows={rows}
      title={labels["insights.category.subcategories.title"]}
    />
  );
}

function BreakdownCard({
  analysis,
  empty,
  id,
  labels,
  rows,
  title,
}: {
  readonly analysis: CategoryAnalysis;
  readonly empty: string;
  readonly id: string;
  readonly labels: DashboardLabels;
  readonly rows: readonly BreakdownRow[];
  readonly title: string;
}) {
  const money = (minor: string) => formatInsightsMoney(minor, analysis.currency, analysis.locale);
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]" id={id}>
        {title}
      </h2>
      {rows.length ? (
        <ul className="mt-4 space-y-3.5">
          {rows.map(({ href, key, muted, name, row }) => {
            const label = <span className="truncate">{name}</span>;
            return (
              <li className="min-w-0" key={key}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  {href ? (
                    <Link
                      className="flex min-w-0 font-medium text-[#1c2740] underline-offset-2 outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                      href={href}>
                      {label}
                    </Link>
                  ) : (
                    <span className={cn("flex min-w-0 font-medium", muted ? "text-[#44516a]" : "text-[#1c2740]")}>
                      {label}
                    </span>
                  )}
                  <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                    <span className="text-[12px] text-[#71809a]">{formatInsightsShare(row.shareBps, analysis.locale)}</span>
                    <span className="font-medium text-[#1c2740]">{money(row.currentMinor)}</span>
                  </span>
                </div>
                <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eef2f7]">
                  <div
                    className={cn("h-full rounded-full", muted ? "bg-[#9db3d6]" : "bg-[#1769e8]")}
                    style={{ width: categoryBarWidth(row.shareBps) }}
                  />
                </div>
                {row.previousMinor !== undefined && row.deltaMinor !== undefined && row.direction !== undefined ? (
                  <p className="mt-1 text-[11px] leading-4 text-[#8a96ab] tabular-nums">
                    {formatDashboardLabel(labels, "insights.categories.previous", { amount: money(row.previousMinor) })}
                    {row.direction !== "neutral" ? (
                      <span className={row.direction === "up" ? "text-[#b4483c]" : "text-[#0b8c5a]"}>
                        {" · "}
                        {row.direction === "up" ? "+" : ""}
                        {money(row.deltaMinor)}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="grid h-40 place-items-center px-4 text-center text-[14px] text-[#667085]">{empty}</p>
      )}
    </section>
  );
}
