import { FiInfo } from "react-icons/fi";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { formatDashboardLabel, type DashboardLabels } from "@/i18n/dashboard-messages";
import { formatOverviewDate } from "@/modules/overview/domain/overview-formatters";

import type { AccountAnalysis } from "../../account/account-analysis.types";
import { accountAnalysisNotes, accountTypeLabel } from "../account-analysis-format";
import { formatInsightsMoney, formatInsightsWindow } from "../insights-format";
import { InsightsAskPace } from "./insights-ask-pace";

export function AccountAnalysisRightRail({
  analysis,
  labels,
  language,
  timeZone,
  workspaceId,
}: {
  readonly analysis: AccountAnalysis;
  readonly labels: DashboardLabels;
  readonly language: "en" | "fr" | "de";
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  const { account, balances, composition } = analysis;
  const money = (minor: string) => formatInsightsMoney(minor, analysis.currency, analysis.locale);
  const rows: Array<{ key: string; label: string; value: string }> = [
    { key: "type", label: labels["insights.account.rail.type"], value: accountTypeLabel(account.type, labels) },
    { key: "currency", label: labels["insights.category.rail.currency"], value: analysis.currency },
    ...(balances.openingBalance
      ? [{
          key: "opening",
          label: labels["insights.account.rail.openingBalance"],
          value: formatDashboardLabel(labels, "insights.account.rail.openingBalanceValue", {
            amount: money(balances.openingBalance.amountMinor),
            date: formatOverviewDate(balances.openingBalance.date, analysis.locale),
          }),
        }]
      : []),
    { key: "income", label: labels["insights.account.movement.INCOME"], value: money(composition.incomeMinor) },
    { key: "refunds", label: labels["insights.account.rail.refunds"], value: money(composition.refundsMinor) },
    { key: "transfersIn", label: labels["insights.account.rail.transfersIn"], value: money(composition.transfersInMinor) },
    { key: "expenses", label: labels["insights.account.movement.EXPENSE"], value: money(composition.expensesMinor) },
    { key: "transfersOut", label: labels["insights.account.rail.transfersOut"], value: money(composition.transfersOutMinor) },
    { key: "period", label: labels["insights.category.rail.period"], value: formatInsightsWindow(analysis.current, analysis.locale) },
    { key: "comparison", label: labels["insights.category.rail.comparison"], value: formatInsightsWindow(analysis.previous, analysis.locale) },
  ];

  return (
    <aside
      aria-label={labels["insights.account.rail.label"]}
      className="overflow-hidden rounded-[14px] border border-[#e5e9f0] bg-white">
      <section aria-labelledby="account-rail-title" className="px-5 py-5 sm:px-6">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#101a35]" id="account-rail-title">
          {labels["insights.account.rail.title"]}
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
      <section aria-labelledby="account-ask-title" className="border-t border-[#edf0f4] px-5 py-5 sm:px-6">
        <div className="flex items-center gap-2">
          <PaceLogo alt="" height={20} variant="icon" width={20} />
          <h2 className="text-[14px] font-semibold text-[#101a35]" id="account-ask-title">
            {labels["insights.category.rail.askTitle"]}
          </h2>
        </div>
        <p className="mt-1 mb-3 text-[12px] leading-5 text-[#71809a]">{labels["insights.account.rail.askDescription"]}</p>
        <InsightsAskPace language={language} locale={analysis.locale} timeZone={timeZone} workspaceId={workspaceId} />
      </section>
      <section aria-labelledby="account-notes-title" className="border-t border-[#edf0f4] bg-[#fbfcfe] px-5 py-5 sm:px-6">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-[#263149]" id="account-notes-title">
          <FiInfo aria-hidden="true" className="size-4 text-[#71809a]" />
          {labels["insights.rail.notes.title"]}
        </h2>
        <ul className="mt-3 space-y-2 text-[12px] leading-5 text-[#5d6b84]">
          {accountAnalysisNotes(analysis, labels).map((note) => (
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
