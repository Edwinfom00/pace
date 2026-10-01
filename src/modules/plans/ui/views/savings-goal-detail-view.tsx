import Link from "next/link";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiDollarSign,
  FiMoreHorizontal,
  FiTarget,
  FiTrendingUp,
} from "react-icons/fi";

import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import { OverviewAskPace } from "@/modules/overview/ui/components/overview-ask-pace";

import type { getSavingsGoalDetail } from "../../queries/get-savings-goal-detail";
import { getPlansUiLabels } from "../plans-ui-labels";
import { SavingsGoalManagementActions } from "../components/savings-goal-management-actions";

type Detail = NonNullable<Awaited<ReturnType<typeof getSavingsGoalDetail>>>;
const replace = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, value),
    template,
  );

export function SavingsGoalDetailView({
  detail,
  language,
  locale,
  timeZone,
  workspaceId,
  workspaceSlug,
}: {
  readonly detail: Detail;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const labels = getPlansUiLabels(language).goalDetail;
  const { goal, metrics, progress, targetDate, capabilities } = detail;
  const money = (value: bigint) =>
    formatOverviewMoney(value, goal.currency, locale);
  const percent = `${(Number(metrics.progressBps) / 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
  const meter = `${Math.min(100, Math.max(0, Number(metrics.progressBps > 10_000n ? 10_000n : metrics.progressBps) / 100))}%`;
  const progressValue = Math.min(100, Number(metrics.progressBps / 100n));
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    }).format(date);
  const status = progress.completed
    ? labels.completed
    : goal.status === "PAUSED"
      ? labels.paused
      : goal.status === "ARCHIVED"
        ? labels.archived
        : labels.active;
  const statusTone = progress.completed
    ? "bg-[#eaf9f0] text-[#178354]"
    : goal.status === "PAUSED"
      ? "bg-[#fff7e6] text-[#aa7100]"
      : goal.status === "ARCHIVED"
        ? "bg-[#eef1f5] text-[#526788]"
        : "bg-[#edf4ff] text-[#2867e8]";
  const kpis = [
    [
      labels.targetAmount,
      money(metrics.targetAmountMinor),
      FiTarget,
      "bg-[#f1efff] text-[#7145da]",
    ],
    [
      labels.contributed,
      money(metrics.savedAmountMinor),
      FiDollarSign,
      "bg-[#edfaf2] text-[#15945b]",
    ],
    [
      labels.remaining,
      money(metrics.remainingMinor),
      FiTrendingUp,
      "bg-[#fff0ec] text-[#ee6533]",
    ],
    [
      labels.progressPercent,
      percent,
      FiCheckCircle,
      "bg-[#edf4ff] text-[#2867e8]",
    ],
  ] as const;
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-355">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href={`/w/${workspaceSlug}/plans`}
              className="inline-flex items-center gap-2 text-[13px] text-[#526788] hover:text-[#14213c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]">
              <FiArrowLeft aria-hidden />
              {labels.back}
            </Link>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-[12px] bg-[#f1efff] text-[#7145da]">
                <FiTarget className="size-5" aria-hidden />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[27px] font-semibold tracking-[-.04em] text-[#101a35] sm:text-[30px]">
                    {goal.name}
                  </h1>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone}`}>
                    {status}
                  </span>
                </div>
                {targetDate && (
                  <p className="mt-1 text-[13px] text-[#71809a]">
                    {labels.targetDate}: {formatDate(targetDate.date)}
                  </p>
                )}
              </div>
            </div>
          </div>
          {capabilities.actionsAvailable ? (
            <SavingsGoalManagementActions
              capabilities={capabilities}
              goal={goal}
              labels={labels}
              workspaceId={workspaceId}
            />
          ) : (
            <span
              aria-label={labels.more}
              className="grid size-10 place-items-center rounded-[9px] border border-[#e5e9f0] bg-white text-[#526788]">
              <FiMoreHorizontal aria-hidden />
            </span>
          )}
        </header>
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(300px,25vw,360px)]">
          <div className="min-w-0 space-y-4">
            <section
              className={`rounded-[12px] border p-5 ${progress.completed ? "border-[#bde8cd] bg-[#f6fdf8]" : "border-[#e5e9f0] bg-white"}`}
              aria-labelledby="goal-progress">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2
                    id="goal-progress"
                    className="text-[17px] font-semibold tracking-tight text-[#14213c]">
                    {progress.completed ? labels.completed : labels.progress}
                  </h2>
                  <p className="mt-2 text-[22px] font-semibold tracking-[-.035em] text-[#14213c] tabular-nums">
                    {money(metrics.savedAmountMinor)}{" "}
                    <span className="text-[#71809a]">
                      / {money(metrics.targetAmountMinor)}
                    </span>
                  </p>
                </div>
                <strong className="text-[22px] font-semibold text-[#2867e8] tabular-nums">
                  {percent}
                </strong>
              </div>
              <div
                role="progressbar"
                aria-label={`${labels.progress}: ${percent}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressValue}
                className="mt-5 h-3 overflow-hidden rounded-full bg-[#e9edf3]">
                <div
                  className={`h-full rounded-full ${progress.completed ? "bg-[#1c9b5b]" : "bg-[#4f7fe8]"}`}
                  style={{ width: meter }}
                />
              </div>
              <p className="mt-3 text-[13px] text-[#71809a]">
                <strong className="font-semibold text-[#1a2944]">
                  {money(metrics.remainingMinor)}
                </strong>{" "}
                {labels.remaining}
              </p>
              {progress.completed && (
                <p className="mt-3 text-[13px] font-medium text-[#178354]">
                  {labels.completedDescription}
                </p>
              )}
            </section>
            <section
              aria-label={labels.targetAmount}
              className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              {kpis.map(([label, value, Icon, tone]) => (
                <article
                  key={label}
                  className="min-w-0 rounded-[12px] border border-[#e5e9f0] bg-white p-4">
                  <div className="flex gap-3">
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-[10px] ${tone}`}>
                      <Icon aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] text-[#71809a]">{label}</p>
                      <p className="mt-1 truncate text-[18px] font-semibold tracking-[-.035em] text-[#14213c] tabular-nums">
                        {value}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </section>
            <section className="rounded-[12px] border border-[#e5e9f0] bg-white p-5 xl:hidden">
              <h2 className="text-[17px] font-semibold text-[#14213c]">
                {labels.insights}
              </h2>
              <div className="mt-3 space-y-2 text-[13px] leading-5 text-[#71809a]">
                <p>
                  {percent} {labels.progressPercent.toLocaleLowerCase()}.
                </p>
                {targetDate && (
                  <>
                    <p>
                      {replace(labels.daysRemaining, {
                        days: targetDate.daysRemaining.toLocaleString(locale),
                      })}
                      .
                    </p>
                    {targetDate.requiredDailyMinor && (
                      <p>
                        {labels.requiredDaily}:{" "}
                        <strong className="font-medium text-[#1a2944]">
                          {money(targetDate.requiredDailyMinor)}
                        </strong>
                        .
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
            <section
              className="rounded-[12px] border border-[#e5e9f0] bg-white p-5"
              aria-labelledby="goal-history">
              <h2
                id="goal-history"
                className="text-[17px] font-semibold tracking-tight text-[#14213c]">
                {labels.history}
              </h2>
              <p className="mt-3 text-[13px] leading-5 text-[#71809a]">
                {labels.historyEmpty}
              </p>
            </section>
            <section
              className="rounded-[12px] border border-[#e5e9f0] bg-white p-5"
              aria-labelledby="goal-contributions">
              <h2
                id="goal-contributions"
                className="text-[17px] font-semibold tracking-tight text-[#14213c]">
                {labels.contributions}
              </h2>
              <p className="mt-3 text-[13px] leading-5 text-[#71809a]">
                {labels.contributionsEmpty}
              </p>
            </section>
            <section className="rounded-[12px] border border-[#e5e9f0] bg-white p-5 xl:hidden">
              <h2 className="text-[17px] font-semibold text-[#14213c]">
                {labels.details}
              </h2>
              <dl className="mt-4 space-y-3 text-[13px]">
                <Detail
                  label={labels.targetAmount}
                  value={money(metrics.targetAmountMinor)}
                />
                <Detail
                  label={labels.contributed}
                  value={money(metrics.savedAmountMinor)}
                />
                <Detail
                  label={labels.remaining}
                  value={money(metrics.remainingMinor)}
                />
                <Detail
                  label={labels.targetDate}
                  value={
                    targetDate
                      ? formatDate(targetDate.date)
                      : labels.noTargetDate
                  }
                />
                <Detail
                  label={labels.created}
                  value={formatDate(goal.createdAt)}
                />
                <Detail label={labels.currency} value={goal.currency} />
                <Detail label={labels.status} value={status} />
              </dl>
            </section>
          </div>
          <div className="xl:hidden">
            <div className="overflow-hidden rounded-[12px] border border-[#e5e9f0] bg-white">
              <OverviewAskPace
                language={language}
                locale={locale}
                pageContext={{ page: "plans" }}
                timeZone={timeZone}
                workspaceId={workspaceId}
              />
            </div>
          </div>
          <aside className="hidden space-y-4 xl:sticky xl:top-5 xl:block xl:self-start">
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
              <div className="mt-3 space-y-2 text-[13px] leading-5 text-[#71809a]">
                <p>
                  {percent} {labels.progressPercent.toLocaleLowerCase()}.
                </p>
                {targetDate && (
                  <>
                    <p>
                      {replace(labels.daysRemaining, {
                        days: targetDate.daysRemaining.toLocaleString(locale),
                      })}
                      .
                    </p>
                    {targetDate.requiredDailyMinor && (
                      <p>
                        {labels.requiredDaily}:{" "}
                        <strong className="font-medium text-[#1a2944]">
                          {money(targetDate.requiredDailyMinor)}
                        </strong>
                        .
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
            <section className="rounded-[12px] border border-[#e5e9f0] bg-white p-5">
              <h2 className="text-[17px] font-semibold text-[#14213c]">
                {labels.details}
              </h2>
              <dl className="mt-4 space-y-3 text-[13px]">
                <Detail
                  label={labels.targetAmount}
                  value={money(metrics.targetAmountMinor)}
                />
                <Detail
                  label={labels.contributed}
                  value={money(metrics.savedAmountMinor)}
                />
                <Detail
                  label={labels.remaining}
                  value={money(metrics.remainingMinor)}
                />
                <Detail
                  label={labels.targetDate}
                  value={
                    targetDate
                      ? formatDate(targetDate.date)
                      : labels.noTargetDate
                  }
                />
                <Detail
                  label={labels.created}
                  value={formatDate(goal.createdAt)}
                />
                <Detail label={labels.currency} value={goal.currency} />
                <Detail label={labels.status} value={status} />
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#71809a]">{label}</dt>
      <dd className="text-right font-medium text-[#1a2944]">{value}</dd>
    </div>
  );
}
