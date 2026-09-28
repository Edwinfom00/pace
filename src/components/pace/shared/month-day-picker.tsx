"use client";

import { useMemo, useState } from "react";
import { FiCalendar, FiChevronDown } from "react-icons/fi";
import { Popover } from "radix-ui";

import { cn } from "@/lib/utils";

export type MonthDayPickerLabels = {
  readonly clear: string;
  readonly label: string;
  readonly placeholder: string;
  readonly today: string;
};

function parseMonthKey(monthKey: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) throw new Error("MonthDayPicker requires a YYYY-MM month key.");
  return { month: Number(match[2]), year: Number(match[1]) };
}

function dayKey(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function firstWeekday(locale: string) {
  const localeWithWeekInfo = new Intl.Locale(locale) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
  };
  return (localeWithWeekInfo.getWeekInfo?.().firstDay ?? 1) % 7;
}

export function MonthDayPicker({
  disabled = false,
  disabledDate,
  labels,
  locale,
  monthKey,
  onChange,
  onSelectToday,
  selectedDate,
}: {
  readonly disabled?: boolean;
  readonly disabledDate?: (dateKey: string) => boolean;
  readonly labels: MonthDayPickerLabels;
  readonly locale: string;
  readonly monthKey: string;
  readonly onChange: (dateKey: string | null) => void;
  readonly onSelectToday?: () => void;
  readonly selectedDate: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { month, year } = useMemo(() => parseMonthKey(monthKey), [monthKey]);
  const monthStart = useMemo(() => new Date(Date.UTC(year, month - 1, 1)), [month, year]);
  const dayCount = useMemo(() => new Date(Date.UTC(year, month, 0)).getUTCDate(), [month, year]);
  const weekStart = useMemo(() => firstWeekday(locale), [locale]);
  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(Date.UTC(2023, 0, 1 + ((weekStart + index) % 7)))),
    );
  }, [locale, weekStart]);
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(monthStart),
    [locale, monthStart],
  );
  const selectedLabel = useMemo(() => {
    if (!selectedDate) return labels.placeholder;
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${selectedDate}T12:00:00.000Z`));
  }, [labels.placeholder, locale, selectedDate]);
  const leadingDays = (monthStart.getUTCDay() - weekStart + 7) % 7;
  const days = Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    return { dateKey: dayKey(year, month, day), day };
  });

  const selectDate = (dateKey: string) => {
    setOpen(false);
    onChange(dateKey);
  };

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>
        <button
          aria-label={labels.label}
          className={cn(
            "flex h-9 min-w-0 items-center gap-2 rounded-[8px] border bg-white px-3 text-left text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65",
            selectedDate
              ? "border-[#9abbef] text-[#1c4f9e] hover:border-[#709be0] hover:bg-[#f6f9ff]"
              : "border-[#e2e8f0] text-[#52617b] hover:border-[#cdd8e7] hover:bg-[#f8fafc] hover:text-[#34405d]",
          )}
          disabled={disabled}
          type="button"
        >
          <FiCalendar aria-hidden="true" className="size-4 shrink-0 text-[#4c76bd]" />
          <span className="max-w-38 truncate">{selectedLabel}</span>
          <FiChevronDown aria-hidden="true" className="size-4 shrink-0 text-[#667895]" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          aria-label={labels.label}
          className="z-50 w-[min(20.5rem,calc(100vw-2rem))] rounded-[12px] border border-[#dce5f1] bg-white p-3 shadow-[0_6px_8px_rgb(16_24_40/10%)] outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150"
          onOpenAutoFocus={(event) => event.preventDefault()}
          sideOffset={8}
        >
          <div className="mb-3 flex items-center gap-2 px-1">
            <FiCalendar aria-hidden="true" className="size-4 text-[#2f75e8]" />
            <p className="text-[14px] font-semibold tracking-[-0.01em] text-[#263551]">{monthLabel}</p>
          </div>
          <div aria-hidden="true" className="mb-1 grid grid-cols-7">
            {weekdayLabels.map((weekday, index) => (
              <span className="grid h-7 place-items-center text-[11px] font-medium text-[#7a899f]" key={`${weekday}-${index}`}>
                {weekday}
              </span>
            ))}
          </div>
          <div aria-label={monthLabel} className="grid grid-cols-7 gap-y-1" role="group">
            {Array.from({ length: leadingDays }, (_, index) => <span aria-hidden="true" className="h-9" key={`empty-${index}`} />)}
            {days.map(({ dateKey, day }) => {
              const isSelected = selectedDate === dateKey;
              const isDisabled = disabled || disabledDate?.(dateKey) === true;
              const longDate = new Intl.DateTimeFormat(locale, {
                day: "numeric",
                month: "long",
                weekday: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${dateKey}T12:00:00.000Z`));
              return (
                <button
                  aria-label={longDate}
                  aria-pressed={isSelected}
                  className={cn(
                    "mx-auto grid size-8 place-items-center rounded-[8px] text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:text-[#c1cad7]",
                    isSelected
                      ? "bg-[#2f75e8] text-white hover:bg-[#2368d7]"
                      : "text-[#3d4c65] hover:bg-[#edf4ff] hover:text-[#1f5fcd]",
                  )}
                  disabled={isDisabled}
                  key={dateKey}
                  onClick={() => selectDate(dateKey)}
                  type="button"
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#e9eef5] pt-2">
            {onSelectToday ? (
              <button
                className="h-8 rounded-[7px] px-2.5 text-[13px] font-medium text-[#2368d7] outline-none transition-colors hover:bg-[#edf4ff] focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  onSelectToday();
                }}
                type="button"
              >
                {labels.today}
              </button>
            ) : <span />}
            <button
              className="h-8 rounded-[7px] px-2.5 text-[13px] font-medium text-[#2368d7] outline-none transition-colors hover:bg-[#edf4ff] focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled || !selectedDate}
              onClick={() => {
                setOpen(false);
                onChange(null);
              }}
              type="button"
            >
              {labels.clear}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
