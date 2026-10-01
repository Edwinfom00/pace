"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  FiArrowDownRight,
  FiArrowLeft,
  FiArrowUpRight,
  FiCreditCard,
  FiRepeat,
} from "react-icons/fi";

import { FilterLoadingSurface } from "@/components/pace/shared/filter-loading-surface";
import { ForecastAccountFilter } from "@/modules/forecast/ui/components/forecast-account-filter";
import { ForecastBalanceChart } from "@/modules/forecast/ui/components/forecast-balance-chart";
import { ForecastDatePicker } from "@/modules/forecast/ui/components/forecast-date-picker";
import type {
  CurrencyForecast,
  ForecastEvent,
  ForecastHorizonDays,
  WorkspaceForecast,
} from "@/modules/forecast/domain/forecast";
import {
  formatOverviewDate,
  formatOverviewMoney,
} from "@/modules/overview/domain/overview-formatters";
import type { PlansUiLabels } from "@/modules/plans/ui/plans-ui-labels";

const horizons: readonly ForecastHorizonDays[] = [30, 60, 90];
function Amount({
  amount,
  currency,
  locale,
}: {
  amount: string;
  currency: string;
  locale: string;
}) {
  return <span>{formatOverviewMoney(amount, currency, locale)}</span>;
}

function CurrencyAmounts({
  currencies,
  value,
  locale,
}: {
  currencies: readonly CurrencyForecast[];
  value: (currency: CurrencyForecast) => string;
  locale: string;
}) {
  return (
    <div className="space-y-0.5">
      {currencies.map((currency) => (
        <p
          className="truncate text-[18px] font-semibold tracking-[-0.03em] text-[#14203a]"
          key={currency.currency}>
          <Amount
            amount={value(currency)}
            currency={currency.currency}
            locale={locale}
          />
        </p>
      ))}
    </div>
  );
}

function ForecastMetric({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-[12px] border border-[#e5eaf1] bg-white p-4">
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#edf4ff] text-[#2867e8]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[12px] font-medium text-[#60708b]">{label}</h2>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </section>
  );
}

function ForecastChart({
  currency,
  locale,
  labels,
  onSelect,
  selected,
}: {
  currency: CurrencyForecast;
  locale: string;
  labels: PlansUiLabels["forecast"];
  onSelect: (point: number) => void;
  selected: number;
}) {
  const selectedPoint = currency.points[selected];
  return (
    <section className="rounded-[12px] border border-[#e5eaf1] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#18243b]">{labels.balanceOverTime}</h2>
          <p className="mt-0.5 text-[12px] text-[#71809a]">{currency.currency}</p>
        </div>
        <ForecastDatePicker
          dates={currency.points.map((point) => formatOverviewDate(point.date, locale))}
          label={labels.selectedDate}
          onChange={onSelect}
          selected={selected}
        />
      </div>
      <div className="mt-4">
        <ForecastBalanceChart currency={currency} description={labels.chartDescription} locale={locale} onSelect={onSelect} selected={selected} />
      </div>
      {selectedPoint ? (
        <p className="sr-only">
          {formatOverviewDate(selectedPoint.date, locale)}
        </p>
      ) : null}
    </section>
  );
}

function Events({
  events,
  locale,
  labels,
  currency,
  workspaceSlug,
}: {
  events: readonly ForecastEvent[];
  locale: string;
  labels: PlansUiLabels["forecast"];
  currency: string;
  workspaceSlug: string;
}) {
  return (
    <section className="rounded-[12px] border border-[#e5eaf1] bg-white p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#18243b]">
        {labels.upcoming}
      </h2>
      <div className="mt-3 divide-y divide-[#edf0f4]">
        {events.slice(0, 6).map((event, index) => (
          <Link
            aria-label={`${labels.viewRecurring}: ${formatOverviewDate(event.occursAt.slice(0, 10), locale)}`}
            className="flex items-center justify-between gap-3 rounded-[6px] py-3 first:pt-0 hover:bg-[#f7faff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769e8]"
            href={`/w/${workspaceSlug}/recurring/${event.recurringId}`}
            key={`${event.recurringId}-${event.occursAt}-${index}`}>
            <div className="min-w-0">
              <time
                className="block text-[11px] text-[#71809a]"
                dateTime={event.occursAt}>
                {new Intl.DateTimeFormat(locale, {
                  day: "numeric",
                  month: "short",
                }).format(new Date(event.occursAt))}
              </time>
              <p className="text-[12px] font-medium text-[#34425c]">
                {event.direction === "INFLOW"
                  ? labels.incomes
                  : labels.expenses}
                {event.amount.uncertainty === "VARIABLE"
                  ? ` · ${labels.variable}`
                  : ""}
              </p>
            </div>
            <p
              className={
                event.direction === "INFLOW"
                  ? "shrink-0 text-[12px] font-semibold text-[#14945a]"
                  : "shrink-0 text-[12px] font-semibold text-[#e14958]"
              }>
              {event.direction === "INFLOW" ? "+" : "−"}
              <Amount
                amount={event.amount.nominalMinor}
                currency={currency}
                locale={locale}
              />
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

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
  const primary = forecast.currencies[0];
  const [selected, setSelected] = useState({
    currency: primary?.currency ?? "",
    point: 0,
  });
  const inspectedCurrency =
    forecast.currencies.find(
      (currency) => currency.currency === selected.currency,
    ) ?? primary;
  const selectHorizon = (horizon: ForecastHorizonDays) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("horizon", String(horizon));
    startTransition(() =>
      router.replace(`${pathname}?${next}`, { scroll: false }),
    );
  };
  const selectAccount = (accountId: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (accountId) next.set("account", accountId);
    else next.delete("account");
    startTransition(() =>
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
        scroll: false,
      }),
    );
  };
  if (!forecast.currencies.some((currency) => currency.events.length))
    return (
      <main className="mx-auto w-full max-w-355 px-5 py-7 sm:px-7 sm:py-8 lg:px-10">
        <Link
          className="inline-flex items-center gap-1.5 rounded-[7px] text-[12px] font-medium text-[#60708b] hover:text-[#1769e8] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#1769e8]"
          href={`/w/${workspaceSlug}/plans`}>
          <FiArrowLeft aria-hidden="true" className="size-3.5" />
          {labels.title}
        </Link>
        <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.04em] text-[#101a35]">
          {labels.forecast.title}
        </h1>
        <section className="mt-8 grid min-h-80 place-items-center rounded-[12px] border border-[#e5eaf1] bg-white px-5 text-center">
          <div>
            <span
              aria-hidden="true"
              className="mx-auto grid size-11 place-items-center rounded-[11px] bg-[#edf4ff] text-[#2867e8]">
              <FiRepeat />
            </span>
            <h2 className="mt-4 text-[16px] font-semibold text-[#18243b]">
              {labels.forecast.noRecurringTitle}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-5 text-[#71809a]">
              {labels.forecast.noRecurringDescription}
            </p>
            <Link
              className="mt-5 inline-flex rounded-[8px] bg-[#1769e8] px-3.5 py-2 text-[13px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#1769e8]"
              href={`/w/${workspaceSlug}/recurring`}>
              {labels.forecast.addRecurring}
            </Link>
          </div>
        </section>
      </main>
    );
  return (
    <main className="mx-auto w-full max-w-355 px-5 py-7 sm:px-7 sm:py-8 lg:px-10">
      <header>
        <Link
          className="inline-flex items-center gap-1.5 rounded-[7px] text-[12px] font-medium text-[#60708b] hover:text-[#1769e8] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#1769e8]"
          href={`/w/${workspaceSlug}/plans`}>
          <FiArrowLeft aria-hidden="true" className="size-3.5" />
          {labels.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-[#101a35]">
              {labels.forecast.title}
            </h1>
            <p className="mt-1 text-[13px] text-[#71809a]">
              {labels.forecast.subtitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ForecastAccountFilter
              accounts={forecast.accounts}
              allAccountsLabel={labels.forecast.allAccounts}
              label={labels.forecast.accountFilter}
              onChange={selectAccount}
              value={forecast.selectedAccountId}
            />
            <div
              aria-label={labels.forecast.title}
              className="inline-flex rounded-[9px] border border-[#dce4ef] bg-white p-1">
              {horizons.map((horizon) => (
                <button
                  className={`rounded-[6px] px-3 py-1.5 text-[12px] font-semibold ${forecast.horizonDays === horizon ? "bg-[#eaf2ff] text-[#1769e8]" : "text-[#60708b] hover:text-[#1769e8]"}`}
                  key={horizon}
                  onClick={() => selectHorizon(horizon)}
                  type="button">
                  {labels.forecast[`horizon${horizon}`]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>
      <FilterLoadingSurface isLoading={pending} label={labels.forecast.loading}>
        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ForecastMetric
            icon={<FiCreditCard />}
            label={labels.forecast.projectedBalance}>
            <CurrencyAmounts
              currencies={forecast.currencies}
              locale={locale}
              value={(currency) =>
                currency.points.at(-1)!.projectedClosingBalance.nominalMinor
              }
            />
          </ForecastMetric>
          <ForecastMetric
            icon={<FiArrowUpRight />}
            label={labels.forecast.totalInflows}>
            <CurrencyAmounts
              currencies={forecast.currencies}
              locale={locale}
              value={(currency) => currency.totalInflows.nominalMinor}
            />
          </ForecastMetric>
          <ForecastMetric
            icon={<FiArrowDownRight />}
            label={labels.forecast.totalOutflows}>
            <CurrencyAmounts
              currencies={forecast.currencies}
              locale={locale}
              value={(currency) => currency.totalOutflows.nominalMinor}
            />
          </ForecastMetric>
          <ForecastMetric
            icon={<FiRepeat />}
            label={labels.forecast.recurringItems}>
            <p className="text-[22px] font-semibold tracking-[-0.04em] text-[#14203a]">
              {forecast.recurringItemCount}
            </p>
          </ForecastMetric>
        </section>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            {forecast.currencies.map((currency) => (
              <ForecastChart
                currency={currency}
                key={currency.currency}
                labels={labels.forecast}
                locale={locale}
                onSelect={(point) =>
                  setSelected({ currency: currency.currency, point })
                }
                selected={
                  selected.currency === currency.currency ? selected.point : 0
                }
              />
            ))}
          </div>
          <aside className="space-y-4">
            <section className="rounded-[12px] border border-[#e5eaf1] bg-white p-4 sm:p-5">
              <h2 className="text-[15px] font-semibold text-[#18243b]">
                {labels.forecast.balanceBreakdown}
              </h2>
              {forecast.currencies.map((currency) => {
                const end = currency.points.at(-1)!;
                return (
                  <div
                    className="mt-4 border-t border-[#edf0f4] pt-3 first:border-0 first:pt-0"
                    key={currency.currency}>
                    <p className="text-[12px] font-semibold text-[#34425c]">
                      {currency.currency}
                    </p>
                    <div className="mt-2 space-y-2 text-[12px]">
                      <p className="flex justify-between gap-3 text-[#60708b]">
                        <span>{labels.forecast.startingBalance}</span>
                        <Amount
                          amount={currency.openingBalance.nominalMinor}
                          currency={currency.currency}
                          locale={locale}
                        />
                      </p>
                      <p className="flex justify-between gap-3 text-[#14945a]">
                        <span>{labels.forecast.incomes}</span>
                        <Amount
                          amount={currency.totalInflows.nominalMinor}
                          currency={currency.currency}
                          locale={locale}
                        />
                      </p>
                      <p className="flex justify-between gap-3 text-[#e14958]">
                        <span>{labels.forecast.expenses}</span>
                        <Amount
                          amount={currency.totalOutflows.nominalMinor}
                          currency={currency.currency}
                          locale={locale}
                        />
                      </p>
                      <p className="flex justify-between gap-3 border-t border-[#edf0f4] pt-2 font-semibold text-[#18243b]">
                        <span>{labels.forecast.projectedBalance}</span>
                        <Amount
                          amount={end.projectedClosingBalance.nominalMinor}
                          currency={currency.currency}
                          locale={locale}
                        />
                      </p>
                    </div>
                  </div>
                );
              })}
            </section>
            <section className="rounded-[12px] border border-[#e5eaf1] bg-white p-4 sm:p-5">
              <h2 className="text-[15px] font-semibold text-[#18243b]">
                {labels.forecast.keyInsights}
              </h2>
              <p className="mt-3 text-[12px] leading-5 text-[#53627b]">
                {forecast.hasNonNegativeBalances
                  ? labels.forecast.positiveBalance
                  : labels.forecast.balanceDecrease}
              </p>
            </section>
          </aside>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Events
            currency={primary!.currency}
            events={primary!.events}
            labels={labels.forecast}
            locale={locale}
            workspaceSlug={workspaceSlug}
          />
          <section className="rounded-[12px] border border-[#e5eaf1] bg-white p-4 sm:p-5">
            <h2 className="text-[15px] font-semibold text-[#18243b]">
              {labels.forecast.projectedAccounts}
            </h2>
            {forecast.selectedAccountId ? (
              <Link
                className="mt-1 inline-flex text-[12px] font-medium text-[#1769e8] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769e8]"
                href={`/w/${workspaceSlug}/accounts/${forecast.selectedAccountId}`}>
                {labels.forecast.viewAccount}
              </Link>
            ) : (
              <p className="mt-1 text-[12px] text-[#71809a]">
                {labels.forecast.projectedBalance}
              </p>
            )}
            <div className="mt-3 divide-y divide-[#edf0f4]">
              {forecast.currencies.map((currency) => (
                <div
                  className="flex items-center justify-between py-3 first:pt-0"
                  key={currency.currency}>
                  <span className="text-[12px] font-medium text-[#34425c]">
                    {currency.currency}
                  </span>
                  <Amount
                    amount={
                      currency.points.at(-1)!.projectedClosingBalance
                        .nominalMinor
                    }
                    currency={currency.currency}
                    locale={locale}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
        {inspectedCurrency?.points[selected.point] ? (
          <section className="mt-4 rounded-[12px] border border-[#dce8fa] bg-[#f7faff] p-4">
            <p className="text-[12px] text-[#60708b]">
              {labels.forecast.itemsOn.replace(
                "{date}",
                formatOverviewDate(
                  inspectedCurrency.points[selected.point].date,
                  locale,
                ),
              )}
            </p>
            <p className="mt-1 text-[18px] font-semibold text-[#14203a]">
              <Amount
                amount={
                  inspectedCurrency.points[selected.point]
                    .projectedClosingBalance.nominalMinor
                }
                currency={inspectedCurrency.currency}
                locale={locale}
              />
            </p>
            <Events
              currency={inspectedCurrency.currency}
              events={inspectedCurrency.points[selected.point].events}
              labels={labels.forecast}
              locale={locale}
              workspaceSlug={workspaceSlug}
            />
          </section>
        ) : null}
      </FilterLoadingSurface>
    </main>
  );
}
