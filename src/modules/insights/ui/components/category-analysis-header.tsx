import Link from "next/link";
import { FiArrowLeft, FiChevronRight } from "react-icons/fi";

import { formatDashboardLabel, type DashboardLabels } from "@/i18n/dashboard-messages";

import type { CategoryAnalysis } from "../../category/category-analysis.types";
import { categoryQueryState } from "../category-analysis-format";
import { insightsCategoryHref, insightsOverviewHref } from "../insights-links";

export function CategoryAnalysisHeader({
  analysis,
  labels,
  workspaceSlug,
}: {
  readonly analysis: CategoryAnalysis;
  readonly labels: DashboardLabels;
  readonly workspaceSlug: string;
}) {
  const { category } = analysis;
  const state = categoryQueryState(analysis);
  const linkClass =
    "rounded-sm outline-none transition-colors hover:text-[#1c2740] focus-visible:ring-2 focus-visible:ring-[#91b5fa]";

  return (
    <header className="space-y-2">
      <nav aria-label={labels["insights.category.breadcrumb"]}>
        <ol className="flex min-w-0 items-center gap-1.5 text-[13px] text-[#667085]">
          <li className="shrink-0">
            <Link className={`inline-flex items-center gap-1.5 ${linkClass}`} href={insightsOverviewHref(workspaceSlug, state)}>
              <FiArrowLeft aria-hidden="true" className="size-3.5" />
              {labels["insights.category.back"]}
            </Link>
          </li>
          {category.parent ? (
            <li className="flex min-w-0 items-center gap-1.5">
              <FiChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-[#b3bccb]" />
              <Link className={`truncate ${linkClass}`} href={insightsCategoryHref(workspaceSlug, category.parent.id, state)}>
                {category.parent.name}
              </Link>
            </li>
          ) : null}
          <li aria-current="page" className="flex min-w-0 items-center gap-1.5">
            <FiChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-[#b3bccb]" />
            <span className="truncate text-[#1c2740]">{category.name}</span>
          </li>
        </ol>
      </nav>
      <div>
        <h1 className="text-[24px] leading-8 font-semibold tracking-tight text-[#101a35] sm:text-[28px] sm:leading-9">
          {category.name}
        </h1>
        {category.parent || category.childCount ? (
          <p className="text-[13px] leading-5 text-[#667085]">
            {category.parent
              ? formatDashboardLabel(labels, "insights.category.subcategoryOf", { parent: category.parent.name })
              : formatDashboardLabel(labels, "insights.category.includesChildren", { count: category.childCount })}
          </p>
        ) : null}
      </div>
    </header>
  );
}
