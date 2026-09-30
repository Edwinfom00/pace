import {
  FiBarChart2,
  FiCreditCard,
  FiMoreHorizontal,
  FiPieChart,
  FiTarget,
  FiTrendingDown,
  FiTrendingUp,
} from "react-icons/fi";
import Link from "next/link";

import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import { OverviewAskPace } from "@/modules/overview/ui/components/overview-ask-pace";
import type { BudgetSummary, SavingsGoalSummary } from "@/modules/plans/domain";

import type { PlansOverview } from "../../queries/get-plans-overview";
import { PlansAskPaceButton } from "../components/plans-ask-pace-button";
import { PlansCreateBudgetControl } from "../components/plans-create-budget-control";
import { PlansTabs } from "../components/plans-tabs";
import type { PlansUiLabels } from "../plans-ui-labels";

function percent(value: bigint) {
  return `${(Number(value) / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
function money(value: bigint, currency: string, locale: string) {
  return formatOverviewMoney(value, currency, locale);
}
function meter(value: bigint) {
  return `${Math.max(0, Math.min(100, Number(value > 10_000n ? 10_000n : value) / 100))}%`;
}
function date(value: Date, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(value);
}

function Kpis({
  budgets,
  labels,
  locale,
}: {
  readonly budgets: readonly BudgetSummary[];
  readonly labels: PlansUiLabels;
  readonly locale: string;
}) {
  const grouped = new Map<string, { budgeted: bigint; spent: bigint }>();
  for (const summary of budgets) {
    const current = grouped.get(summary.budget.currency) ?? {
      budgeted: 0n,
      spent: 0n,
    };
    current.budgeted += summary.budget.amountMinor;
    current.spent += summary.currentSpendMinor;
    grouped.set(summary.budget.currency, current);
  }
  const entries = [...grouped.entries()];
  const value = (kind: "budgeted" | "spent" | "remaining" | "used") =>
    entries.map(([currency, totals]) => {
      const remaining = totals.budgeted - totals.spent;
      const raw =
        kind === "budgeted"
          ? totals.budgeted
          : kind === "spent"
            ? totals.spent
            : kind === "remaining"
              ? remaining
              : totals.budgeted
                ? (totals.spent * 10_000n) / totals.budgeted
                : 0n;
      return (
        <span className="block truncate" key={currency}>
          {kind === "used" ? percent(raw) : money(raw, currency, locale)}
        </span>
      );
    });
  const cards = [
    [labels.budgeted, "budgeted", FiPieChart, "bg-[#edf4ff] text-[#2867e8]"],
    [labels.spent, "spent", FiTrendingUp, "bg-[#fff0f2] text-[#e14b5e]"],
    [
      labels.remaining,
      "remaining",
      FiCreditCard,
      "bg-[#edfaf2] text-[#15945b]",
    ],
    [labels.used, "used", FiBarChart2, "bg-[#f4efff] text-[#7446df]"],
  ] as const;
  return (
    <section
      aria-label={labels.budgets}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, kind, Icon, style]) => (
        <article
          className="min-w-0 rounded-[12px] border border-[#e5e9f0] bg-white p-4"
          key={kind}>
          <div className="flex gap-3">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-[10px] ${style}`}>
              <Icon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] text-[#71809a]">{label}</p>
              <div className="mt-1 text-[18px] font-semibold tracking-[-0.035em] text-[#14213c] tabular-nums">
                {entries.length ? value(kind) : "—"}
              </div>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function BudgetList({
  summaries,
  categoryNames,
  labels,
  locale,
  workspaceSlug,
}: {
  readonly summaries: readonly BudgetSummary[];
  readonly categoryNames: ReadonlyMap<string, string>;
  readonly labels: PlansUiLabels;
  readonly locale: string;
  readonly workspaceSlug: string;
}) {
  return (
    <section
      aria-labelledby="monthly-budgets"
      className="overflow-hidden rounded-[12px] border border-[#e5e9f0] bg-white">
      <header className="px-5 pb-3 pt-4">
        <h2
          className="text-[17px] font-semibold tracking-tight text-[#14213c]"
          id="monthly-budgets">
          {labels.monthlyBudgets}
        </h2>
        <p className="mt-0.5 text-[12px] text-[#71809a]">
          {labels.monthlyBudgetsSubtitle}
        </p>
      </header>
      {summaries.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-165 text-left">
            <thead className="border-y border-[#edf0f4] text-[11px] font-medium text-[#8290a8]">
              <tr>
                <th className="px-5 py-2.5">{labels.budgets}</th>
                <th className="px-4 py-2.5">
                  {labels.spent} / {labels.budgeted}
                </th>
                <th className="px-4 py-2.5">{labels.used}</th>
                <th className="px-4 py-2.5">{labels.status}</th>
                <th className="w-10 px-3 py-2.5">
                  <span className="sr-only">Menu</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((summary) => {
                const name =
                  summary.budget.scope === "OVERALL"
                    ? labels.overall
                    : (categoryNames.get(summary.budget.categoryId ?? "") ??
                      labels.overall);
                const attention =
                  summary.percentageUsedBps >= 8_000n && !summary.overBudget;
                const status = !summary.activeForPeriod
                  ? labels.inactive
                  : summary.overBudget
                    ? labels.overBudget
                    : attention
                      ? labels.attention
                      : labels.onTrack;
                const color = summary.overBudget
                  ? "bg-[#ed3b50]"
                  : attention
                    ? "bg-[#e6a000]"
                    : "bg-[#2867e8]";
                return (
                  <tr
                    className="border-b border-[#edf0f4] last:border-b-0"
                    key={summary.budget.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-7 place-items-center rounded-[7px] bg-[#edf4ff] text-[#2867e8]">
                          <FiPieChart className="size-3.5" />
                        </span>
                        <Link
                          className="rounded-[7px] text-[13px] font-medium text-[#1a2944] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]"
                          href={`/w/${workspaceSlug}/plans/budgets/${summary.budget.id}`}>
                          {name}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#6e7d96]">
                      <span className="font-semibold text-[#1a2944]">
                        {money(
                          summary.currentSpendMinor,
                          summary.budget.currency,
                          locale,
                        )}
                      </span>{" "}
                      /{" "}
                      {money(
                        summary.budget.amountMinor,
                        summary.budget.currency,
                        locale,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-40 overflow-hidden rounded-full bg-[#edf0f4]">
                          <div
                            className={`h-full rounded-full ${color}`}
                            style={{ width: meter(summary.percentageUsedBps) }}
                          />
                        </div>
                        <span className="text-[12px] tabular-nums text-[#71809a]">
                          {percent(summary.percentageUsedBps)}
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-[11px] ${summary.remainingMinor < 0n ? "text-[#c43d4d]" : "text-[#8290a8]"}`}>
                        {money(
                          summary.remainingMinor,
                          summary.budget.currency,
                          locale,
                        )}{" "}
                        {labels.remaining.toLocaleLowerCase()}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-medium ${summary.overBudget ? "bg-[#fff0f2] text-[#c83d50]" : attention ? "bg-[#fff7e6] text-[#aa7100]" : "bg-[#eaf9f0] text-[#178354]"}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        aria-label={name}
                        className="grid size-7 place-items-center rounded-md text-[#7c8aa2] hover:bg-[#f4f6f9]"
                        type="button">
                        <FiMoreHorizontal className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-10 text-center text-[13px] text-[#71809a]">
          {labels.budgetEmpty}
        </p>
      )}
    </section>
  );
}

function Goals({
  summaries,
  labels,
  locale,
  timeZone,
}: {
  readonly summaries: readonly SavingsGoalSummary[];
  readonly labels: PlansUiLabels;
  readonly locale: string;
  readonly timeZone: string;
}) {
  return (
    <section
      aria-labelledby="savings-goals"
      className="rounded-[12px] border border-[#e5e9f0] bg-white p-4 sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-[17px] font-semibold tracking-tight text-[#14213c]"
            id="savings-goals">
            {labels.savings}
          </h2>
          <p className="mt-0.5 text-[12px] text-[#71809a]">
            {labels.savingsSubtitle}
          </p>
        </div>
        <span className="text-[12px] font-medium text-[#2867e8]">
          {labels.seeAll}
        </span>
      </header>
      {summaries.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {summaries.map(({ goal, progressBps, remainingMinor }) => (
            <article
              className="rounded-[10px] border border-[#e5e9f0] p-3.5"
              key={goal.id}>
              <div className="flex gap-2.5">
                <span className="grid size-8 place-items-center rounded-[8px] bg-[#f1efff] text-[#7145da]">
                  <FiTarget className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-[13px] font-medium text-[#1a2944]">
                    {goal.name}
                  </h3>
                  <p className="mt-0.5 text-[12px] font-semibold text-[#1a2944]">
                    {money(goal.targetAmountMinor, goal.currency, locale)}
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#edf0f4]">
                <div
                  className="h-full rounded-full bg-[#2867e8]"
                  style={{ width: meter(progressBps) }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-[#71809a]">
                <span>
                  {money(goal.currentSavedMinor, goal.currency, locale)}{" "}
                  {labels.saved}
                </span>
                <span>{percent(progressBps)}</span>
              </div>
              <p className="mt-1 text-[11px] text-[#8290a8]">
                {money(remainingMinor, goal.currency, locale)} {labels.left}
                {goal.targetDate
                  ? ` · ${date(goal.targetDate, locale, timeZone)}`
                  : ""}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-[13px] text-[#71809a]">
          {labels.savingsEmpty}
        </p>
      )}
    </section>
  );
}

function Rail({
  budgets,
  labels,
  language,
  locale,
  timeZone,
  workspaceId,
}: {
  readonly budgets: readonly BudgetSummary[];
  readonly labels: PlansUiLabels;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  const over = budgets.find((item) => item.overBudget);
  const nearing = budgets.find(
    (item) => !item.overBudget && item.percentageUsedBps >= 8_000n,
  );
  const title = over
    ? labels.insightOverBudget
    : nearing
      ? labels.insightAttention
      : labels.insightOnTrack;
  const detail = over ?? nearing;
  return (
    <aside className="overflow-hidden rounded-[12px] border border-[#e5e9f0] bg-white">
      <OverviewAskPace
        language={language}
        locale={locale}
        pageContext={{ page: "plans" }}
        timeZone={timeZone}
        workspaceId={workspaceId}
      />
      <section className="border-t border-[#edf0f4] px-5 py-5">
        <h2 className="text-[17px] font-semibold tracking-tight text-[#14213c]">
          {labels.planInsights}
        </h2>
        <div className="mt-4 flex gap-3">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-[9px] ${over ? "bg-[#fff0f2] text-[#d74355]" : nearing ? "bg-[#fff7e6] text-[#b67600]" : "bg-[#edf4ff] text-[#2867e8]"}`}>
            {over ? (
              <FiTrendingUp className="size-4" />
            ) : (
              <FiTrendingDown className="size-4" />
            )}
          </span>
          <div>
            <h3 className="text-[13px] font-medium text-[#1a2944]">{title}</h3>
            <p className="mt-1 text-[12px] leading-4 text-[#71809a]">
              {detail
                ? `${money(detail.currentSpendMinor, detail.budget.currency, locale)} / ${money(detail.budget.amountMinor, detail.budget.currency, locale)}`
                : labels.monthlyBudgetsSubtitle}
            </p>
          </div>
        </div>
      </section>
    </aside>
  );
}

export function PlansOverviewView({
  overview,
  labels,
  locale,
  timeZone,
  language,
  workspaceId,
  workspaceSlug,
}: {
  readonly overview: PlansOverview;
  readonly labels: PlansUiLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly language: "en" | "fr" | "de";
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const budgets = overview.budgets.filter((item) => item.activeForPeriod);
  const goals = overview.savingsGoals.filter(
    (item) => item.goal.status !== "ARCHIVED",
  );
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto w-full max-w-355">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.045em] text-[#101a35] sm:text-[30px]">
              {labels.title}
            </h1>
            <p className="mt-1 text-[13px] text-[#71809a]">{labels.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <PlansAskPaceButton
              label={labels.askPace}
              language={language}
              locale={locale}
              timeZone={timeZone}
              workspaceId={workspaceId}
            />
            <PlansCreateBudgetControl
              labels={labels}
              workspaceId={workspaceId}
            />
          </div>
        </header>
        <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(300px,25vw,360px)] xl:items-start">
          <div className="min-w-0">
            <PlansTabs
              budgetContent={
                <>
                  <Kpis budgets={budgets} labels={labels} locale={locale} />
                  <div className="mt-4">
                    <BudgetList
                      categoryNames={overview.categoryNames}
                      labels={labels}
                      locale={locale}
                      summaries={budgets}
                      workspaceSlug={workspaceSlug}
                    />
                  </div>
                </>
              }
              goalContent={
                <Goals
                  labels={labels}
                  locale={locale}
                  summaries={goals}
                  timeZone={timeZone}
                />
              }
              allContent={
                <div className="space-y-4">
                  <Kpis budgets={budgets} labels={labels} locale={locale} />
                  <BudgetList
                    categoryNames={overview.categoryNames}
                    labels={labels}
                    locale={locale}
                    summaries={budgets}
                    workspaceSlug={workspaceSlug}
                  />
                  <Goals
                    labels={labels}
                    locale={locale}
                    summaries={goals}
                    timeZone={timeZone}
                  />
                  <section className="rounded-[12px] border border-dashed border-[#dce3ed] bg-[#fbfcfe] px-5 py-5">
                    <h2 className="text-[14px] font-semibold text-[#1a2944]">
                      {labels.forecasts}
                    </h2>
                    <p className="mt-1 text-[13px] text-[#71809a]">
                      {labels.unavailable}
                    </p>
                  </section>
                  <section className="rounded-[12px] border border-dashed border-[#dce3ed] bg-[#fbfcfe] px-5 py-5">
                    <h2 className="text-[14px] font-semibold text-[#1a2944]">
                      {labels.rules}
                    </h2>
                    <p className="mt-1 text-[13px] text-[#71809a]">
                      {labels.unavailable}
                    </p>
                  </section>
                </div>
              }
              unavailableContent={
                <p className="rounded-[12px] border border-dashed border-[#dce3ed] bg-[#fbfcfe] px-5 py-10 text-center text-[13px] text-[#71809a]">
                  {labels.unavailable}
                </p>
              }
              labels={labels}
            />
          </div>
          <div className="min-w-0 xl:sticky xl:top-5" id="ask-pace">
            <Rail
              budgets={budgets}
              labels={labels}
              language={language}
              locale={locale}
              timeZone={timeZone}
              workspaceId={workspaceId}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
