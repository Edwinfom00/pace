import Link from "next/link";
import { FiChevronRight } from "react-icons/fi";

import { formatDashboardLabel, type DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import type { InsightsAccountSummary } from "../../account/account-analysis.types";
import type { InsightsOverview } from "../../overview/insights-overview.types";
import { accountTypeLabel, formatSignedMoney } from "../account-analysis-format";
import { formatInsightsMoney } from "../insights-format";
import { insightsAccountHref } from "../insights-links";

export function InsightsAccounts({
  accounts,
  labels,
  overview,
  workspaceSlug,
}: {
  readonly accounts: readonly InsightsAccountSummary[];
  readonly labels: DashboardLabels;
  readonly overview: Pick<InsightsOverview, "currency" | "locale" | "periodKey" | "range" | "workspaceCurrency">;
  readonly workspaceSlug: string;
}) {
  const state = {
    periodKey: overview.periodKey,
    range: overview.range,
    currency: overview.currency,
    workspaceCurrency: overview.workspaceCurrency,
  };
  const money = (minor: string) => formatInsightsMoney(minor, overview.currency, overview.locale);

  return (
    <section aria-labelledby="insights-accounts-title" className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]" id="insights-accounts-title">
          {labels["insights.accounts.title"]}
        </h2>
        <p className="text-[12px] leading-5 text-[#71809a]">
          {formatDashboardLabel(labels, "insights.accounts.description", { currency: overview.currency })}
        </p>
      </div>
      {accounts.length ? (
        <ul className="mt-2 divide-y divide-[#edf0f4]">
          {accounts.map((account) => (
            <li key={account.id}>
              <Link
                className="group -mx-2 flex min-h-13 items-center gap-3 rounded-[8px] px-2 py-2.5 outline-none transition-colors hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                href={insightsAccountHref(workspaceSlug, account.id, state)}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] leading-5 font-medium text-[#1c2740]">{account.name}</p>
                  <p className="truncate text-[12px] leading-5 text-[#71809a] tabular-nums">
                    {accountTypeLabel(account.type, labels)}
                    {account.transactionCount ? (
                      <>
                        {" · "}
                        {formatDashboardLabel(labels, "insights.accounts.flows", {
                          inflows: money(account.inflowsMinor),
                          outflows: money(account.outflowsMinor),
                        })}
                      </>
                    ) : (
                      <> · {labels["insights.accounts.noMovement"]}</>
                    )}
                  </p>
                </div>
                <p
                  className={cn(
                    "shrink-0 text-[13px] leading-5 font-semibold tabular-nums",
                    account.netMinor.startsWith("-") ? "text-[#1c2740]" : account.netMinor === "0" ? "text-[#8a96ab]" : "text-[#0b8c5a]",
                  )}>
                  <span className="sr-only">{labels["insights.account.kpi.net"]}: </span>
                  {formatSignedMoney(account.netMinor, overview.currency, overview.locale)}
                </p>
                <FiChevronRight aria-hidden="true" className="size-4 shrink-0 text-[#b3bccb] group-hover:text-[#71809a]" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-[14px] text-[#667085]">
          {formatDashboardLabel(labels, "insights.accounts.empty", { currency: overview.currency })}
        </p>
      )}
    </section>
  );
}
