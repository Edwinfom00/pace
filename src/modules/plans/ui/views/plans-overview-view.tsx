import { FiCalendar, FiPieChart, FiTarget } from "react-icons/fi";

import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import type { BudgetSummary, SavingsGoalSummary } from "@/modules/plans/domain";

import type { PlansOverview } from "../../queries/get-plans-overview";
import type { PlansUiLabels } from "../plans-ui-labels";

function percent(value: bigint): string {
  return `${(Number(value) / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function date(value: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(value);
}

function Meter({ value }: { readonly value: bigint }) {
  const width = Math.min(
    100,
    Math.max(0, Number(value > 10_000n ? 10_000n : value) / 100),
  );
  return (
    <div
      aria-hidden="true"
      className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#edf1f6]">
      <div
        className="h-full rounded-full bg-[#3974d9]"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function BudgetCard({
  summary,
  categoryName,
  labels,
  locale,
  timeZone,
}: {
  readonly summary: BudgetSummary;
  readonly categoryName: string | undefined;
  readonly labels: PlansUiLabels;
  readonly locale: string;
  readonly timeZone: string;
}) {
  const { budget } = summary;
  const status = !summary.activeForPeriod
    ? labels.inactive
    : summary.overBudget
      ? labels.overBudget
      : labels.onTrack;
  const statusClass = !summary.activeForPeriod
    ? "bg-[#f2f4f7] text-[#66758d]"
    : summary.overBudget
      ? "bg-[#fff2f0] text-[#bc4d39]"
      : "bg-[#edf8f1] text-[#237a4b]";
  return (
    <article className="rounded-[12px] border border-[#e4e9f0] bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#eef4ff] text-[#2867e8]">
          <FiPieChart className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold text-[#17223b]">
            {budget.scope === "OVERALL"
              ? labels.overall
              : (categoryName ?? labels.overall)}
          </h3>
          <p className="mt-0.5 text-[11px] text-[#728099]">
            {labels.period}: {date(summary.periodStart, locale, timeZone)} –{" "}
            {date(summary.periodEnd, locale, timeZone)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass}`}>
          {status}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-y border-[#edf0f4] py-3 text-[11px] text-[#728099]">
        <div>
          <p>{labels.amount}</p>
          <p className="mt-1 truncate text-[13px] font-semibold text-[#1d2941]">
            {formatOverviewMoney(budget.amountMinor, budget.currency, locale)}
          </p>
        </div>
        <div>
          <p>{labels.spent}</p>
          <p className="mt-1 truncate text-[13px] font-semibold text-[#1d2941]">
            {formatOverviewMoney(
              summary.currentSpendMinor,
              budget.currency,
              locale,
            )}
          </p>
        </div>
        <div>
          <p>{labels.remaining}</p>
          <p
            className={`mt-1 truncate text-[13px] font-semibold ${summary.remainingMinor < 0n ? "text-[#bc4d39]" : "text-[#1d2941]"}`}>
            {formatOverviewMoney(
              summary.remainingMinor,
              budget.currency,
              locale,
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="mt-3 text-[11px] font-medium text-[#60708b]">
          {labels.progress}
        </p>
        <p className="mt-3 text-[11px] font-semibold text-[#1d2941] tabular-nums">
          {percent(summary.percentageUsedBps)}
        </p>
      </div>
      <Meter value={summary.percentageUsedBps} />
    </article>
  );
}

function SavingsCard({
  summary,
  labels,
  locale,
  timeZone,
}: {
  readonly summary: SavingsGoalSummary;
  readonly labels: PlansUiLabels;
  readonly locale: string;
  readonly timeZone: string;
}) {
  const { goal } = summary;
  return (
    <article className="rounded-[12px] border border-[#e4e9f0] bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#effaf2] text-[#198754]">
          <FiTarget className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold text-[#17223b]">
            {goal.name}
          </h3>
          {goal.targetDate ? (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#728099]">
              <FiCalendar aria-hidden="true" className="size-3" />
              {labels.targetDate}: {date(goal.targetDate, locale, timeZone)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-y border-[#edf0f4] py-3 text-[11px] text-[#728099]">
        <div>
          <p>{labels.target}</p>
          <p className="mt-1 truncate text-[13px] font-semibold text-[#1d2941]">
            {formatOverviewMoney(goal.targetAmountMinor, goal.currency, locale)}
          </p>
        </div>
        <div>
          <p>{labels.current}</p>
          <p className="mt-1 truncate text-[13px] font-semibold text-[#1d2941]">
            {formatOverviewMoney(goal.currentSavedMinor, goal.currency, locale)}
          </p>
        </div>
        <div>
          <p>{labels.remaining}</p>
          <p className="mt-1 truncate text-[13px] font-semibold text-[#1d2941]">
            {formatOverviewMoney(summary.remainingMinor, goal.currency, locale)}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="mt-3 text-[11px] font-medium text-[#60708b]">
          {labels.progress}
        </p>
        <p className="mt-3 text-[11px] font-semibold text-[#1d2941] tabular-nums">
          {percent(summary.progressBps)}
        </p>
      </div>
      <Meter value={summary.progressBps} />
    </article>
  );
}

export function PlansOverviewView({
  overview,
  labels,
  locale,
  timeZone,
}: {
  readonly overview: PlansOverview;
  readonly labels: PlansUiLabels;
  readonly locale: string;
  readonly timeZone: string;
}) {
  const activeBudgets = overview.budgets.filter(
    (summary) => summary.activeForPeriod,
  );
  const visibleSavingsGoals = overview.savingsGoals.filter(
    (summary) => summary.goal.status !== "ARCHIVED",
  );
  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="pb-6">
        <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">
          {labels.title}
        </h1>
        <p className="mt-1 text-[13px] text-[#71809a]">{labels.subtitle}</p>
      </header>
      <section aria-labelledby="plans-budgets-title">
        <h2
          id="plans-budgets-title"
          className="text-[16px] font-semibold tracking-[-0.02em] text-[#1b2842]">
          {labels.budgets}
        </h2>
        {activeBudgets.length ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {activeBudgets.map((summary) => (
              <BudgetCard
                categoryName={
                  summary.budget.categoryId
                    ? overview.categoryNames.get(summary.budget.categoryId)
                    : undefined
                }
                key={summary.budget.id}
                labels={labels}
                locale={locale}
                summary={summary}
                timeZone={timeZone}
              />
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-[12px] border border-dashed border-[#dce3ed] bg-[#fbfcfe] px-4 py-8 text-center text-[13px] text-[#71809a]">
            {labels.budgetEmpty}
          </p>
        )}
      </section>
      <section aria-labelledby="plans-savings-title" className="mt-8">
        <h2
          id="plans-savings-title"
          className="text-[16px] font-semibold tracking-[-0.02em] text-[#1b2842]">
          {labels.savings}
        </h2>
        {visibleSavingsGoals.length ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {visibleSavingsGoals.map((summary) => (
              <SavingsCard
                key={summary.goal.id}
                labels={labels}
                locale={locale}
                summary={summary}
                timeZone={timeZone}
              />
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-[12px] border border-dashed border-[#dce3ed] bg-[#fbfcfe] px-4 py-8 text-center text-[13px] text-[#71809a]">
            {labels.savingsEmpty}
          </p>
        )}
      </section>
    </main>
  );
}
