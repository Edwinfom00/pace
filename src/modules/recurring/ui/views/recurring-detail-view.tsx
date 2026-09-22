import Link from "next/link";
import type { ReactNode } from "react";
import {
  FiArrowLeft,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiInfo,
  FiRepeat,
  FiTag,
  FiTrendingDown,
} from "react-icons/fi";

import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import type {
  RecurringDetail,
  RecurringDetailHistory,
  RecurringDetailOccurrence,
  RecurringDetailTab,
} from "@/modules/recurring/domain/recurring-detail";
import { getRecurringUiLabels } from "@/modules/recurring/ui/recurring-ui-labels";
import { RecurringAskPace } from "@/modules/recurring/ui/components/recurring-ask-pace";
import { RecurringDetailTabs } from "@/modules/recurring/ui/components/recurring-detail-tabs";
import { RecurringStatusBadge } from "@/modules/recurring/ui/components/recurring-status-badge";
import { formatSystemCategory } from "@/modules/transactions/ui/transaction-detail-labels";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";
import { TransactionTable } from "@/modules/transactions/ui/components/transaction-table";
import { TransactionMobileCard } from "@/modules/transactions/ui/components/transaction-mobile-card";

import type { RecurringDetailUiLabels } from "../recurring-detail-ui-labels";

function formatDate(value: string, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

function calendarDay(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  }).formatToParts(value);
  const part = (type: "year" | "month" | "day") =>
    parts.find((entry) => entry.type === type)?.value ?? "0";
  return Date.UTC(
    Number(part("year")),
    Number(part("month")) - 1,
    Number(part("day")),
  );
}

function formatRelativeDay(
  value: string,
  now: string,
  locale: string,
  timeZone: string,
) {
  const difference = Math.round(
    (calendarDay(new Date(value), timeZone) -
      calendarDay(new Date(now), timeZone)) /
      86_400_000,
  );
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    difference,
    "day",
  );
}

function detailTabHref(
  workspaceSlug: string,
  recurringId: string,
  tab: Exclude<RecurringDetailTab, "overview">,
) {
  return `/w/${workspaceSlug}/recurring/${recurringId}?tab=${tab}`;
}

function formatCadence(template: string, days: number) {
  return template.replace("{days}", String(days));
}

function MetricCard({
  children,
  description,
  icon,
  title,
  tone,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly tone: "blue" | "green" | "slate";
}) {
  const toneClass =
    tone === "blue"
      ? "bg-[#eef4ff] text-[#2e70e7]"
      : tone === "green"
        ? "bg-[#edf9f2] text-[#168151]"
        : "bg-[#f3f5f8] text-[#67758d]";
  return (
    <article className="min-w-0 rounded-[12px] border border-[#e3e8ef] bg-white p-3.5 sm:p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`grid size-8 shrink-0 place-items-center rounded-[9px] ${toneClass}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-[#75829a]">{title}</p>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[#14203a] sm:text-[19px]">
            {children}
          </div>
          <p className="mt-1 text-[11px] text-[#728099]">{description}</p>
        </div>
      </div>
    </article>
  );
}

function DetailRow({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  return (
    <div className="grid gap-1.5 border-b border-[#edf0f4] py-2.5 last:border-b-0 sm:grid-cols-[minmax(8.5rem,11rem)_minmax(0,1fr)] sm:gap-5">
      <dt className="text-[12px] text-[#748199]">{label}</dt>
      <dd className="min-w-0 text-[12px] font-medium text-[#34425d]">
        {children}
      </dd>
    </div>
  );
}

function StateNotice({
  detail,
  labels,
}: {
  readonly detail: RecurringDetail;
  readonly labels: RecurringDetailUiLabels;
}) {
  if (detail.reviewState === "NEEDS_REVIEW") {
    return (
      <section
        aria-labelledby="recurring-review-title"
        className="mt-4 rounded-[12px] border border-[#f1d7ab] bg-[#fffaf1] px-4 py-3.5">
        <h2
          className="text-[13px] font-semibold text-[#8c570d]"
          id="recurring-review-title">
          {labels.review.title}
        </h2>
        <p className="mt-1 text-[12px] leading-5 text-[#825f2a]">
          {labels.review.description}
        </p>
      </section>
    );
  }
  if (detail.status === "IGNORED") {
    return (
      <section
        aria-labelledby="recurring-ignored-title"
        className="mt-4 rounded-[12px] border border-[#dfe5ed] bg-[#f7f9fb] px-4 py-3.5">
        <h2
          className="text-[13px] font-semibold text-[#53627b]"
          id="recurring-ignored-title">
          {labels.ignored.title}
        </h2>
        <p className="mt-1 text-[12px] leading-5 text-[#66758e]">
          {labels.ignored.description}
        </p>
      </section>
    );
  }
  return null;
}

function OccurrenceList({
  entries,
  labels,
  locale,
  now,
  projected = false,
  timeZone,
  workspaceSlug,
}: {
  readonly entries:
    | readonly RecurringDetailOccurrence[]
    | readonly RecurringDetailHistory[];
  readonly labels: RecurringDetailUiLabels;
  readonly locale: string;
  readonly now: string;
  readonly projected?: boolean;
  readonly timeZone: string;
  readonly workspaceSlug?: string;
}) {
  if (!entries.length) {
    return (
      <p className="py-3 text-[12px] leading-5 text-[#738098]">
        {projected ? labels.noUpcoming : labels.noHistory}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-[#edf0f4]" role="list">
      {entries.map((entry) => {
        const history = "transaction" in entry ? entry : null;
        const amount = formatOverviewMoney(
          entry.amount.minor,
          entry.amount.currency,
          locale,
        );
        const content = (
          <>
            <span
              aria-hidden="true"
              className={
                projected
                  ? "grid size-6 shrink-0 place-items-center rounded-full bg-[#f1f5fb] text-[#6d7c95]"
                  : "grid size-6 shrink-0 place-items-center rounded-full bg-[#edf9f2] text-[#168151]"
              }>
              {projected ? (
                <FiClock className="size-3.5" />
              ) : (
                <FiCheckCircle className="size-3.5" />
              )}
            </span>
            <time
              className="min-w-0 flex-1 text-[12px] font-medium text-[#3b4962]"
              dateTime={entry.date}>
              {formatDate(entry.date, locale, timeZone)}
              {projected ? (
                <span className="mt-0.5 block text-[11px] font-normal text-[#77849a]">
                  {formatRelativeDay(entry.date, now, locale, timeZone)}
                </span>
              ) : null}
            </time>
            <span
              aria-label={
                projected ? `${labels.amountTypical}: ${amount}` : amount
              }
              className="shrink-0 text-[12px] font-semibold tabular-nums text-[#1c2943]">
              {projected ? `≈ ${amount}` : amount}
            </span>
          </>
        );
        return (
          <li
            className="py-2.5 first:pt-0 last:pb-0"
            key={history?.transaction.id ?? entry.date}>
            {history && workspaceSlug ? (
              <Link
                className="flex items-center gap-2.5 rounded-[7px] hover:bg-[#fbfcfe] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]"
                href={`/w/${workspaceSlug}/transactions/${history.transaction.id}`}>
                {content}
              </Link>
            ) : (
              <div className="flex items-center gap-2.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function OverviewContent({
  detail,
  labels,
  locale,
  now,
  timeZone,
  workspaceSlug,
}: {
  readonly detail: RecurringDetail;
  readonly labels: RecurringDetailUiLabels;
  readonly locale: string;
  readonly now: string;
  readonly timeZone: string;
  readonly workspaceSlug: string;
}) {
  const dashboardLabels = getDashboardLabels(
    locale.startsWith("fr") ? "fr" : locale.startsWith("de") ? "de" : "en",
  );
  const amount = formatOverviewMoney(
    detail.amount.minor,
    detail.amount.currency,
    locale,
  );
  const next = detail.nextOccurrenceAt;
  const history = detail.history.slice(0, 5);
  const upcoming = detail.upcomingOccurrences.slice(0, 5);
  return (
    <>
      <section
        aria-label={labels.details}
        className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          description={labels.amountTypical}
          icon={<FiTrendingDown className="size-4" />}
          title={labels.amount}
          tone="blue">
          {amount}
        </MetricCard>
        <MetricCard
          description={formatCadence(
            labels.cadenceTemplate,
            detail.cadenceDays,
          )}
          icon={<FiRepeat className="size-4" />}
          title={labels.frequency}
          tone="blue">
          {formatCadence(labels.cadenceTemplate, detail.cadenceDays)}
        </MetricCard>
        <MetricCard
          description={
            next
              ? formatRelativeDay(next, now, locale, timeZone)
              : labels.unavailable
          }
          icon={<FiCalendar className="size-4" />}
          title={labels.nextOccurrence}
          tone="green">
          {next ? (
            <time dateTime={next}>{formatDate(next, locale, timeZone)}</time>
          ) : (
            "—"
          )}
        </MetricCard>
        {detail.lastOccurrenceAt ? (
          <MetricCard
            description={formatRelativeDay(
              detail.lastOccurrenceAt,
              now,
              locale,
              timeZone,
            )}
            icon={<FiClock className="size-4" />}
            title={labels.lastOccurrence}
            tone="slate">
            <time dateTime={detail.lastOccurrenceAt}>
              {formatDate(detail.lastOccurrenceAt, locale, timeZone)}
            </time>
          </MetricCard>
        ) : null}
      </section>

      <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(290px,.92fr)]">
        <div className="space-y-4">
          <section
            aria-labelledby="recurring-details-title"
            className="rounded-[12px] border border-[#e3e8ef] bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-[9px] bg-[#f1f4f8] text-[#4e607c]">
                <FiCalendar className="size-4" />
              </span>
              <h2
                className="text-[15px] font-semibold tracking-[-0.02em] text-[#17243e]"
                id="recurring-details-title">
                {labels.details}
              </h2>
            </div>
            <dl className="mt-3">
              <DetailRow label={labels.name}>{detail.title}</DetailRow>
              <DetailRow label={labels.type}>
                {detail.direction === "INFLOW" ? labels.inflow : labels.outflow}
              </DetailRow>
              <DetailRow label={labels.status}>
                <RecurringStatusBadge
                  labels={getRecurringUiLabels(dashboardLabels)}
                  status={detail.status}
                />
              </DetailRow>
              <DetailRow label={labels.frequency}>
                {formatCadence(labels.cadenceTemplate, detail.cadenceDays)}
              </DetailRow>
              <DetailRow label={labels.amount}>
                <span>{amount}</span>
                <span className="ml-2 text-[#728099]">
                  {labels.amountTypical}
                </span>
              </DetailRow>
              {detail.account ? (
                <DetailRow label={labels.account}>
                  <Link
                    className="rounded-[5px] text-[#245ec4] hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]"
                    href={`/w/${workspaceSlug}/accounts/${detail.account.id}`}>
                    {detail.account.name}
                  </Link>
                </DetailRow>
              ) : null}
              {detail.category ? (
                <DetailRow label={labels.category}>
                  {formatSystemCategory(dashboardLabels, detail.category)}
                </DetailRow>
              ) : null}
              {detail.merchant ? (
                <DetailRow label={labels.merchant}>
                  {detail.merchant.name}
                </DetailRow>
              ) : null}
              <DetailRow label={labels.startDate}>
                <time dateTime={detail.startedAt}>
                  {formatDate(detail.startedAt, locale, timeZone)}
                </time>
              </DetailRow>
              {next ? (
                <DetailRow label={labels.nextOccurrence}>
                  <time dateTime={next}>
                    {formatDate(next, locale, timeZone)}
                  </time>
                </DetailRow>
              ) : null}
              {detail.lastOccurrenceAt ? (
                <DetailRow label={labels.lastOccurrence}>
                  <time dateTime={detail.lastOccurrenceAt}>
                    {formatDate(detail.lastOccurrenceAt, locale, timeZone)}
                  </time>
                </DetailRow>
              ) : null}
              <DetailRow label={labels.source}>
                {detail.origin === "MANUAL" ? labels.origin.manual : labels.origin.deterministic}
              </DetailRow>
            </dl>
          </section>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-5">
          <section
            aria-labelledby="recurring-upcoming-title"
            className="rounded-[12px] border border-[#e3e8ef] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid size-8 place-items-center rounded-[9px] bg-[#eef4ff] text-[#2e70e7]">
                  <FiCalendar className="size-4" />
                </span>
                <h2
                  className="text-[14px] font-semibold tracking-[-0.02em] text-[#17243e]"
                  id="recurring-upcoming-title">
                  {labels.upcomingOccurrences}
                </h2>
              </div>
              {detail.upcomingOccurrences.length > upcoming.length ? (
                <Link
                  className="rounded-[7px] bg-[#f4f7fc] px-2.5 py-1.5 text-[11px] font-semibold text-[#255fc4] hover:bg-[#edf3fc] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]"
                  href={detailTabHref(workspaceSlug, detail.id, "upcoming")}>
                  {labels.viewAll}
                </Link>
              ) : null}
            </div>
            <div className="mt-4">
              <OccurrenceList
                entries={upcoming}
                labels={labels}
                locale={locale}
                now={now}
                projected
                timeZone={timeZone}
              />
            </div>
          </section>
          <section
            aria-labelledby="recurring-history-title"
            className="rounded-[12px] border border-[#e3e8ef] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid size-8 place-items-center rounded-[9px] bg-[#edf9f2] text-[#168151]">
                  <FiCheckCircle className="size-4" />
                </span>
                <h2
                  className="text-[14px] font-semibold tracking-[-0.02em] text-[#17243e]"
                  id="recurring-history-title">
                  {labels.recentHistory}
                </h2>
              </div>
              {detail.history.length > history.length ? (
                <Link
                  className="rounded-[7px] bg-[#f4f7fc] px-2.5 py-1.5 text-[11px] font-semibold text-[#255fc4] hover:bg-[#edf3fc] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]"
                  href={detailTabHref(workspaceSlug, detail.id, "history")}>
                  {labels.viewAll}
                </Link>
              ) : null}
            </div>
            <div className="mt-4">
              <OccurrenceList
                entries={history}
                labels={labels}
                locale={locale}
                now={now}
                timeZone={timeZone}
                workspaceSlug={workspaceSlug}
              />
            </div>
          </section>
          <section
            aria-labelledby="recurring-about-title"
            className="rounded-[12px] border border-[#cfe0fb] bg-[#f5f9ff] p-4 sm:p-5">
            <div className="flex gap-3">
              <FiInfo
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-[#2469df]"
              />
              <div>
                <h2
                  className="text-[13px] font-semibold text-[#1d3d76]"
                  id="recurring-about-title">
                  {labels.about.title}
                </h2>
                <p className="mt-1.5 text-[12px] leading-5 text-[#4d6490]">
                  {labels.about.description}
                </p>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}

function HistoryTab({
  detail,
  labels,
  locale,
  now,
  timeZone,
  workspaceSlug,
}: {
  readonly detail: RecurringDetail;
  readonly labels: RecurringDetailUiLabels;
  readonly locale: string;
  readonly now: string;
  readonly timeZone: string;
  readonly workspaceSlug: string;
}) {
  return (
    <section
      aria-labelledby="recurring-history-tab-title"
      className="mt-4 rounded-[12px] border border-[#e3e8ef] bg-white p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <FiCheckCircle aria-hidden="true" className="size-4 text-[#168151]" />
        <h2
          className="text-[15px] font-semibold text-[#17243e]"
          id="recurring-history-tab-title">
          {labels.recentHistory}
        </h2>
      </div>
      <div className="mt-4">
        <OccurrenceList
          entries={detail.history}
          labels={labels}
          locale={locale}
          now={now}
          timeZone={timeZone}
          workspaceSlug={workspaceSlug}
        />
      </div>
    </section>
  );
}

function UpcomingTab({
  detail,
  labels,
  locale,
  now,
  timeZone,
}: {
  readonly detail: RecurringDetail;
  readonly labels: RecurringDetailUiLabels;
  readonly locale: string;
  readonly now: string;
  readonly timeZone: string;
}) {
  return (
    <section
      aria-labelledby="recurring-upcoming-tab-title"
      className="mt-4 rounded-[12px] border border-[#e3e8ef] bg-white p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <FiCalendar aria-hidden="true" className="size-4 text-[#2e70e7]" />
        <h2
          className="text-[15px] font-semibold text-[#17243e]"
          id="recurring-upcoming-tab-title">
          {labels.upcomingOccurrences}
        </h2>
      </div>
      <div className="mt-4">
        <OccurrenceList
          entries={detail.upcomingOccurrences}
          labels={labels}
          locale={locale}
          now={now}
          projected
          timeZone={timeZone}
        />
      </div>
    </section>
  );
}

function RelatedTransactionsTab({
  detail,
  language,
  labels,
  locale,
  now,
  timeZone,
  workspaceSlug,
}: {
  readonly detail: RecurringDetail;
  readonly language: "en" | "fr" | "de";
  readonly labels: RecurringDetailUiLabels;
  readonly locale: string;
  readonly now: string;
  readonly timeZone: string;
  readonly workspaceSlug: string;
}) {
  return (
    <section aria-labelledby="recurring-related-tab-title" className="mt-4">
      <div className="mb-3 flex items-center gap-2.5">
        <FiTag aria-hidden="true" className="size-4 text-[#60708b]" />
        <h2
          className="text-[15px] font-semibold text-[#17243e]"
          id="recurring-related-tab-title">
          {labels.tabs.transactions}
        </h2>
      </div>
      {detail.relatedTransactions.length ? (
        <>
          <TransactionTable
            getDetailHref={(transaction) =>
              `/w/${workspaceSlug}/transactions/${transaction.id}`
            }
            labels={getTransactionUiLabels(getDashboardLabels(language))}
            locale={locale}
            now={now}
            showActions={false}
            timeZone={timeZone}
            transactions={detail.relatedTransactions}
          />
          <div className="space-y-3 md:hidden">
            {detail.relatedTransactions.map((transaction) => (
              <TransactionMobileCard
                detailHref={`/w/${workspaceSlug}/transactions/${transaction.id}`}
                key={transaction.id}
                labels={getTransactionUiLabels(getDashboardLabels(language))}
                locale={locale}
                now={now}
                showActions={false}
                timeZone={timeZone}
                transaction={transaction}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-[12px] border border-[#e3e8ef] bg-white p-5 text-[13px] text-[#71809a]">
          {labels.noRelated}
        </div>
      )}
    </section>
  );
}

export function RecurringDetailView({
  detail,
  labels,
  language,
  locale,
  now,
  selectedTab,
  timeZone,
  workspaceId,
  workspaceSlug,
}: {
  readonly detail: RecurringDetail;
  readonly labels: RecurringDetailUiLabels;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly now: string;
  readonly selectedTab: RecurringDetailTab;
  readonly timeZone: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const dashboardLabels = getDashboardLabels(language);
  const subtitle = detail.category
    ? formatSystemCategory(dashboardLabels, detail.category)
    : detail.origin === "MANUAL" ? labels.origin.manual : labels.origin.deterministic;
  const tabContent =
    selectedTab === "overview" ? (
      <OverviewContent
        detail={detail}
        labels={labels}
        locale={locale}
        now={now}
        timeZone={timeZone}
        workspaceSlug={workspaceSlug}
      />
    ) : selectedTab === "history" ? (
      <HistoryTab
        detail={detail}
        labels={labels}
        locale={locale}
        now={now}
        timeZone={timeZone}
        workspaceSlug={workspaceSlug}
      />
    ) : selectedTab === "upcoming" ? (
      <UpcomingTab
        detail={detail}
        labels={labels}
        locale={locale}
        now={now}
        timeZone={timeZone}
      />
    ) : (
      <RelatedTransactionsTab
        detail={detail}
        labels={labels}
        language={language}
        locale={locale}
        now={now}
        timeZone={timeZone}
        workspaceSlug={workspaceSlug}
      />
    );

  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <nav
        aria-label={labels.back}
        className="flex min-w-0 items-center gap-2 text-[12px] text-[#66758f]">
        <Link
          className="inline-flex items-center gap-1.5 rounded-[6px] hover:text-[#245ec4] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]"
          href={`/w/${workspaceSlug}/recurring`}>
          <FiArrowLeft aria-hidden="true" className="size-3.5" />
          {labels.back}
        </Link>
        <span aria-hidden="true" className="text-[#bac3d1]">
          /
        </span>
        <span className="truncate font-medium text-[#485872]">
          {detail.title}
        </span>
      </nav>
      <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <TransactionIcon
            categoryKey={detail.category?.systemKey}
            categoryName={detail.category?.name}
            merchantName={detail.title}
            size="md"
            transactionKind={detail.direction === "INFLOW" ? "INCOME" : "EXPENSE"}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-[26px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[29px]">
                {detail.title}
              </h1>
              <RecurringStatusBadge
                labels={getRecurringUiLabels(dashboardLabels)}
                status={detail.status}
              />
            </div>
            <p className="mt-1 truncate text-[13px] text-[#71809a]">
              {subtitle}
            </p>
          </div>
        </div>
        <RecurringAskPace
          language={language}
          locale={locale}
          timeZone={timeZone}
          workspaceId={workspaceId}
        />
      </header>
      <StateNotice detail={detail} labels={labels} />
      <div className="mt-5">
        <RecurringDetailTabs labels={labels} selectedTab={selectedTab}>
          {tabContent}
        </RecurringDetailTabs>
      </div>
    </main>
  );
}
