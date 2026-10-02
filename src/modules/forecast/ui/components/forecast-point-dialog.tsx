"use client";

import { useMemo } from "react";
import { FiArrowDown, FiArrowUp, FiX } from "react-icons/fi";

import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import type {
  CurrencyForecast,
  ForecastHorizonDays,
  ForecastRecurringItem,
} from "@/modules/forecast/domain/forecast";
import { cumulativeForecastFlows } from "@/modules/forecast/domain/forecast-presentation";
import { ForecastBalanceChart } from "@/modules/forecast/ui/components/forecast-balance-chart";
import { ForecastDatePicker } from "@/modules/forecast/ui/components/forecast-date-picker";
import { ForecastRecurringRow } from "@/modules/forecast/ui/components/forecast-recurring-row";
import {
  fillLabel,
  formatForecastLongDate,
  formatSignedMoney,
  type ForecastLabels,
} from "@/modules/forecast/ui/forecast-format";
import {
  formatOverviewDate,
  formatOverviewMoney,
} from "@/modules/overview/domain/overview-formatters";

export function ForecastPointDialog({
  currency,
  horizonDays,
  itemsById,
  labels,
  locale,
  onOpenChange,
  onSelect,
  open,
  selected,
  workspaceSlug,
}: {
  currency: CurrencyForecast;
  horizonDays: ForecastHorizonDays;
  itemsById: ReadonlyMap<string, ForecastRecurringItem>;
  labels: ForecastLabels;
  locale: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (index: number) => void;
  open: boolean;
  selected: number;
  workspaceSlug: string;
}) {
  const code = currency.currency;
  const flows = useMemo(() => cumulativeForecastFlows(currency), [currency]);
  const point = currency.points[selected] ?? currency.points[0];
  const flow = flows[selected] ?? flows[0];
  if (!point || !flow) return null;
  const longDate = formatForecastLongDate(point.date, locale);

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent
        className="flex! max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100%-1rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-[14px] border border-[#e1e7f0] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-xl"
        drawerClassName="w-full max-w-none rounded-none rounded-t-[16px] border-x-0 border-b-0 border-[#e1e7f0] shadow-[0_-12px_32px_rgb(15_23_42/12%)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)] data-[vaul-drawer-direction=bottom]:rounded-t-[16px]"
        showCloseButton={false}>
        <ResponsiveDialogHeader className="relative gap-1 border-b border-[#e8edf4] px-5 pt-5 pb-4 pr-14">
          <ResponsiveDialogTitle className="text-[17px] leading-6 font-semibold tracking-tight text-[#101a35]">
            {labels.title}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-[12px] leading-5 text-[#71809a]">
            {labels.inspectDate}
          </ResponsiveDialogDescription>
          <ResponsiveDialogClose>
            <button
              aria-label={labels.close}
              className="absolute top-4 right-4 grid size-8 place-items-center rounded-[8px] text-[#61708a] transition-colors hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769e8]"
              type="button">
              <FiX aria-hidden className="size-4" />
            </button>
          </ResponsiveDialogClose>
        </ResponsiveDialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ForecastDatePicker
            dates={currency.points.map((item) => formatOverviewDate(item.date, locale))}
            label={labels.selectedDate}
            onChange={onSelect}
            selected={selected}
          />

          <section className="mt-4 rounded-[12px] border border-[#e3ebf7] bg-[#f6f9fe] p-4">
            <p className="text-[12px] font-medium text-[#53627b]">{longDate}</p>
            <p className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[#101a35]">
              {formatOverviewMoney(point.projectedClosingBalance.nominalMinor, code, locale)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="flex items-center gap-1 text-[12px] font-semibold text-[#14945a]">
                  <FiArrowUp aria-hidden className="size-3" />
                  {formatSignedMoney(flow.inflowMinor, code, locale, "+")}
                </p>
                <p className="mt-0.5 text-[11px] text-[#71809a]">{labels.inflowsSoFar}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[12px] font-semibold text-[#e14958]">
                  <FiArrowDown aria-hidden className="size-3" />
                  {formatSignedMoney(flow.outflowMinor, code, locale, "-")}
                </p>
                <p className="mt-0.5 text-[11px] text-[#71809a]">{labels.outflowsSoFar}</p>
              </div>
            </div>
          </section>

          <div className="mt-4">
            <ForecastBalanceChart
              currency={currency}
              horizonDays={horizonDays}
              labels={labels}
              locale={locale}
              onSelect={onSelect}
              plotClassName="h-52"
              selected={selected}
            />
          </div>

          <section className="mt-5">
            <h3 className="text-[14px] font-semibold text-[#18243b]">
              {fillLabel(labels.itemsOn, { date: longDate })}
            </h3>
            {point.events.length ? (
              <div className="mt-2 divide-y divide-[#edf0f4]">
                {point.events.map((event, index) => (
                  <ForecastRecurringRow
                    currency={code}
                    event={event}
                    item={itemsById.get(event.recurringId)}
                    key={`${event.recurringId}-${index}`}
                    labels={labels}
                    locale={locale}
                    showDate={false}
                    workspaceSlug={workspaceSlug}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-[10px] bg-[#f8fafc] px-3 py-4 text-center text-[12px] text-[#71809a]">
                {labels.noItemsOnDate}
              </p>
            )}
          </section>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
