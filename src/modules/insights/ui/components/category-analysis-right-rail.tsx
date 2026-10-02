import Link from "next/link";
import type { ReactNode } from "react";
import { FiInfo } from "react-icons/fi";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { CategoryAnalysis } from "../../category/category-analysis.types";
import { categoryAnalysisNotes, categoryQueryState } from "../category-analysis-format";
import { formatInsightsMoney, formatInsightsShare, formatInsightsWindow } from "../insights-format";
import { insightsCategoryHref } from "../insights-links";
import { InsightsAskPace } from "./insights-ask-pace";

export function CategoryAnalysisRightRail({
  analysis,
  labels,
  language,
  timeZone,
  workspaceId,
  workspaceSlug,
}: {
  readonly analysis: CategoryAnalysis;
  readonly labels: DashboardLabels;
  readonly language: "en" | "fr" | "de";
  readonly timeZone: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const { category } = analysis;
  const rows: Array<{ key: string; label: string; value: ReactNode }> = [
    {
      key: "spent",
      label: labels["insights.category.kpi.spent"],
      value: formatInsightsMoney(analysis.kpis.spent.minor, analysis.currency, analysis.locale),
    },
    {
      key: "share",
      label: labels["insights.category.rail.share"],
      value: formatInsightsShare(analysis.shareOfSpendingBps, analysis.locale),
    },
    ...(category.parent
      ? [{
          key: "parent",
          label: labels["insights.category.rail.parent"],
          value: (
            <Link
              className="rounded-sm text-[#2166dc] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
              href={insightsCategoryHref(workspaceSlug, category.parent.id, categoryQueryState(analysis))}>
              {category.parent.name}
            </Link>
          ),
        }]
      : category.childCount
        ? [{
            key: "children",
            label: labels["insights.category.rail.subcategories"],
            value: new Intl.NumberFormat(analysis.locale).format(category.childCount),
          }]
        : []),
    {
      key: "period",
      label: labels["insights.category.rail.period"],
      value: formatInsightsWindow(analysis.current, analysis.locale),
    },
    {
      key: "comparison",
      label: labels["insights.category.rail.comparison"],
      value: formatInsightsWindow(analysis.previous, analysis.locale),
    },
    { key: "currency", label: labels["insights.category.rail.currency"], value: analysis.currency },
  ];

  return (
    <aside
      aria-label={labels["insights.category.rail.label"]}
      className="overflow-hidden rounded-[14px] border border-[#e5e9f0] bg-white">
      <section aria-labelledby="category-rail-title" className="px-5 py-5 sm:px-6">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#101a35]" id="category-rail-title">
          {labels["insights.category.rail.title"]}
        </h2>
        <dl className="mt-3 divide-y divide-[#edf0f4] text-[13px]">
          {rows.map((row) => (
            <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0" key={row.key}>
              <dt className="text-[#71809a]">{row.label}</dt>
              <dd className="min-w-0 text-right font-medium text-[#1c2740] tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="category-ask-title" className="border-t border-[#edf0f4] px-5 py-5 sm:px-6">
        <div className="flex items-center gap-2">
          <PaceLogo alt="" height={20} variant="icon" width={20} />
          <h2 className="text-[14px] font-semibold text-[#101a35]" id="category-ask-title">
            {labels["insights.category.rail.askTitle"]}
          </h2>
        </div>
        <p className="mt-1 mb-3 text-[12px] leading-5 text-[#71809a]">{labels["insights.category.rail.askDescription"]}</p>
        <InsightsAskPace language={language} locale={analysis.locale} timeZone={timeZone} workspaceId={workspaceId} />
      </section>
      <section aria-labelledby="category-notes-title" className="border-t border-[#edf0f4] bg-[#fbfcfe] px-5 py-5 sm:px-6">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-[#263149]" id="category-notes-title">
          <FiInfo aria-hidden="true" className="size-4 text-[#71809a]" />
          {labels["insights.rail.notes.title"]}
        </h2>
        <ul className="mt-3 space-y-2 text-[12px] leading-5 text-[#5d6b84]">
          {categoryAnalysisNotes(analysis, labels).map((note) => (
            <li className="flex gap-2" key={note}>
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-[#9aa6ba]" />
              {note}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
