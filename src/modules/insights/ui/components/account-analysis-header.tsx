import Link from "next/link";
import { FiArrowLeft, FiArrowUpRight, FiChevronRight } from "react-icons/fi";

import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { AccountAnalysis } from "../../account/account-analysis.types";
import { accountQueryState, accountTypeLabel } from "../account-analysis-format";
import { insightsOverviewHref } from "../insights-links";

export function AccountAnalysisHeader({
  analysis,
  labels,
  workspaceSlug,
}: {
  readonly analysis: AccountAnalysis;
  readonly labels: DashboardLabels;
  readonly workspaceSlug: string;
}) {
  const { account } = analysis;
  const linkClass =
    "rounded-sm outline-none transition-colors hover:text-[#1c2740] focus-visible:ring-2 focus-visible:ring-[#91b5fa]";

  return (
    <header className="space-y-2">
      <nav aria-label={labels["insights.account.breadcrumb"]}>
        <ol className="flex min-w-0 items-center gap-1.5 text-[13px] text-[#667085]">
          <li className="shrink-0">
            <Link
              className={`inline-flex items-center gap-1.5 ${linkClass}`}
              href={insightsOverviewHref(workspaceSlug, accountQueryState(analysis))}>
              <FiArrowLeft aria-hidden="true" className="size-3.5" />
              {labels["insights.category.back"]}
            </Link>
          </li>
          <li aria-current="page" className="flex min-w-0 items-center gap-1.5">
            <FiChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-[#b3bccb]" />
            <span className="truncate text-[#1c2740]">{account.name}</span>
          </li>
        </ol>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="truncate text-[24px] leading-8 font-semibold tracking-tight text-[#101a35] sm:text-[28px] sm:leading-9">
            {account.name}
          </h1>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] leading-5 text-[#667085]">
            <span>{accountTypeLabel(account.type, labels)}</span>
            <span aria-hidden="true">·</span>
            <span>{account.currency}</span>
            {account.status === "ARCHIVED" ? (
              <span className="ml-1 rounded-full border border-[#e5e9f0] bg-[#f6f8fb] px-2 py-px text-[11px] font-medium text-[#5d6b84]">
                {labels["insights.account.archived"]}
              </span>
            ) : null}
          </p>
        </div>
        <Link
          className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[#e5eaf1] bg-white px-3 text-[12px] font-medium text-[#43516a] outline-none transition-colors hover:border-[#b8d0ff] hover:bg-[#f8faff] focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
          href={`/w/${workspaceSlug}/accounts/${encodeURIComponent(account.id)}`}>
          {labels["insights.account.openAccount"]}
          <FiArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </header>
  );
}
