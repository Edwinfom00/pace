import Link from "next/link";
import { FiArrowDownRight, FiArrowUpRight } from "react-icons/fi";

import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import type {
  InsightsTrends,
  TrendsChange,
} from "../../trends/insights-trends.types";
import { formatInsightsMoney } from "../insights-format";
import { insightsCategoryHref } from "../insights-links";
import { trendsQueryState } from "../trends-format";

export function TrendsChanges({
  labels,
  trends,
  workspaceSlug,
}: {
  readonly labels: DashboardLabels;
  readonly trends: InsightsTrends;
  readonly workspaceSlug: string;
}) {
  const groups = [
    {
      key: "increases",
      title: labels["insights.trends.changes.increases"],
      empty: labels["insights.trends.changes.emptyIncreases"],
      items: trends.increases,
      up: true,
    },
    {
      key: "decreases",
      title: labels["insights.trends.changes.decreases"],
      empty: labels["insights.trends.changes.emptyDecreases"],
      items: trends.decreases,
      up: false,
    },
  ] as const;

  return (
    <section
      aria-labelledby="trends-changes-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <h2
        className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]"
        id="trends-changes-title">
        {labels["insights.trends.changes.title"]}
      </h2>
      <div className="mt-3 space-y-4">
        {groups.map((group) => (
          <div key={group.key}>
            <h3 className="text-[12px] leading-5 font-medium text-[#71809a]">
              {group.title}
            </h3>
            {group.items.length ? (
              <ul className="mt-1 divide-y divide-[#edf0f4]">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <ChangeRow
                      item={item}
                      labels={labels}
                      trends={trends}
                      up={group.up}
                      workspaceSlug={workspaceSlug}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-[13px] leading-5 text-[#8a96ab]">
                {group.empty}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ChangeRow({
  item,
  labels,
  trends,
  up,
  workspaceSlug,
}: {
  readonly item: TrendsChange;
  readonly labels: DashboardLabels;
  readonly trends: InsightsTrends;
  readonly up: boolean;
  readonly workspaceSlug: string;
}) {
  const money = (minor: string) =>
    formatInsightsMoney(minor, trends.currency, trends.locale);
  const Icon = up ? FiArrowUpRight : FiArrowDownRight;
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-[8px]",
          up ? "bg-[#fff2f0] text-[#c9483c]" : "bg-[#ecf8f2] text-[#0b8c5a]",
        )}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] leading-5 font-medium text-[#1c2740]">
          {item.name}
        </p>
        <p className="truncate text-[12px] leading-5 text-[#71809a] tabular-nums">
          {formatDashboardLabel(labels, "insights.trends.changes.previous", {
            amount: money(item.previousMinor),
          })}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] leading-5 font-semibold text-[#1c2740] tabular-nums">
          {money(item.currentMinor)}
        </p>
        <p
          className={cn(
            "text-[12px] leading-5 font-medium tabular-nums",
            up ? "text-[#c9483c]" : "text-[#0b8c5a]",
          )}>
          {item.percentage === null
            ? labels["insights.trends.changes.new"]
            : `${up ? "+" : "−"}${item.percentage}%`}
        </p>
      </div>
    </>
  );
  if (item.isUncategorized)
    return (
      <div className="flex min-h-13 items-center gap-3 py-2">{content}</div>
    );
  return (
    <Link
      className="-mx-2 flex min-h-13 items-center gap-3 rounded-[8px] px-2 py-2 outline-none transition-colors hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
      href={insightsCategoryHref(
        workspaceSlug,
        item.id,
        trendsQueryState(trends),
      )}>
      {content}
    </Link>
  );
}
