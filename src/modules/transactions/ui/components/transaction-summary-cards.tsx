import type { ReactNode } from "react";
import { HiArrowDown, HiArrowUp, HiOutlineArrowDown, HiOutlineArrowUpRight, HiOutlineDocumentText } from "react-icons/hi2";

import { cn } from "@/lib/utils";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";

import type { TransactionListSummary } from "../../types/transaction-ui.types";
import type { TransactionUiLabels } from "../transaction-ui-labels";

type Trend = { readonly percent: number; readonly good: boolean } | null;

export function TransactionSummaryCards({
  summary,
  totalCount,
  labels,
  locale,
}: {
  readonly summary: TransactionListSummary;
  readonly totalCount: number;
  readonly labels: TransactionUiLabels;
  readonly locale: string;
}) {
  const comparison = summary.comparison;
  const periodLabel = comparison
    ? new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(`${comparison.from}T00:00:00.000Z`))
    : "";
  const countTrend = comparison ? trend(BigInt(totalCount), BigInt(comparison.totalCount), true) : null;
  const spentTrend = comparison ? trend(BigInt(summary.current.spendingMinor), BigInt(comparison.totals.spendingMinor), false) : null;
  const incomeTrend = comparison ? trend(BigInt(summary.current.incomeMinor), BigInt(comparison.totals.incomeMinor), true) : null;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <SummaryCard
        icon={<HiOutlineDocumentText aria-hidden="true" className="size-5" />}
        iconClassName="bg-[#eef5ff] text-[#2563eb]"
        label={labels.summaryCount}
        trend={countTrend}
        periodLabel={periodLabel}
        comparisonLabel={labels.summaryComparison}
        value={<span className="tabular-nums">{new Intl.NumberFormat(locale).format(totalCount)}</span>}
      />
      <SummaryCard
        footnote={summary.hasOtherCurrencies ? labels.summaryOtherCurrencies : undefined}
        icon={<HiOutlineArrowDown aria-hidden="true" className="size-5" />}
        iconClassName="bg-[#fff1f0] text-[#e5483d]"
        label={labels.summarySpent}
        trend={spentTrend}
        periodLabel={periodLabel}
        comparisonLabel={labels.summaryComparison}
        value={<MoneyValue currency={summary.currency} locale={locale} minor={summary.current.spendingMinor} />}
      />
      <SummaryCard
        footnote={summary.hasOtherCurrencies ? labels.summaryOtherCurrencies : undefined}
        icon={<HiOutlineArrowUpRight aria-hidden="true" className="size-5" />}
        iconClassName="bg-[#eaf8f1] text-[#078652]"
        label={labels.summaryIncome}
        trend={incomeTrend}
        periodLabel={periodLabel}
        comparisonLabel={labels.summaryComparison}
        value={<MoneyValue currency={summary.currency} locale={locale} minor={summary.current.incomeMinor} />}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  iconClassName,
  label,
  value,
  trend,
  periodLabel,
  comparisonLabel,
  footnote,
}: {
  readonly icon: ReactNode;
  readonly iconClassName: string;
  readonly label: string;
  readonly value: ReactNode;
  readonly trend: Trend;
  readonly periodLabel: string;
  readonly comparisonLabel: string;
  readonly footnote?: string;
}) {
  return (
    <article className="flex items-start gap-4 rounded-[12px] border border-[#e7ebf1] bg-white px-4 py-4 sm:px-5">
      <span className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-[12px]", iconClassName)}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[12px] text-[#71809a]">{label}</p>
        <p className="mt-1 truncate text-[22px] font-semibold tracking-[-0.03em] text-[#101a35]">{value}</p>
        {trend ? (
          <p className={cn("mt-1 inline-flex items-center gap-1 text-[12px] font-medium", trend.good ? "text-[#078652]" : "text-[#d4442f]")}>
            {trend.percent >= 0 ? <HiArrowUp aria-hidden="true" className="size-3" /> : <HiArrowDown aria-hidden="true" className="size-3" />}
            {comparisonLabel.replace("{percent}", `${Math.abs(trend.percent)}%`).replace("{period}", periodLabel)}
          </p>
        ) : null}
        {footnote ? <p className="mt-1 text-[11px] text-[#8b98ae]">{footnote}</p> : null}
      </div>
    </article>
  );
}

function MoneyValue({ minor, currency, locale }: { readonly minor: string; readonly currency: string; readonly locale: string }) {
  return <span className="tabular-nums">{formatOverviewMoney(minor, currency, locale)}</span>;
}

function trend(current: bigint, previous: bigint, increaseIsGood: boolean): Trend {
  if (previous <= 0n) return null;
  const percent = Number(((current - previous) * 100n) / previous);
  return { percent, good: percent === 0 || (percent > 0) === increaseIsGood };
}
