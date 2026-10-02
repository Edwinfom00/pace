import Link from "next/link";
import { FiArrowRight, FiInfo } from "react-icons/fi";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { DailyBriefItem } from "@/modules/overview/ui/components/daily-brief-item";

import type {
  InsightsDeterministicInsights,
  InsightsOverview,
} from "../../overview/insights-overview.types";
import { formatInsightsMonth } from "../insights-format";

export function insightsNotes(
  overview: Pick<InsightsOverview, "currencies" | "currency" | "exclusions">,
  labels: DashboardLabels,
): string[] {
  const { exclusions } = overview;
  return [
    formatDashboardLabel(labels, "insights.rail.notes.transfers", {
      count: exclusions.transferCount,
    }),
    labels["insights.rail.notes.refunds"],
    ...(exclusions.pendingCount
      ? [
          formatDashboardLabel(labels, "insights.rail.notes.pending", {
            count: exclusions.pendingCount,
          }),
        ]
      : []),
    labels["insights.rail.notes.recurring"],
    ...(overview.currencies.length > 1 || exclusions.otherCurrencyCount
      ? [
          formatDashboardLabel(labels, "insights.rail.notes.currency", {
            currency: overview.currency,
            count: exclusions.otherCurrencyCount,
          }),
        ]
      : []),
  ];
}

export function InsightsRightRail({
  insights,
  labels,
  overview,
}: {
  readonly insights: InsightsDeterministicInsights;
  readonly labels: DashboardLabels;
  readonly overview: InsightsOverview;
}) {
  return (
    <aside
      aria-label={labels["insights.rail.label"]}
      className="overflow-hidden rounded-[14px] border border-[#e5e9f0] bg-white">
      <section
        aria-labelledby="insights-rail-title"
        className="px-5 py-5 sm:px-6">
        <div className="flex items-center gap-2">
          <PaceLogo alt="" height={22} variant="icon" width={22} />
          <h2
            className="text-[16px] font-semibold tracking-[-0.02em] text-[#101a35]"
            id="insights-rail-title">
            {labels["insights.rail.insights.title"]}
          </h2>
        </div>
        <p className="mt-1 text-[12px] leading-5 text-[#71809a]">
          {formatDashboardLabel(labels, "insights.rail.insights.subtitle", {
            month: formatInsightsMonth(insights.month, overview.locale, "long"),
          })}
        </p>
        {insights.unavailable ? (
          <p
            className="pt-4 text-[13px] leading-5 text-[#71809a]"
            role="status">
            {labels["insights.rail.insights.error"]}
          </p>
        ) : insights.items.length ? (
          <ul className="mt-4 divide-y divide-[#edf0f4]">
            {insights.items.map((item) => (
              <li
                className="py-3 first:pt-0 last:pb-0 [&>article]:py-0"
                key={item.id}>
                <DailyBriefItem
                  item={{
                    ...item,
                    title: item.subject
                      ? `${item.title} · ${item.subject}`
                      : item.title,
                  }}
                />
                {item.href ? (
                  <Link
                    className="mt-1 ml-12 inline-flex items-center gap-1 rounded-lg text-[12px] font-medium text-[#2166dc] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                    href={item.href}>
                    {labels["insights.rail.insights.view"]}
                    <FiArrowRight aria-hidden="true" className="size-3" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pt-4 text-[13px] leading-5 text-[#71809a]">
            {labels["insights.rail.insights.empty"]}
          </p>
        )}
      </section>
      <section
        aria-labelledby="insights-notes-title"
        className="border-t border-[#edf0f4] bg-[#fbfcfe] px-5 py-5 sm:px-6">
        <h2
          className="flex items-center gap-2 text-[13px] font-semibold text-[#263149]"
          id="insights-notes-title">
          <FiInfo aria-hidden="true" className="size-4 text-[#71809a]" />
          {labels["insights.rail.notes.title"]}
        </h2>
        <ul className="mt-3 space-y-2 text-[12px] leading-5 text-[#5d6b84]">
          {insightsNotes(overview, labels).map((note) => (
            <li className="flex gap-2" key={note}>
              <span
                aria-hidden="true"
                className="mt-2 size-1 shrink-0 rounded-full bg-[#9aa6ba]"
              />
              {note}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
