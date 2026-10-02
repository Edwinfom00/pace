import Link from "next/link";
import { FiArrowRight, FiChevronRight } from "react-icons/fi";

import { formatDashboardLabel, type DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";
import { formatOverviewDate } from "@/modules/overview/domain/overview-formatters";

import type { CategoryAnalysis } from "../../category/category-analysis.types";
import { categoryTransactionsHref } from "../category-analysis-format";
import { formatInsightsMoney } from "../insights-format";

export function CategoryAnalysisTransactions({
  analysis,
  labels,
  workspaceSlug,
}: {
  readonly analysis: CategoryAnalysis;
  readonly labels: DashboardLabels;
  readonly workspaceSlug: string;
}) {
  const { transactions } = analysis;
  const viewAllHref = categoryTransactionsHref(analysis, workspaceSlug);
  const countFormatter = new Intl.NumberFormat(analysis.locale);

  return (
    <section
      aria-labelledby="category-transactions-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]" id="category-transactions-title">
            {labels["insights.category.transactions.title"]}
          </h2>
          {transactions.totalCount ? (
            <p className="text-[12px] leading-5 text-[#71809a]">
              {formatDashboardLabel(labels, "insights.category.transactions.summary", {
                count: countFormatter.format(transactions.totalCount),
              })}
              {transactions.refundCount
                ? ` · ${formatDashboardLabel(labels, "insights.category.transactions.refunds", {
                    count: countFormatter.format(transactions.refundCount),
                  })}`
                : null}
            </p>
          ) : null}
        </div>
        {viewAllHref && transactions.totalCount ? (
          <Link
            className="inline-flex items-center gap-1 rounded-sm text-[12px] font-medium text-[#2166dc] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
            href={viewAllHref}>
            {labels["insights.category.transactions.viewAll"]}
            <FiArrowRight aria-hidden="true" className="size-3" />
          </Link>
        ) : null}
      </div>
      {transactions.items.length ? (
        <ul className="mt-2 divide-y divide-[#edf0f4]">
          {transactions.items.map((transaction) => {
            const isRefund = transaction.kind === "REFUND";
            const secondary = [
              formatOverviewDate(transaction.date, analysis.locale),
              transaction.categoryName,
              isRefund ? labels["insights.category.transactions.refund"] : null,
            ].filter(Boolean);
            return (
              <li key={transaction.id}>
                <Link
                  className="group -mx-2 flex min-h-13 items-center gap-3 rounded-[8px] px-2 py-2.5 outline-none transition-colors hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                  href={`/w/${workspaceSlug}/transactions/${transaction.id}`}>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-[13px] leading-5 font-medium",
                        transaction.merchantName ? "text-[#1c2740]" : "text-[#5d6b84]",
                      )}>
                      {transaction.merchantName ?? labels["insights.category.merchants.unknown"]}
                    </p>
                    <p className="truncate text-[12px] leading-5 text-[#71809a]">{secondary.join(" · ")}</p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-[13px] leading-5 font-semibold tabular-nums",
                      isRefund ? "text-[#0b8c5a]" : "text-[#1c2740]",
                    )}>
                    {formatInsightsMoney(transaction.signedMinor, analysis.currency, analysis.locale)}
                  </p>
                  <FiChevronRight aria-hidden="true" className="size-4 shrink-0 text-[#b3bccb] group-hover:text-[#71809a]" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-[14px] text-[#667085]">{labels["insights.category.transactions.empty"]}</p>
      )}
    </section>
  );
}
