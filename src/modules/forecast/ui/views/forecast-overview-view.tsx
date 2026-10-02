"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowDown,
  FiArrowLeft,
  FiArrowRight,
  FiArrowUp,
  FiCalendar,
  FiChevronRight,
  FiCreditCard,
  FiMinus,
  FiRepeat,
  FiTrendingDown,
  FiTrendingUp,
} from "react-icons/fi";

import { FilterLoadingSurface } from "@/components/pace/shared/filter-loading-surface";
import type {
  CurrencyForecast,
  ForecastAccountProjection,
  ForecastHorizonDays,
  WorkspaceForecast,
} from "@/modules/forecast/domain/forecast";
import {
  defaultForecastInspectionIndex,
  forecastInsights,
  type ForecastInsight,
} from "@/modules/forecast/domain/forecast-presentation";
import { ForecastAccountFilter } from "@/modules/forecast/ui/components/forecast-account-filter";
import { ForecastBalanceChart } from "@/modules/forecast/ui/components/forecast-balance-chart";
import { ForecastHorizonSelect } from "@/modules/forecast/ui/components/forecast-horizon-select";
import { ForecastPointDialog } from "@/modules/forecast/ui/components/forecast-point-dialog";
import { ForecastRecurringRow } from "@/modules/forecast/ui/components/forecast-recurring-row";
import { ForecastEmptyState } from "@/modules/forecast/ui/components/forecast-state-panels";
import {
  countLabel,
  fillLabel,
  formatBalanceDelta,
  formatForecastLongDate,
  formatForecastMonth,
  formatSignedMoney,
  horizonLabel,
  type ForecastLabels,
} from "@/modules/forecast/ui/forecast-format";
import { getAccountTypeMetadata } from "@/modules/ledger/ui/components/account-type-metadata";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import type { PlansUiLabels } from "@/modules/plans/ui/plans-ui-labels";
import { cn } from "@/lib/utils";

const CARD = "rounded-[14px] border border-[#e5eaf1] bg-white";

const ACCOUNT_TINTS: Record<ForecastAccountProjection["type"], string> = {
  CHECKING: "bg-[#eaf2ff] text-[#1769e8]",
  SAVINGS: "bg-[#fdecee] text-[#e14958]",
  MOBILE_MONEY: "bg-[#fff1e5] text-[#e8730c]",
  CASH: "bg-[#e9f3ff] text-[#2f6fd6]",
  CREDIT_CARD: "bg-[#f1ecff] text-[#7c4ddb]",
  OTHER: "bg-[#eef2f7] text-[#53627b]",
};

export function ForecastOverviewView({
  forecast,
  labels,
  locale,
  workspaceSlug,
}: {
  forecast: WorkspaceForecast;
  labels: PlansUiLabels;
  locale: string;
  workspaceSlug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const copy = labels.forecast;
  const [currencyCode, setCurrencyCode] = useState(
    forecast.currencies[0]?.currency ?? "",
  );
  const currency =
    forecast.currencies.find((item) => item.currency === currencyCode) ??
    forecast.currencies[0];
  const selectionKey = `${currency?.currency}:${forecast.horizonDays}:${forecast.selectedAccountId}`;
  const [selection, setSelection] = useState<{
    key: string;
    index: number;
  } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const selected =
    selection?.key === selectionKey
      ? selection.index
      : currency
        ? defaultForecastInspectionIndex(currency)
        : 0;
  const itemsById = useMemo(
    () => new Map(forecast.recurringItems.map((item) => [item.id, item])),
    [forecast.recurringItems],
  );

  const navigate = (update: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams.toString());
    update(next);
    startTransition(() =>
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
        scroll: false,
      }),
    );
  };
  const selectHorizon = (horizon: ForecastHorizonDays) =>
    navigate((params) => params.set("horizon", String(horizon)));
  const selectAccount = (accountId: string) =>
    navigate((params) =>
      accountId ? params.set("account", accountId) : params.delete("account"),
    );
  const inspect = (index: number) => {
    setSelection({ key: selectionKey, index });
    setDetailOpen(true);
  };

  const hasEvents = forecast.currencies.some((item) => item.events.length);

  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-355">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Link
              className="inline-flex items-center gap-2 text-[13px] text-[#526788] hover:text-[#14213c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              href={`/w/${workspaceSlug}/plans`}
            >
              <FiArrowLeft aria-hidden />
              {copy.back}
            </Link>
            <h1 className="mt-4 text-[28px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">
              {copy.title}
            </h1>
            <p className="mt-1 max-w-xl text-[13px] leading-5 text-[#71809a]">
              {copy.subtitle}
            </p>
          </div>
          {hasEvents ? (
            <div className="flex flex-wrap items-center gap-2">
              {forecast.currencies.length > 1 ? (
                <div
                  aria-label={copy.currency}
                  className="inline-flex h-10 rounded-[10px] border border-[#d8e0eb] bg-white p-1"
                  role="radiogroup"
                >
                  {forecast.currencies.map((item) => (
                    <button
                      aria-checked={item.currency === currency?.currency}
                      className={cn(
                        "rounded-[7px] px-3 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1769e8]",
                        item.currency === currency?.currency
                          ? "bg-[#eaf2ff] text-[#1769e8]"
                          : "text-[#60708b] hover:text-[#1769e8]",
                      )}
                      key={item.currency}
                      onClick={() => setCurrencyCode(item.currency)}
                      role="radio"
                      type="button"
                    >
                      {item.currency}
                    </button>
                  ))}
                </div>
              ) : null}
              <ForecastHorizonSelect
                label={copy.horizonSelect}
                onChange={selectHorizon}
                optionLabel={(horizon) => horizonLabel(copy, horizon)}
                value={forecast.horizonDays}
              />
              <button
                aria-label={copy.inspectDate}
                className="grid size-10 place-items-center rounded-[10px] border border-[#d8e0eb] bg-white text-[#40577d] shadow-[0_1px_2px_rgb(20_44_84/5%)] transition-colors hover:border-[#9eb4d3] hover:text-[#1769e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769e8]"
                onClick={() => setDetailOpen(true)}
                type="button"
              >
                <FiCalendar aria-hidden className="size-4" />
              </button>
            </div>
          ) : null}
        </header>

        {!hasEvents || !currency ? (
          <div className="mt-6">
            <ForecastEmptyState labels={copy} workspaceSlug={workspaceSlug} />
          </div>
        ) : (
          <FilterLoadingSurface isLoading={pending} label={copy.loading}>
            <ForecastContent
              copy={copy}
              currency={currency}
              forecast={forecast}
              itemsById={itemsById}
              locale={locale}
              onInspect={inspect}
              onSelectAccount={selectAccount}
              selected={selected}
              workspaceSlug={workspaceSlug}
            />
            <ForecastPointDialog
              currency={currency}
              horizonDays={forecast.horizonDays}
              itemsById={itemsById}
              labels={copy}
              locale={locale}
              onOpenChange={setDetailOpen}
              onSelect={(index) => setSelection({ key: selectionKey, index })}
              open={detailOpen}
              selected={selected}
              workspaceSlug={workspaceSlug}
            />
          </FilterLoadingSurface>
        )}
      </div>
    </main>
  );
}

function ForecastContent({
  copy,
  currency,
  forecast,
  itemsById,
  locale,
  onInspect,
  onSelectAccount,
  selected,
  workspaceSlug,
}: {
  copy: ForecastLabels;
  currency: CurrencyForecast;
  forecast: WorkspaceForecast;
  itemsById: ReadonlyMap<string, WorkspaceForecast["recurringItems"][number]>;
  locale: string;
  onInspect: (index: number) => void;
  onSelectAccount: (accountId: string) => void;
  selected: number;
  workspaceSlug: string;
}) {
  const code = currency.currency;
  const end = currency.points.at(-1)!;
  const opening = BigInt(currency.openingBalance.nominalMinor);
  const projected = BigInt(end.projectedClosingBalance.nominalMinor);
  const byDate = fillLabel(copy.byDate, {
    date: formatForecastLongDate(end.date, locale),
  });
  const period = horizonLabel(copy, forecast.horizonDays);
  const money = (minor: bigint | string) =>
    formatOverviewMoney(minor, code, locale);
  const currencyItems = forecast.recurringItems.filter(
    (item) => item.currency === code,
  );
  const incomeCount = currencyItems.filter(
    (item) => item.direction === "INFLOW",
  ).length;
  const expenseCount = currencyItems.length - incomeCount;
  const recurringSplit = [
    countLabel(copy, expenseCount, "expenseOne", "expenseOther"),
    countLabel(copy, incomeCount, "incomeOne", "incomeOther"),
  ].join(" · ");

  return (
    <div className="mt-6 space-y-4">
      <section className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-[14px] border border-[#d9e6fb] bg-[#f1f6ff] p-4">
          <MetricBody
            icon={FiCreditCard}
            iconClassName="bg-[#1769e8] text-white"
            label={copy.projectedBalance}
            value={money(projected)}
          >
            <p
              className={cn(
                "flex items-center gap-1 text-[12px] font-semibold",
                projected - opening >= 0n ? "text-[#14945a]" : "text-[#e14958]",
              )}
            >
              {projected - opening >= 0n ? (
                <FiArrowUp aria-hidden className="size-3" />
              ) : (
                <FiArrowDown aria-hidden className="size-3" />
              )}
              {formatBalanceDelta(projected - opening, code, locale)}
            </p>
            <p className="mt-0.5 text-[11px] text-[#71809a]">{byDate}</p>
          </MetricBody>
        </div>
        <div className={cn(CARD, "hidden p-4 lg:block")}>
          <MetricBody
            icon={FiTrendingUp}
            iconClassName="bg-[#e8f7ef] text-[#14945a]"
            label={copy.totalInflows}
            value={money(currency.totalInflows.nominalMinor)}
          >
            <p className="text-[11px] text-[#71809a]">{period}</p>
          </MetricBody>
        </div>
        <div className={cn(CARD, "hidden p-4 lg:block")}>
          <MetricBody
            icon={FiTrendingDown}
            iconClassName="bg-[#fdecee] text-[#e14958]"
            label={copy.totalOutflows}
            value={formatSignedMoney(
              currency.totalOutflows.nominalMinor,
              code,
              locale,
              "-",
            )}
          >
            <p className="text-[11px] text-[#71809a]">{period}</p>
          </MetricBody>
        </div>
        <div className={cn(CARD, "hidden p-4 lg:block")}>
          <MetricBody
            icon={FiRepeat}
            iconClassName="bg-[#f1ecff] text-[#7c4ddb]"
            label={copy.recurringItems}
            value={String(currencyItems.length)}
          >
            <p className="text-[11px] leading-4 text-[#71809a]">
              {recurringSplit}
            </p>
          </MetricBody>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className={cn(CARD, "min-w-0 p-4 sm:p-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#18243b]">
              {copy.balanceOverTime}
            </h2>
            {forecast.accounts.length > 1 ? (
              <ForecastAccountFilter
                accounts={forecast.accounts}
                allAccountsLabel={copy.allAccounts}
                label={copy.accountFilter}
                onChange={onSelectAccount}
                value={forecast.selectedAccountId}
              />
            ) : null}
          </div>
          <div className="mt-4">
            <ForecastBalanceChart
              currency={currency}
              horizonDays={forecast.horizonDays}
              labels={copy}
              locale={locale}
              onSelect={onInspect}
              plotClassName="h-60 sm:h-72"
              selected={selected}
            />
          </div>
        </section>

        <nav
          aria-label={copy.title}
          className={cn(CARD, "divide-y divide-[#edf0f4] lg:hidden")}
        >
          <SummaryLink
            href={`/w/${workspaceSlug}/recurring`}
            icon={FiTrendingUp}
            iconClassName="bg-[#e8f7ef] text-[#14945a]"
            label={copy.incomes}
            value={money(currency.totalInflows.nominalMinor)}
          />
          <SummaryLink
            href={`/w/${workspaceSlug}/recurring`}
            icon={FiTrendingDown}
            iconClassName="bg-[#fdecee] text-[#e14958]"
            label={copy.expenses}
            value={formatSignedMoney(
              currency.totalOutflows.nominalMinor,
              code,
              locale,
              "-",
            )}
          />
          <SummaryLink
            href={`/w/${workspaceSlug}/recurring`}
            icon={FiRepeat}
            iconClassName="bg-[#f1ecff] text-[#7c4ddb]"
            label={copy.recurringItems}
            value={String(currencyItems.length)}
          />
        </nav>

        <section className={cn(CARD, "p-4 sm:p-5")}>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#18243b]">
            {copy.balanceBreakdown}{" "}
            <span className="text-[12px] font-normal text-[#71809a]">
              ({period})
            </span>
          </h2>
          <dl className="mt-4 space-y-3 text-[13px]">
            <BreakdownRow
              icon={FiCreditCard}
              iconClassName="bg-[#e8f7ef] text-[#14945a]"
              label={copy.startingBalance}
              value={money(opening)}
              valueClassName="text-[#18243b]"
            />
            <BreakdownRow
              icon={FiArrowUp}
              iconClassName="bg-[#e8f7ef] text-[#14945a]"
              label={copy.incomes}
              value={formatSignedMoney(
                currency.totalInflows.nominalMinor,
                code,
                locale,
                "+",
              )}
              valueClassName="text-[#14945a]"
            />
            <BreakdownRow
              icon={FiArrowDown}
              iconClassName="bg-[#fdecee] text-[#e14958]"
              label={copy.expenses}
              value={formatSignedMoney(
                currency.totalOutflows.nominalMinor,
                code,
                locale,
                "-",
              )}
              valueClassName="text-[#e14958]"
            />
          </dl>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#edf0f4] pt-4">
            <span className="text-[13px] font-semibold text-[#18243b]">
              {copy.projectedBalance}
            </span>
            <span className="rounded-[8px] bg-[#eef4ff] px-2.5 py-1.5 text-[14px] font-semibold text-[#101a35] tabular-nums">
              {money(projected)}
            </span>
          </div>

          <h2 className="mt-6 border-t border-[#edf0f4] pt-5 text-[15px] font-semibold tracking-[-0.02em] text-[#18243b]">
            {copy.keyInsights}
          </h2>
          <ul className="mt-3 space-y-4">
            {forecastInsights(currency).map((insight) => (
              <InsightItem
                byDate={byDate}
                copy={copy}
                insight={insight}
                key={insight.kind}
                locale={locale}
                money={money}
              />
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cn(CARD, "min-w-0 p-4 sm:p-5")}>
          <SectionHeader
            href={`/w/${workspaceSlug}/recurring`}
            title={copy.upcoming}
            viewAll={copy.viewAll}
          />
          {currency.events.length ? (
            <div className="mt-2 divide-y divide-[#edf0f4]">
              {currency.events.slice(0, 4).map((event, index) => (
                <ForecastRecurringRow
                  currency={code}
                  event={event}
                  item={itemsById.get(event.recurringId)}
                  key={`${event.recurringId}-${event.occursAt}-${index}`}
                  labels={copy}
                  locale={locale}
                  workspaceSlug={workspaceSlug}
                />
              ))}
            </div>
          ) : (
            <EmptyLine>{copy.noUpcoming}</EmptyLine>
          )}
        </section>

        <section className={cn(CARD, "min-w-0 p-4 sm:p-5")}>
          <SectionHeader
            href={`/w/${workspaceSlug}/accounts`}
            subtitle={fillLabel(copy.accountsSubtitle, { date: byDate })}
            title={copy.accountsTitle}
            viewAll={copy.viewAll}
          />
          {forecast.accountProjections.length ? (
            <div className="mt-2 divide-y divide-[#edf0f4]">
              {forecast.accountProjections.slice(0, 4).map((account) => (
                <AccountRow
                  account={account}
                  copy={copy}
                  key={account.id}
                  locale={locale}
                  workspaceSlug={workspaceSlug}
                />
              ))}
            </div>
          ) : (
            <EmptyLine>{copy.noAccounts}</EmptyLine>
          )}
        </section>
      </div>
    </div>
  );
}

function IconTile({
  className,
  icon: Icon,
  size = "md",
}: {
  className: string;
  icon: IconType;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        size === "md" ? "size-10 rounded-full" : "size-6 rounded-[7px]",
        className,
      )}
    >
      <Icon className={size === "md" ? "size-4.5" : "size-3.5"} />
    </span>
  );
}

function MetricBody({
  children,
  icon,
  iconClassName,
  label,
  value,
}: {
  children: ReactNode;
  icon: IconType;
  iconClassName: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <IconTile className={iconClassName} icon={icon} />
      <div className="min-w-0">
        <h2 className="text-[12px] font-medium text-[#53627b]">{label}</h2>
        <p className="mt-1 truncate text-[20px] font-semibold tracking-[-0.03em] text-[#101a35] tabular-nums">
          {value}
        </p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

function SummaryLink({
  href,
  icon,
  iconClassName,
  label,
  value,
}: {
  href: string;
  icon: IconType;
  iconClassName: string;
  label: string;
  value: string;
}) {
  return (
    <Link
      className="flex items-center gap-3 px-4 py-3.5 transition-colors first:rounded-t-[14px] last:rounded-b-[14px] hover:bg-[#f7faff] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#1769e8]"
      href={href}
    >
      <IconTile className={iconClassName} icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-[#53627b]">{label}</span>
        <span className="block truncate text-[15px] font-semibold text-[#101a35] tabular-nums">
          {value}
        </span>
      </span>
      <FiChevronRight aria-hidden className="size-4 shrink-0 text-[#8a97ad]" />
    </Link>
  );
}

function BreakdownRow({
  icon,
  iconClassName,
  label,
  value,
  valueClassName,
}: {
  icon: IconType;
  iconClassName: string;
  label: string;
  value: string;
  valueClassName: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <IconTile className={iconClassName} icon={icon} size="sm" />
      <dt className="min-w-0 flex-1 text-[#34425c]">{label}</dt>
      <dd className={cn("font-semibold tabular-nums", valueClassName)}>
        {value}
      </dd>
    </div>
  );
}

function InsightItem({
  byDate,
  copy,
  insight,
  locale,
  money,
}: {
  byDate: string;
  copy: ForecastLabels;
  insight: ForecastInsight;
  locale: string;
  money: (minor: string) => string;
}) {
  const content = insightContent(insight, copy, locale, money, byDate);
  return (
    <li className="flex gap-3">
      <IconTile className={content.tone} icon={content.icon} size="sm" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[#18243b]">
          {content.title}
        </p>
        <p className="mt-0.5 text-[12px] leading-5 text-[#71809a]">
          {content.body}
        </p>
      </div>
    </li>
  );
}

function insightContent(
  insight: ForecastInsight,
  copy: ForecastLabels,
  locale: string,
  money: (minor: string) => string,
  byDate: string,
): { icon: IconType; tone: string; title: string; body: string } {
  switch (insight.kind) {
    case "TREND":
      if (insight.direction === "FLAT")
        return {
          icon: FiMinus,
          tone: "bg-[#eef2f7] text-[#53627b]",
          title: copy.trendFlatTitle,
          body: copy.trendFlatBody,
        };
      return insight.direction === "UP"
        ? {
            icon: FiArrowUp,
            tone: "bg-[#e8f7ef] text-[#14945a]",
            title: copy.balanceIncrease,
            body: fillLabel(copy.trendUpBody, {
              amount: money(insight.deltaMinor),
              date: byDate,
            }),
          }
        : {
            icon: FiArrowDown,
            tone: "bg-[#fdecee] text-[#e14958]",
            title: copy.balanceDecrease,
            body: fillLabel(copy.trendDownBody, {
              amount: money(insight.deltaMinor),
              date: byDate,
            }),
          };
    case "HEAVY_MONTH": {
      const month = formatForecastMonth(insight.month, locale);
      return {
        icon: FiCalendar,
        tone: "bg-[#eaf2ff] text-[#1769e8]",
        title: fillLabel(copy.heavyMonthTitle, { month }),
        body: fillLabel(copy.heavyMonthBody, {
          count: insight.count,
          amount: money(insight.totalMinor),
          month,
        }),
      };
    }
    case "STABILITY":
      return insight.firstNegativeDate
        ? {
            icon: FiAlertTriangle,
            tone: "bg-[#fff4e0] text-[#c27100]",
            title: copy.riskTitle,
            body: fillLabel(copy.riskBody, {
              date: formatForecastLongDate(insight.firstNegativeDate, locale),
            }),
          }
        : {
            icon: FiActivity,
            tone: "bg-[#f1ecff] text-[#7c4ddb]",
            title: copy.stableTitle,
            body: copy.positiveBalance,
          };
  }
}

function SectionHeader({
  href,
  subtitle,
  title,
  viewAll,
}: {
  href: string;
  subtitle?: string;
  title: string;
  viewAll: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="min-w-0 text-[15px] font-semibold tracking-[-0.02em] text-[#18243b]">
        {title}
        {subtitle ? (
          <span className="ml-1 text-[12px] font-normal text-[#71809a]">
            ({subtitle})
          </span>
        ) : null}
      </h2>
      <Link
        className="inline-flex shrink-0 items-center gap-1 rounded-[6px] text-[12px] font-semibold text-[#1769e8] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769e8]"
        href={href}
      >
        {viewAll}
        <FiArrowRight aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

function AccountRow({
  account,
  copy,
  locale,
  workspaceSlug,
}: {
  account: ForecastAccountProjection;
  copy: ForecastLabels;
  locale: string;
  workspaceSlug: string;
}) {
  const current = BigInt(account.currentBalanceMinor);
  const projected = BigInt(account.projectedBalanceMinor);
  const delta = projected - current;

  return (
    <Link
      className="-mx-2 flex items-center gap-3 rounded-[8px] px-2 py-2.5 transition-colors hover:bg-[#f7faff] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1769e8]"
      href={`/w/${workspaceSlug}/accounts/${account.id}`}
    >
      <IconTile
        className={cn("size-8! rounded-[9px]!", ACCOUNT_TINTS[account.type])}
        icon={getAccountTypeMetadata(account.type).icon}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[#18243b]">
          {account.name}
        </span>
        <span className="block truncate text-[11px] text-[#71809a]">
          {fillLabel(copy.current, {
            amount: formatOverviewMoney(current, account.currency, locale),
          })}
        </span>
      </span>
      <span className="shrink-0 text-right tabular-nums">
        <span className="block text-[13px] font-semibold text-[#18243b]">
          {formatOverviewMoney(projected, account.currency, locale)}
        </span>
        <span
          className={cn(
            "block text-[11px] font-semibold",
            delta > 0n
              ? "text-[#14945a]"
              : delta < 0n
                ? "text-[#e14958]"
                : "text-[#71809a]",
          )}
        >
          {formatBalanceDelta(delta, account.currency, locale)}
        </span>
      </span>
    </Link>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-[10px] bg-[#f8fafc] px-3 py-5 text-center text-[12px] text-[#71809a]">
      {children}
    </p>
  );
}
