"use client";

import {
  FiAlertCircle,
  FiArrowDownRight,
  FiCalendar,
  FiClock,
  FiCreditCard,
  FiRepeat,
} from "react-icons/fi";

import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import { formatSystemCategory } from "@/modules/transactions/ui/transaction-detail-labels";

import type {
  RecurringCurrencyTotal,
  RecurringOverview,
  RecurringOverviewItem,
} from "../../domain/recurring-overview";
import type { RecurringUiLabels } from "../recurring-ui-labels";
import { RecurringAskPace } from "../components/recurring-ask-pace";
import { RecurringEmptyState } from "../components/recurring-empty-state";
import { RecurringFilterLoadingProvider, RecurringFilterLoadingSurface } from "../components/recurring-filter-loading";
import { RecurringFilterTabs } from "../components/recurring-filter-tabs";

const statusClasses = {
  CANDIDATE: "border-[#f2dfba] bg-[#fff9ee] text-[#9a6700]",
  CONFIRMED: "border-[#cfeeda] bg-[#effaf2] text-[#167345]",
  IGNORED: "border-[#e0e5ec] bg-[#f5f7f9] text-[#64748b]",
} as const;

function formatDisplayName(value: string, locale: string): string {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase(locale));
}

function formatExpectedDate(value: string, locale: string, timeZone: string, long = false): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: long ? "long" : "short",
    ...(long ? { year: "numeric" as const } : {}),
    timeZone,
  }).format(new Date(value));
}

function formatCadence(template: string, days: number): string {
  return template.replaceAll("{days}", String(days));
}

function CurrencyTotals({
  totals,
  locale,
}: {
  readonly totals: readonly RecurringCurrencyTotal[];
  readonly locale: string;
}) {
  if (!totals.length) return <span className="text-[18px] font-semibold tracking-[-0.03em] text-[#8591a5]">—</span>;
  return (
    <div className="space-y-1">
      {totals.map((total) => (
        <p className="truncate text-[17px] font-semibold tracking-[-0.03em] text-[#14203a]" key={total.currency}>
          {formatOverviewMoney(total.amountMinor, total.currency, locale)}
        </p>
      ))}
    </div>
  );
}

function SummaryMetric({
  children,
  description,
  icon,
  title,
  tone,
}: {
  readonly children: React.ReactNode;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly tone: "blue" | "green" | "amber";
}) {
  const toneClass = tone === "blue"
    ? "bg-[#edf4ff] text-[#2867e8]"
    : tone === "green"
      ? "bg-[#effaf2] text-[#198754]"
      : "bg-[#fff7eb] text-[#b7791f]";
  return (
    <section className="min-w-0 rounded-[12px] border border-[#e5eaf1] bg-white p-4 sm:p-4.5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${toneClass}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[12px] font-medium text-[#66758d]">{title}</h2>
          <div className="mt-1.5">{children}</div>
          <p className="mt-1.5 text-[11px] leading-4 text-[#7b879b]">{description}</p>
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ item, labels }: { readonly item: RecurringOverviewItem; readonly labels: RecurringUiLabels }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses[item.status]}`}>
      {labels.status[item.status]}
    </span>
  );
}

function RecurringItemRow({
  item,
  labels,
  dashboardLabels,
  locale,
  timeZone,
}: {
  readonly item: RecurringOverviewItem;
  readonly labels: RecurringUiLabels;
  readonly dashboardLabels: ReturnType<typeof getDashboardLabels>;
  readonly locale: string;
  readonly timeZone: string;
}) {
  const displayName = formatDisplayName(item.merchantName, locale);
  const amount = formatOverviewMoney(item.typicalAmountMinor, item.currency, locale);
  const expected = item.nextExpectedAt
    ? formatExpectedDate(item.nextExpectedAt, locale, timeZone)
    : null;
  const expectedLong = item.nextExpectedAt
    ? formatExpectedDate(item.nextExpectedAt, locale, timeZone, true)
    : null;

  return (
    <article
      aria-label={`${displayName}, ${amount}, ${labels.status[item.status]}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(13rem,1.75fr)_minmax(7rem,.85fr)_minmax(8rem,.9fr)_minmax(7.5rem,.85fr)_minmax(7rem,.75fr)] lg:items-center lg:gap-4"
      role="listitem"
    >
      <div className="flex min-w-0 items-center gap-3">
        <TransactionIcon
          categoryKey={item.category?.systemKey}
          categoryName={item.category?.name}
          merchantName={displayName}
          size="md"
          transactionKind="EXPENSE"
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[#1d2941]">{displayName}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[#728099]">
            <span>{labels.amountTypical}</span>
            {item.category ? <><span aria-hidden="true">·</span><span>{formatSystemCategory(dashboardLabels, item.category)}</span></> : null}
          </div>
        </div>
      </div>
      <div className="justify-self-end lg:hidden"><StatusBadge item={item} labels={labels} /></div>

      <div className="min-w-0 lg:justify-self-start">
        <p className="text-[13px] font-semibold text-[#1d2941]">{amount}</p>
        <p className="mt-0.5 text-[11px] text-[#728099]">{formatCadence(labels.cadenceEveryDays, item.cadenceDays)}</p>
      </div>

      <div className="min-w-0">
        <p className="text-[11px] font-medium text-[#728099] lg:hidden">{labels.nextExpected}</p>
        {expected ? (
          <time className="mt-0.5 block text-[12px] font-medium text-[#42516a] lg:mt-0" dateTime={item.nextExpectedAt!} title={expectedLong ?? undefined}>
            {expected}
          </time>
        ) : (
          <p className="mt-0.5 text-[12px] text-[#8b97aa] lg:mt-0">—</p>
        )}
      </div>

      <div className="min-w-0">
        {item.account ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-[#53627b]">
            <FiCreditCard aria-hidden="true" className="size-3.5 shrink-0 text-[#8290a5] lg:hidden" />
            <span className="truncate">{item.account.name}</span>
          </div>
        ) : null}
      </div>
      <div className="hidden lg:block"><StatusBadge item={item} labels={labels} /></div>
    </article>
  );
}

function RecurringItemsList({
  overview,
  labels,
  dashboardLabels,
  locale,
  timeZone,
}: {
  readonly overview: RecurringOverview;
  readonly labels: RecurringUiLabels;
  readonly dashboardLabels: ReturnType<typeof getDashboardLabels>;
  readonly locale: string;
  readonly timeZone: string;
}) {
  if (!overview.items.length) return <RecurringEmptyState filter={overview.filter} labels={labels} />;
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#e4e9f0] bg-white" role="list">
      {overview.items.map((item, index) => (
        <div className={index ? "border-t border-[#edf0f4]" : undefined} key={item.id}>
          <RecurringItemRow dashboardLabels={dashboardLabels} item={item} labels={labels} locale={locale} timeZone={timeZone} />
        </div>
      ))}
    </div>
  );
}

function UpcomingPanel({
  overview,
  labels,
  locale,
  timeZone,
}: {
  readonly overview: RecurringOverview;
  readonly labels: RecurringUiLabels;
  readonly locale: string;
  readonly timeZone: string;
}) {
  return (
    <aside aria-labelledby="recurring-upcoming-title" className="rounded-[12px] border border-[#e4e9f0] bg-white p-4 sm:p-5 xl:sticky xl:top-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#eef4ff] text-[#2867e8]">
          <FiCalendar className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#1b2842]" id="recurring-upcoming-title">
            {labels.upcoming.title}
          </h2>
          <p className="mt-0.5 text-[11px] leading-4 text-[#71809a]">{labels.upcoming.description}</p>
        </div>
      </div>
      {overview.upcoming.length ? (
        <div className="mt-4 divide-y divide-[#edf0f4]">
          {overview.upcoming.map((item) => {
            const title = formatDisplayName(item.merchantName, locale);
            return (
              <div className="flex items-center gap-2.5 py-3 first:pt-0 last:pb-0" key={item.id}>
                <TransactionIcon
                  categoryKey={item.category?.systemKey}
                  categoryName={item.category?.name}
                  merchantName={title}
                  size="sm"
                  transactionKind="EXPENSE"
                />
                <div className="min-w-0 flex-1">
                  <time className="block text-[11px] font-medium text-[#71809a]" dateTime={item.nextExpectedAt!}>
                    {formatExpectedDate(item.nextExpectedAt!, locale, timeZone)}
                  </time>
                  <p className="mt-0.5 truncate text-[12px] font-medium text-[#34425c]">{title}</p>
                </div>
                <p className="shrink-0 text-[12px] font-semibold text-[#1d2941]">
                  {formatOverviewMoney(item.typicalAmountMinor, item.currency, locale)}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 text-[12px] leading-5 text-[#71809a]">{labels.upcoming.empty}</p>
      )}
      <p className="mt-5 border-t border-[#edf0f4] pt-3 text-[11px] leading-4 text-[#7c889b]">{labels.projectionNotice}</p>
    </aside>
  );
}

export function RecurringOverviewView({
  language,
  labels,
  locale,
  overview,
  timeZone,
  workspaceId,
}: {
  readonly language: "en" | "fr" | "de";
  readonly labels: RecurringUiLabels;
  readonly locale: string;
  readonly overview: RecurringOverview;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  return (
    <RecurringFilterLoadingProvider selectedFilter={overview.filter}>
      <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
          <div>
            <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">{labels.title}</h1>
            <p className="mt-1 text-[13px] text-[#71809a]">{labels.subtitle}</p>
          </div>
          <RecurringAskPace language={language} locale={locale} timeZone={timeZone} workspaceId={workspaceId} />
        </header>

        <section aria-label={labels.title} className="grid gap-3 sm:grid-cols-3">
          <SummaryMetric
            description={labels.summary.confirmedOutflowsDescription}
            icon={<FiArrowDownRight className="size-[18px]" />}
            title={labels.summary.confirmedOutflows}
            tone="blue"
          >
            <CurrencyTotals locale={locale} totals={overview.confirmedOutflows} />
          </SummaryMetric>
          <SummaryMetric
            description={labels.summary.expectedUpcomingDescription}
            icon={<FiClock className="size-[18px]" />}
            title={labels.summary.expectedUpcoming}
            tone="green"
          >
            <CurrencyTotals locale={locale} totals={overview.expectedUpcoming} />
          </SummaryMetric>
          <SummaryMetric
            description={`${overview.counts.CONFIRMED} ${labels.summary.confirmed.toLocaleLowerCase(locale)}`}
            icon={<FiAlertCircle className="size-[18px]" />}
            title={labels.summary.detected}
            tone="amber"
          >
            <p className="text-[22px] font-semibold tracking-[-0.04em] text-[#14203a]">
              {overview.counts.ALL}
              {overview.counts.NEEDS_REVIEW ? <span className="ml-2 text-[12px] font-medium tracking-normal text-[#a36b13]">{overview.counts.NEEDS_REVIEW} {labels.summary.needsReview.toLocaleLowerCase(locale)}</span> : null}
            </p>
          </SummaryMetric>
        </section>

        <section className="mt-7">
          <RecurringFilterTabs counts={overview.counts} labels={labels} />
          <RecurringFilterLoadingSurface label={labels.filterLoading}>
            <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]" id="recurring-results" role="tabpanel">
              <section aria-labelledby="recurring-items-title">
                <div className="mb-3 flex items-center gap-2">
                  <FiRepeat aria-hidden="true" className="size-4 text-[#60708b]" />
                  <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#1b2842]" id="recurring-items-title">{labels.listTitle}</h2>
                </div>
                <RecurringItemsList dashboardLabels={getDashboardLabels(language)} labels={labels} locale={locale} overview={overview} timeZone={timeZone} />
              </section>
              {overview.counts.ALL ? <UpcomingPanel labels={labels} locale={locale} overview={overview} timeZone={timeZone} /> : null}
            </div>
          </RecurringFilterLoadingSurface>
        </section>
      </main>
    </RecurringFilterLoadingProvider>
  );
}
