import Link from "next/link";
import type { IconType } from "react-icons";
import { FiArrowRight, FiArrowUpRight, FiCalendar, FiMaximize2, FiTarget } from "react-icons/fi";

import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { CategoryAnalysis, CategoryAnalysisInsight } from "../../category/category-analysis.types";
import { categoryInsightCopy } from "../category-analysis-format";

const insightIcons: Readonly<Record<CategoryAnalysisInsight["kind"], IconType>> = {
  biggestIncrease: FiArrowUpRight,
  merchantConcentration: FiTarget,
  strongestWeek: FiCalendar,
  largestTransaction: FiMaximize2,
};

export function CategoryAnalysisInsights({
  analysis,
  labels,
  workspaceSlug,
}: {
  readonly analysis: CategoryAnalysis;
  readonly labels: DashboardLabels;
  readonly workspaceSlug: string;
}) {
  const items = analysis.insights.map((insight) => categoryInsightCopy(insight, analysis, labels, workspaceSlug));
  return (
    <section
      aria-labelledby="category-insights-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]" id="category-insights-title">
        {labels["insights.category.insights.title"]}
      </h2>
      {items.length ? (
        <ul className="mt-2 divide-y divide-[#edf0f4]">
          {items.map((item) => {
            const Icon = insightIcons[item.kind];
            return (
              <li className="flex gap-3 py-3 last:pb-0" key={item.id}>
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eef4ff] text-[#2f6fed]">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-5 font-medium text-[#1c2740]">{item.title}</p>
                  <p className="text-[12px] leading-5 text-[#5d6b84]">{item.body}</p>
                  {item.href ? (
                    <Link
                      className="mt-0.5 inline-flex items-center gap-1 rounded-sm text-[12px] font-medium text-[#2166dc] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                      href={item.href}>
                      {labels["insights.rail.insights.view"]}
                      <FiArrowRight aria-hidden="true" className="size-3" />
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-[14px] text-[#667085]">{labels["insights.category.insights.empty"]}</p>
      )}
    </section>
  );
}
