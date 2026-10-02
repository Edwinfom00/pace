"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";
import { FiChevronRight } from "react-icons/fi";

import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";
import { formatOverviewDate } from "@/modules/overview/domain/overview-formatters";

import {
  DEFAULT_RECURRING_HORIZON,
  RECURRING_HORIZONS,
  type InsightsRecurring,
  type RecurringHorizon,
} from "../../recurring/insights-recurring.types";
import { formatInsightsMoney } from "../insights-format";
import { recurringDetailHref } from "../insights-links";
import { recurringItemName, upcomingWeekHeight } from "../recurring-format";
import { useInsightsNavigation } from "./insights-navigation";

const PROJECTED_FILL =
  "repeating-linear-gradient(135deg, #8fb4ef 0 3px, #c9dbf7 3px 6px)";

export function RecurringUpcoming({
  labels,
  recurring,
  workspaceSlug,
}: {
  readonly labels: DashboardLabels;
  readonly recurring: InsightsRecurring;
  readonly workspaceSlug: string;
}) {
  const { upcoming } = recurring;
  const { isLoading, navigate, pending } = useInsightsNavigation();
  const activeHorizon = (pending?.horizon ??
    (pending && "horizon" in pending
      ? DEFAULT_RECURRING_HORIZON
      : upcoming.horizon)) as RecurringHorizon;
  const money = (minor: string) =>
    formatInsightsMoney(minor, recurring.currency, recurring.locale);
  const date = (value: string) => formatOverviewDate(value, recurring.locale);
  const selectHorizon = (next: RecurringHorizon) =>
    navigate({ horizon: next === DEFAULT_RECURRING_HORIZON ? null : next });

  const onHorizonKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = RECURRING_HORIZONS.indexOf(activeHorizon);
    const count = RECURRING_HORIZONS.length;
    const next =
      event.key === "ArrowRight"
        ? RECURRING_HORIZONS[(index + 1) % count]
        : event.key === "ArrowLeft"
          ? RECURRING_HORIZONS[(index - 1 + count) % count]
          : null;
    if (!next) return;
    event.preventDefault();
    selectHorizon(next);
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-horizon="${next}"]`)
      ?.focus();
  };

  return (
    <section
      aria-labelledby="recurring-upcoming-title"
      className="min-w-0 rounded-[10px] border border-dashed border-[#c9d6ea] bg-[#fbfcfe] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
        <div className="min-w-0">
          <h2
            className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]"
            id="recurring-upcoming-title">
            {labels["insights.recurring.upcoming.title"]}
            <span className="rounded-[4px] border border-dashed border-[#9dbaf0] px-1.5 text-[10px] leading-4 font-semibold tracking-wide text-[#3b6fc9] uppercase">
              {labels["insights.recurring.projected"]}
            </span>
          </h2>
          <p className="text-[12px] leading-5 text-[#71809a]">
            {labels["insights.recurring.upcoming.description"]}
          </p>
        </div>
        <div
          aria-label={labels["insights.recurring.upcoming.horizonLabel"]}
          className="flex shrink-0 gap-0.5 rounded-[8px] border border-[#e5eaf1] bg-white p-0.5"
          onKeyDown={onHorizonKeyDown}
          role="radiogroup">
          {RECURRING_HORIZONS.map((option) => {
            const selected = option === activeHorizon;
            return (
              <button
                aria-checked={selected}
                className={cn(
                  "h-7 rounded-[6px] px-2.5 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#91b5fa] disabled:cursor-wait",
                  selected
                    ? "bg-[#101a35] text-white"
                    : "text-[#44516a] hover:bg-[#f3f6fb]",
                )}
                data-horizon={option}
                disabled={isLoading && !selected}
                key={option}
                onClick={() => selectHorizon(option)}
                role="radio"
                tabIndex={selected ? 0 : -1}
                type="button">
                {labels[`insights.recurring.upcoming.horizon.${option}`]}
              </button>
            );
          })}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <dt className="text-[12px] leading-4.5 text-[#667085]">
            {labels["insights.recurring.upcoming.outflow"]}
          </dt>
          <dd className="truncate text-[18px] leading-6 font-semibold tracking-tight text-[#101a35] tabular-nums">
            {money(upcoming.outflowMinor)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[12px] leading-4.5 text-[#667085]">
            {labels["insights.recurring.upcoming.inflow"]}
          </dt>
          <dd className="truncate text-[18px] leading-6 font-semibold tracking-tight text-[#0b8c5a] tabular-nums">
            {money(upcoming.inflowMinor)}
          </dd>
        </div>
      </dl>
      <p className="mt-0.5 text-[12px] leading-5 text-[#71809a] tabular-nums">
        {date(upcoming.firstDate)} – {date(upcoming.lastDate)}
        {upcoming.occurrenceCount ? (
          <>
            {" · "}
            {formatDashboardLabel(labels, "insights.recurring.upcoming.count", {
              count: upcoming.occurrenceCount,
              items: upcoming.commitmentCount,
            })}
          </>
        ) : null}
      </p>

      {upcoming.occurrenceCount ? (
        <>
          <div className="mt-3">
            <ul
              aria-label={labels["insights.recurring.upcoming.weeks"]}
              className="flex h-14 items-end gap-1">
              {upcoming.weeks.map((week) => (
                <li
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                  key={week.start}
                  title={`${formatDashboardLabel(labels, "insights.recurring.upcoming.week", { date: date(week.start) })} · ${money(week.outflowMinor)}`}>
                  <span className="sr-only">
                    {formatDashboardLabel(labels, "insights.recurring.upcoming.week", {
                      date: date(week.start),
                    })}
                    : {money(week.outflowMinor)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "block w-full rounded-t-[3px]",
                      week.peakShareBps === 0 && "h-px bg-[#dfe6f0]",
                    )}
                    style={
                      week.peakShareBps > 0
                        ? {
                            height: upcomingWeekHeight(week.peakShareBps),
                            background: PROJECTED_FILL,
                          }
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
          <ul className="mt-3 divide-y divide-[#edf0f4] border-t border-[#edf0f4]">
            {upcoming.items.map((item) => (
              <li key={`${item.recurringId}:${item.date}`}>
                <Link
                  className="group -mx-2 flex min-h-11 items-center gap-3 rounded-[8px] px-2 py-2 outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                  href={recurringDetailHref(workspaceSlug, item.recurringId)}>
                  <span className="w-12 shrink-0 text-[12px] leading-5 font-medium text-[#5d6b84] tabular-nums">
                    {date(item.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-5 font-medium text-[#1c2740]">
                    {recurringItemName(item.name, labels)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[13px] leading-5 font-semibold tabular-nums",
                      item.flow === "INFLOW" ? "text-[#0b8c5a]" : "text-[#1c2740]",
                    )}
                    title={
                      item.isVariable
                        ? labels["insights.recurring.upcoming.variable"]
                        : undefined
                    }>
                    {item.isVariable ? "≈ " : ""}
                    {item.flow === "INFLOW" ? "+" : ""}
                    {money(item.amountMinor)}
                  </span>
                  <FiChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-[#b3bccb] group-hover:text-[#71809a]"
                  />
                </Link>
              </li>
            ))}
          </ul>
          {upcoming.remainingCount ? (
            <p className="pt-2 text-[12px] leading-5 text-[#71809a]">
              {formatDashboardLabel(labels, "insights.recurring.upcoming.more", {
                count: upcoming.remainingCount,
              })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="py-8 text-center text-[13px] leading-5 text-[#667085]">
          {labels["insights.recurring.upcoming.empty"]}
        </p>
      )}
      <p className="mt-2 text-[11px] leading-4 text-[#8a96ab]">
        {upcoming.hasVariableAmounts
          ? `${labels["insights.recurring.upcoming.variableNote"]} `
          : ""}
        {labels["insights.recurring.upcoming.excludedNote"]}
      </p>
    </section>
  );
}
