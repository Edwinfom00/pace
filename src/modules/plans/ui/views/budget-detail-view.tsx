import Link from "next/link";
import {
  FiArrowLeft,
  FiBarChart2,
  FiCalendar,
  FiCreditCard,
  FiPieChart,
  FiTrendingUp,
} from "react-icons/fi";

import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import { OverviewAskPace } from "@/modules/overview/ui/components/overview-ask-pace";
import { TransactionMobileCard } from "@/modules/transactions/ui/components/transaction-mobile-card";
import { TransactionTable } from "@/modules/transactions/ui/components/transaction-table";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";
import { getDashboardLabels } from "@/i18n/dashboard-messages";

import type { getBudgetDetail } from "../../queries/get-budget-detail";
import { getPlansUiLabels } from "../plans-ui-labels";
import { BudgetManagementActions } from "../components/budget-management-actions";

type Detail = NonNullable<Awaited<ReturnType<typeof getBudgetDetail>>>;
const percent = (bps: bigint) =>
  `${(Number(bps) / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
const meter = (bps: bigint) =>
  `${Math.max(0, Math.min(100, Number(bps > 10_000n ? 10_000n : bps) / 100))}%`;

export function BudgetDetailView({
  detail,
  language,
  locale,
  timeZone,
  workspaceId,
  workspaceSlug,
  now,
}: {
  readonly detail: Detail;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly now: string;
}) {
  const labels = getPlansUiLabels(language);
  const transactionLabels = getTransactionUiLabels(
    getDashboardLabels(language),
  );
  const { summary, category, transactions } = detail;
  const budget = summary.budget;
  const name =
    budget.scope === "OVERALL"
      ? labels.overall
      : (category?.name ?? labels.overall);
  const money = (value: bigint) =>
    formatOverviewMoney(value, budget.currency, locale);
  const near = summary.percentageUsedBps >= 8_000n && !summary.overBudget;
  const status = budget.status === "ARCHIVED"
    ? labels.budgetManagement.archived
    : summary.overBudget
    ? labels.overBudget
    : near
      ? labels.attention
      : labels.onTrack;
  const statusTone = budget.status === "ARCHIVED"
    ? "bg-[#eef1f5] text-[#526788]"
    : summary.overBudget
    ? "bg-[#fff0f2] text-[#c83d50]"
    : near
      ? "bg-[#fff7e6] text-[#aa7100]"
      : "bg-[#eaf9f0] text-[#178354]";
  const kpis = [
    [
      labels.budgeted,
      money(budget.amountMinor),
      FiCreditCard,
      "bg-[#f0ebff] text-[#7446df]",
    ],
    [
      labels.spent,
      money(summary.currentSpendMinor),
      FiTrendingUp,
      "bg-[#fff0f2] text-[#e14b5e]",
    ],
    [
      labels.remaining,
      money(summary.remainingMinor),
      FiPieChart,
      "bg-[#edfaf2] text-[#15945b]",
    ],
    [
      labels.used,
      percent(summary.percentageUsedBps),
      FiBarChart2,
      "bg-[#edf4ff] text-[#2867e8]",
    ],
  ] as const;
  const date = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone,
  }).format(summary.periodStart);
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-355">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href={`/w/${workspaceSlug}/plans`}
              className="inline-flex items-center gap-2 text-[13px] text-[#526788] hover:text-[#14213c]">
              <FiArrowLeft />
              {labels.title}
            </Link>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-[12px] bg-[#fff0ec] text-[#ee6533]">
                <FiPieChart className="size-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-[27px] font-semibold tracking-[-.04em] text-[#101a35] sm:text-[30px]">
                    {name}
                  </h1>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone}`}>
                    {status}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-[#71809a]">
                  {budget.scope === "CATEGORY"
                    ? category?.name
                    : labels.overall}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[#e5e9f0] bg-white px-3 text-[13px] text-[#1a2944]">
              <FiCalendar />
              {date}
            </span>
            <BudgetManagementActions
              budget={budget}
              capabilities={summary.capabilities}
              labels={labels}
              locale={locale}
              timeZone={timeZone}
              workspaceId={workspaceId}
            />
          </div>
        </header>
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(300px,25vw,360px)]">
          <div className="min-w-0 space-y-4">
            <section
              aria-label={labels.budgets}
              className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              {kpis.map(([label, value, Icon, tone]) => (
                <article
                  key={label}
                  className="rounded-[12px] border border-[#e5e9f0] bg-white p-4">
                  <div className="flex gap-3">
                    <span
                      className={`grid size-10 place-items-center rounded-[10px] ${tone}`}>
                      <Icon />
                    </span>
                    <div>
                      <p className="text-[12px] text-[#71809a]">{label}</p>
                      <p className="mt-1 text-[18px] font-semibold tracking-[-.035em] text-[#14213c] tabular-nums">
                        {value}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </section>
            <section className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
              <h2 className="text-[17px] font-semibold tracking-tight text-[#14213c]">
                {labels.progress}
              </h2>
              <div className="mt-4 flex items-center gap-4">
                <div
                  className="h-4 flex-1 overflow-hidden rounded-full bg-[#edf0f4]"
                  aria-label={`${percent(summary.percentageUsedBps)} ${labels.used}`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={Math.min(
                    100,
                    Number(summary.percentageUsedBps / 100n),
                  )}
                  role="progressbar">
                  <div
                    className={`h-full rounded-full ${summary.overBudget ? "bg-[#ed3b50]" : near ? "bg-[#e6a000]" : "bg-[#fb8791]"}`}
                    style={{ width: meter(summary.percentageUsedBps) }}
                  />
                </div>
                <strong className="text-[16px] text-[#14213c]">
                  {percent(summary.percentageUsedBps)}
                </strong>
              </div>
              <p className="mt-3 text-[13px] text-[#71809a]">
                <strong className="font-semibold text-[#1a2944]">
                  {money(summary.currentSpendMinor)}
                </strong>{" "}
                {labels.spent.toLocaleLowerCase()} ·{" "}
                {money(summary.remainingMinor)}{" "}
                {labels.remaining.toLocaleLowerCase()}
              </p>
            </section>
            <section className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
              <h2 className="text-[17px] font-semibold tracking-tight text-[#14213c]">
                {labels.timeline}
              </h2>
              <p className="mt-1 text-[12px] text-[#71809a]">
                {date} · {labels.actualSpending}
              </p>
              <div
                aria-label={`${labels.timeline}: ${money(summary.currentSpendMinor)} ${labels.spent.toLocaleLowerCase()} ${date}.`}
                className="mt-6 flex h-36 items-end gap-3 border-b border-[#e7ebf1] pb-2">
                {[35, 58, 82, 43, 66].map((height, index) => (
                  <div
                    className="flex flex-1 flex-col items-center gap-2"
                    key={index}>
                    <div
                      className="w-full rounded-t-md bg-[#fb9ca4]"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-[10px] text-[#8290a8]">
                      {index + 1}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section className="overflow-hidden rounded-[12px] border border-[#e5e9f0] bg-white">
              <header className="flex items-center justify-between px-5 py-4">
                <h2 className="text-[17px] font-semibold tracking-tight text-[#14213c]">
                  {labels.transactions}
                </h2>
                <span className="text-[12px] text-[#71809a]">
                  {transactions.totalCount}
                </span>
              </header>
              {transactions.items.length ? (
                <>
                  <TransactionTable
                    getDetailHref={(item) =>
                      `/w/${workspaceSlug}/transactions/${item.id}`
                    }
                    labels={transactionLabels}
                    locale={locale}
                    now={now}
                    timeZone={timeZone}
                    transactions={transactions.items}
                  />
                  <div className="space-y-2.5 p-4 md:hidden">
                    {transactions.items.map((item) => (
                      <TransactionMobileCard
                        key={item.id}
                        transaction={item}
                        labels={transactionLabels}
                        locale={locale}
                        now={now}
                        timeZone={timeZone}
                        detailHref={`/w/${workspaceSlug}/transactions/${item.id}`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="px-5 py-10 text-center text-[13px] text-[#71809a]">
                  {labels.emptyTransactions}
                </p>
              )}
            </section>
          </div>
          <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
            <div className="overflow-hidden rounded-[12px] border border-[#e5e9f0] bg-white">
              <OverviewAskPace
                language={language}
                locale={locale}
                pageContext={{ page: "plans" }}
                timeZone={timeZone}
                workspaceId={workspaceId}
              />
            </div>
            <section className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
              <h2 className="text-[17px] font-semibold text-[#14213c]">
                {labels.insights}
              </h2>
              <p className="mt-3 text-[13px] leading-5 text-[#71809a]">
                {summary.overBudget
                  ? `${labels.overBudget}: ${money(-summary.remainingMinor)}.`
                  : `${status}. ${money(summary.remainingMinor)} ${labels.remaining.toLocaleLowerCase()}.`}
              </p>
            </section>
            <section className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
              <h2 className="text-[17px] font-semibold text-[#14213c]">
                {labels.details}
              </h2>
              <dl className="mt-4 space-y-3 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-[#71809a]">{labels.period}</dt>
                  <dd className="text-right text-[#1a2944]">{date}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#71809a]">{labels.category}</dt>
                  <dd className="text-right text-[#1a2944]">{name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#71809a]">{labels.budgeted}</dt>
                  <dd className="font-medium text-[#1a2944]">
                    {money(budget.amountMinor)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#71809a]">{labels.spent}</dt>
                  <dd className="font-medium text-[#1a2944]">
                    {money(summary.currentSpendMinor)}
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
