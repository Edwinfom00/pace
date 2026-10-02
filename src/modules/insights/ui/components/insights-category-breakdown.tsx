import Link from "next/link";

import { formatDashboardLabel, type DashboardLabels } from "@/i18n/dashboard-messages";
import { transactionListHref } from "@/modules/transactions/domain/transaction-list-url";

import type { InsightsOverview } from "../../overview/insights-overview.types";
import { categoryBarWidth, formatInsightsMoney, formatInsightsShare } from "../insights-format";

export function InsightsCategoryBreakdown({
  labels,
  overview,
  workspaceSlug,
}: {
  readonly labels: DashboardLabels;
  readonly overview: InsightsOverview;
  readonly workspaceSlug: string;
}) {
  const { categories, currency, locale } = overview;
  const money = (minor: string) => formatInsightsMoney(minor, currency, locale);

  return (
    <section
      aria-labelledby="insights-categories-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]" id="insights-categories-title">
          {labels["insights.categories.title"]}
        </h2>
        {categories.items.length ? (
          <p className="shrink-0 text-[13px] font-medium text-[#44516a] tabular-nums">{money(categories.totalMinor)}</p>
        ) : null}
      </div>
      {categories.items.length ? (
        <ul className="mt-4 space-y-3.5">
          {categories.items.map((category) => {
            const href = category.isUncategorized
              ? null
              : transactionListHref(`/w/${workspaceSlug}/transactions`, {
                  kind: "ALL",
                  search: "",
                  sort: "NEWEST",
                  page: 1,
                  categoryId: category.id,
                  from: overview.current.firstDate,
                  to: overview.current.lastDate,
                });
            const name = <span className="truncate">{category.name}</span>;
            return (
              <li className="min-w-0" key={category.id}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  {href ? (
                    <Link
                      className="flex min-w-0 font-medium text-[#1c2740] underline-offset-2 outline-none hover:underline focus-visible:rounded-[4px] focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                      href={href}
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="flex min-w-0 font-medium text-[#1c2740]">{name}</span>
                  )}
                  <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                    <span className="text-[12px] text-[#71809a]">{formatInsightsShare(category.shareBps, locale)}</span>
                    <span className="font-medium text-[#1c2740]">{money(category.spendingMinor)}</span>
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eef2f7]"
                >
                  <div className="h-full rounded-full bg-[#1769e8]" style={{ width: categoryBarWidth(category.shareBps) }} />
                </div>
                <p className="mt-1 text-[11px] leading-4 text-[#8a96ab] tabular-nums">
                  {formatDashboardLabel(labels, "insights.categories.previous", { amount: money(category.previousSpendingMinor) })}
                </p>
              </li>
            );
          })}
          {categories.other ? (
            <li className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate font-medium text-[#44516a]">
                  {formatDashboardLabel(labels, "insights.categories.other", { count: categories.other.categoryCount })}
                </span>
                <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                  <span className="text-[12px] text-[#71809a]">{formatInsightsShare(categories.other.shareBps, locale)}</span>
                  <span className="font-medium text-[#1c2740]">{money(categories.other.spendingMinor)}</span>
                </span>
              </div>
              <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eef2f7]">
                <div className="h-full rounded-full bg-[#9db3d6]" style={{ width: categoryBarWidth(categories.other.shareBps) }} />
              </div>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="grid h-[180px] place-items-center px-4 text-center text-[14px] text-[#667085]">
          {labels["insights.categories.empty"]}
        </p>
      )}
    </section>
  );
}
