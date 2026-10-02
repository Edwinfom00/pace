import Link from "next/link";
import { FiChevronRight } from "react-icons/fi";

import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import type { InsightsTrends } from "../../trends/insights-trends.types";
import {
  formatInsightsComparison,
  formatInsightsMoney,
  formatInsightsMonth,
  formatInsightsShare,
} from "../insights-format";
import { insightsCategoryHref } from "../insights-links";
import { sparkBarHeight, trendsQueryState } from "../trends-format";

const changeClasses = {
  positive: "text-[#0b8c5a]",
  negative: "text-[#c9483c]",
  neutral: "text-[#667085]",
} as const;

export function TrendsCategoryEvolution({
  labels,
  trends,
  workspaceSlug,
}: {
  readonly labels: DashboardLabels;
  readonly trends: InsightsTrends;
  readonly workspaceSlug: string;
}) {
  const { categories, currency, locale } = trends;
  const money = (minor: string) => formatInsightsMoney(minor, currency, locale);
  const state = trendsQueryState(trends);

  return (
    <section
      aria-labelledby="trends-categories-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-0.5">
        <h2
          className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]"
          id="trends-categories-title">
          {labels["insights.trends.categories.title"]}
        </h2>
        <p className="text-[12px] leading-5 text-[#71809a]">
          {labels["insights.trends.categories.description"]}
        </p>
      </div>
      {categories.items.length ? (
        <>
          <ul className="mt-2 divide-y divide-[#edf0f4]">
            {categories.items.map((category) => {
              const change = formatInsightsComparison(category.change, labels);
              const content = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] leading-5 font-medium text-[#1c2740]">
                      {category.name}
                    </p>
                    <p className="truncate text-[12px] leading-5 text-[#71809a] tabular-nums">
                      {formatDashboardLabel(
                        labels,
                        "insights.trends.categories.share",
                        {
                          share: formatInsightsShare(category.shareBps, locale),
                        },
                      )}
                    </p>
                  </div>
                  <div
                    aria-hidden="true"
                    className="flex h-8 w-20 shrink-0 items-end gap-0.5 sm:w-28">
                    {category.points.map((point, index) => (
                      <span
                        className={cn(
                          "min-w-0 flex-1 rounded-t-xs",
                          index === category.points.length - 1
                            ? "bg-[#1769e8]"
                            : "bg-[#bcd2f7]",
                        )}
                        key={point.month}
                        style={{ height: sparkBarHeight(point.peakShareBps) }}
                      />
                    ))}
                  </div>
                  <div className="w-24 shrink-0 text-right sm:w-28">
                    <p className="text-[13px] leading-5 font-semibold text-[#1c2740] tabular-nums">
                      {money(category.totalMinor)}
                    </p>
                    <p
                      className={cn(
                        "text-[12px] leading-5 font-medium tabular-nums",
                        category.change.percentage === null &&
                          category.change.direction !== "neutral"
                          ? "text-[#98a2b3]"
                          : changeClasses[category.change.sentiment],
                      )}>
                      {change.arrow ? (
                        <span aria-hidden="true">{change.arrow} </span>
                      ) : null}
                      {change.text}
                    </p>
                  </div>
                </>
              );
              return (
                <li key={category.id}>
                  {category.isUncategorized ? (
                    <div className="flex min-h-14 items-center gap-3 py-2.5 pr-6">
                      {content}
                    </div>
                  ) : (
                    <Link
                      className="group -mx-2 flex min-h-14 items-center gap-3 rounded-[8px] px-2 py-2.5 outline-none transition-colors hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                      href={insightsCategoryHref(
                        workspaceSlug,
                        category.id,
                        state,
                      )}>
                      {content}
                      <FiChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-[#b3bccb] group-hover:text-[#71809a]"
                      />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          {categories.otherCount ? (
            <p className="mt-2 text-[12px] leading-5 text-[#8a96ab]">
              {formatDashboardLabel(
                labels,
                "insights.trends.categories.other",
                {
                  count: categories.otherCount,
                },
              )}
            </p>
          ) : null}
          <table className="sr-only">
            <caption>{labels["insights.trends.categories.title"]}</caption>
            <thead>
              <tr>
                <th scope="col" />
                {trends.months.map((month) => (
                  <th key={month.month} scope="col">
                    {formatInsightsMonth(month.month, locale, "long")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.items.map((category) => (
                <tr key={category.id}>
                  <th scope="row">{category.name}</th>
                  {category.points.map((point) => (
                    <td key={point.month}>{money(point.spendingMinor)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="py-10 text-center text-[14px] text-[#667085]">
          {labels["insights.trends.categories.empty"]}
        </p>
      )}
    </section>
  );
}
