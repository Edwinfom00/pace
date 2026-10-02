import { FiArrowDownLeft, FiArrowUpRight, FiRepeat } from "react-icons/fi";

import { formatDashboardLabel, type DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import type { AccountAnalysis } from "../../account/account-analysis.types";
import { categoryBarWidth, formatInsightsMoney, formatInsightsShare } from "../insights-format";

export function AccountCategoryBreakdown({
  analysis,
  labels,
}: {
  readonly analysis: AccountAnalysis;
  readonly labels: DashboardLabels;
}) {
  const { categories } = analysis;
  const money = (minor: string) => formatInsightsMoney(minor, analysis.currency, analysis.locale);
  const rows = [
    ...categories.items.map((item) => ({
      key: item.id,
      name: item.name,
      muted: item.isUncategorized,
      spendingMinor: item.spendingMinor,
      previousMinor: item.previousSpendingMinor as string | null,
      shareBps: item.shareBps,
    })),
    ...(categories.other
      ? [{
          key: "__other__",
          name: formatDashboardLabel(labels, "insights.categories.other", { count: categories.other.categoryCount }),
          muted: true,
          spendingMinor: categories.other.spendingMinor,
          previousMinor: null,
          shareBps: categories.other.shareBps,
        }]
      : []),
  ];

  return (
    <section aria-labelledby="account-categories-title" className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]" id="account-categories-title">
          {labels["insights.account.categories.title"]}
        </h2>
        {rows.length ? (
          <p className="text-[13px] font-medium text-[#1c2740] tabular-nums">{money(categories.totalMinor)}</p>
        ) : null}
      </div>
      {rows.length ? (
        <ul className="mt-4 space-y-3.5">
          {rows.map((row) => (
            <li className="min-w-0" key={row.key}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className={cn("truncate font-medium", row.muted ? "text-[#44516a]" : "text-[#1c2740]")}>{row.name}</span>
                <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                  <span className="text-[12px] text-[#71809a]">{formatInsightsShare(row.shareBps, analysis.locale)}</span>
                  <span className="font-medium text-[#1c2740]">{money(row.spendingMinor)}</span>
                </span>
              </div>
              <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eef2f7]">
                <div
                  className={cn("h-full rounded-full", row.muted ? "bg-[#9db3d6]" : "bg-[#1769e8]")}
                  style={{ width: categoryBarWidth(row.shareBps) }}
                />
              </div>
              {row.previousMinor !== null ? (
                <p className="mt-1 text-[11px] leading-4 text-[#8a96ab] tabular-nums">
                  {formatDashboardLabel(labels, "insights.categories.previous", { amount: money(row.previousMinor) })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="grid h-40 place-items-center px-4 text-center text-[14px] text-[#667085]">
          {labels["insights.account.categories.empty"]}
        </p>
      )}
    </section>
  );
}

export function AccountCounterparties({
  analysis,
  labels,
}: {
  readonly analysis: AccountAnalysis;
  readonly labels: DashboardLabels;
}) {
  const money = (minor: string) => formatInsightsMoney(minor, analysis.currency, analysis.locale);
  const count = new Intl.NumberFormat(analysis.locale);

  return (
    <section aria-labelledby="account-counterparties-title" className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]" id="account-counterparties-title">
        {labels["insights.account.counterparties.title"]}
      </h2>
      {analysis.counterparties.length ? (
        <ul className="mt-2 divide-y divide-[#edf0f4]">
          {analysis.counterparties.map((row) => {
            const isAccount = row.kind === "account";
            return (
              <li className="flex min-w-0 items-center gap-3 py-2.5 last:pb-0" key={`${row.kind}:${row.id}`}>
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f2f5f9] text-[#5d6b84]">
                  {isAccount ? <FiRepeat className="size-3.5" /> : row.outflowMinor !== "0" ? <FiArrowUpRight className="size-3.5" /> : <FiArrowDownLeft className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-[13px] leading-5 font-medium", row.name ? "text-[#1c2740]" : "text-[#5d6b84]")}>
                    {row.name ?? labels["insights.account.counterparties.unknown"]}
                  </p>
                  <p className="truncate text-[12px] leading-5 text-[#71809a]">
                    {[
                      isAccount ? labels["insights.account.counterparties.transfer"] : null,
                      formatDashboardLabel(labels, "insights.account.counterparties.count", {
                        count: count.format(row.transactionCount),
                      }),
                      formatInsightsShare(row.shareBps, analysis.locale),
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right text-[13px] leading-5 font-semibold tabular-nums">
                  {row.inflowMinor !== "0" ? <p className="text-[#0b8c5a]">+{money(row.inflowMinor)}</p> : null}
                  {row.outflowMinor !== "0" ? <p className="text-[#1c2740]">−{money(row.outflowMinor)}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="grid h-40 place-items-center px-4 text-center text-[14px] text-[#667085]">
          {labels["insights.account.counterparties.empty"]}
        </p>
      )}
    </section>
  );
}
