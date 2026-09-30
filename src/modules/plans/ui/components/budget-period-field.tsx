"use client";

import { useId, useMemo, useState } from "react";
import { Popover } from "radix-ui";
import { FiCalendar, FiChevronDown } from "react-icons/fi";

import {
  localDateForInstant,
  zonedLocalDateTimeToInstant,
} from "@/money/period";

export type BudgetPeriodKey = `${number}-${string}`;

export function budgetPeriodKey(now: Date, timeZone: string): BudgetPeriodKey {
  const { year, month } = localDateForInstant(now, timeZone);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function budgetPeriodStart(
  period: string,
  timeZone: string,
): Date | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  return match
    ? zonedLocalDateTimeToInstant(
        { year: Number(match[1]), month: Number(match[2]), day: 1 },
        { hour: 0, minute: 0 },
        timeZone,
      )
    : null;
}

export function formatBudgetPeriod(period: string, locale: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) return "";
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

export function BudgetPeriodField({
  error,
  label,
  locale,
  onChange,
  period,
  selectPeriod,
  timeZone,
}: {
  readonly error?: string;
  readonly label: string;
  readonly locale: string;
  readonly onChange: (period: BudgetPeriodKey) => void;
  readonly period: BudgetPeriodKey;
  readonly selectPeriod: string;
  readonly timeZone: string;
}) {
  const [open, setOpen] = useState(false);
  const errorId = useId();
  const options = useMemo(() => {
    const current = budgetPeriodKey(new Date(), timeZone);
    const [year, month] = current.split("-").map(Number);
    return Array.from({ length: 25 }, (_, index) => {
      const value = new Date(Date.UTC(year, month - 1 + index, 1));
      return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}` as BudgetPeriodKey;
    });
  }, [timeZone]);
  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-medium text-[#384862]">{label}</span>
      <Popover.Root onOpenChange={setOpen} open={open}>
        <Popover.Trigger asChild>
          <button
            aria-describedby={error ? errorId : undefined}
            aria-label={label}
            className={`flex h-10 w-full items-center gap-2 rounded-[8px] border bg-white px-3 text-left text-[13px] font-medium text-[#14213c] outline-none transition focus-visible:border-[#4e7fe3] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/15 ${error ? "border-[#d88690]" : "border-[#d9e1ec]"}`}
            type="button">
            <FiCalendar aria-hidden="true" className="size-4 text-[#526987]" />
            <span className="min-w-0 flex-1 truncate">
              {formatBudgetPeriod(period, locale) || selectPeriod}
            </span>
            <FiChevronDown
              aria-hidden="true"
              className="size-4 text-[#61708a]"
            />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            className="z-50 max-h-72 w-(--radix-popover-trigger-width) overflow-y-auto rounded-[8px] border border-[#dce4ef] bg-white p-1 shadow-[0_12px_28px_rgb(15_23_42/12%)]"
            sideOffset={5}>
            <div aria-label={label} role="listbox">
              {options.map((option) => (
                <button
                  aria-selected={period === option}
                  className={`flex h-9 w-full items-center rounded-[6px] px-2 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#2867e8] ${period === option ? "bg-[#e8f1ff] font-medium text-[#2867e8]" : "text-[#263550] hover:bg-[#f3f6fa]"}`}
                  key={option}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  role="option"
                  type="button">
                  {formatBudgetPeriod(option, locale)}
                </button>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <p
        aria-live={error ? "assertive" : undefined}
        className={`min-h-5 text-[12px] leading-5 ${error ? "text-[#c23445]" : "text-[#71809a]"}`}
        id={errorId}
        role={error ? "alert" : undefined}>
        {error}
      </p>
    </div>
  );
}
