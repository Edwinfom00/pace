"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import { insightsSectionHref, type InsightsSection } from "../insights-links";

const SECTIONS: readonly InsightsSection[] = ["overview", "trends"];

export function InsightsSectionTabs({
  active,
  labels,
  workspaceSlug,
}: {
  readonly active: InsightsSection;
  readonly labels: DashboardLabels;
  readonly workspaceSlug: string;
}) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  return (
    <nav aria-label={labels["insights.sections.label"]}>
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 scrollbar-none">
        {SECTIONS.map((section) => {
          const selected = section === active;
          return (
            <li className="shrink-0" key={section}>
              <Link
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-2",
                  selected
                    ? "border-[#101a35] bg-[#101a35] text-white"
                    : "border-[#e5eaf1] bg-white text-[#44516a] hover:border-[#d4ddea] hover:bg-[#f8fafc]",
                )}
                href={insightsSectionHref(workspaceSlug, section, search)}
                prefetch={false}>
                {labels[`insights.sections.${section}`]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
