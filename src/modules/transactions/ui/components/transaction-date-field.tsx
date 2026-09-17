"use client";

import * as React from "react";
import { Popover } from "radix-ui";
import { FiCalendar, FiChevronDown, FiChevronLeft, FiChevronRight } from "react-icons/fi";

import { cn } from "@/lib/utils";

const DAY_IN_MS = 86_400_000;

export type TransactionDateFieldProps = {
  readonly label: string;
  readonly locale: string;
  readonly onValueChange: (value: Date) => void;
  readonly timeZone: string;
  readonly value: Date;
};

type CalendarDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

function createCalendarDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 12));
}

function calendarParts(date: Date): CalendarDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

function calendarKey(date: Date): string {
  const { day, month, year } = calendarParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addCalendarDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * DAY_IN_MS);
}

function addCalendarMonths(date: Date, amount: number): Date {
  const { day, month, year } = calendarParts(date);
  return createCalendarDate(year, month + amount, day);
}

function calendarMonth(date: Date): Date {
  const { month, year } = calendarParts(date);
  return createCalendarDate(year, month, 1);
}

function firstDayOfWeek(locale: string): number {
  try {
    const localeWithWeekInfo = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { readonly firstDay: number };
    };
    const weekInfo = localeWithWeekInfo.getWeekInfo?.();
    if (weekInfo) return weekInfo.firstDay % 7;
  } catch {
    // Fall through to the language-aware default below.
  }

  return locale.startsWith("en-US") ? 0 : 1;
}

function calendarGrid(month: Date, locale: string): readonly Date[] {
  const start = calendarMonth(month);
  const offset = (start.getUTCDay() - firstDayOfWeek(locale) + 7) % 7;

  return Array.from({ length: 42 }, (_, index) => addCalendarDays(start, index - offset));
}

function weekdayLabels(locale: string): readonly string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
  const firstDay = firstDayOfWeek(locale);

  return Array.from({ length: 7 }, (_, index) => formatter.format(createCalendarDate(2024, 0, 7 + ((firstDay + index) % 7))));
}

function formatMonth(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatLongDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(date);
}

export function formatTransactionFormDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

/** Returns a date-only value for the current day in the supplied Pace timezone. */
export function getTransactionFormToday(timeZone: string, now = new Date()): Date {
  const values = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const parts = Object.fromEntries(values.map((part) => [part.type, part.value]));

  return createCalendarDate(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

export function TransactionDateField({ label, locale, onValueChange, timeZone, value }: TransactionDateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [displayedMonth, setDisplayedMonth] = React.useState(() => calendarMonth(value));
  const [focusedDate, setFocusedDate] = React.useState(value);
  const triggerId = React.useId();
  const calendarId = React.useId();
  const dayRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const today = getTransactionFormToday(timeZone);
  const days = React.useMemo(() => calendarGrid(displayedMonth, locale), [displayedMonth, locale]);
  const weekdays = React.useMemo(() => weekdayLabels(locale), [locale]);
  const selectedKey = calendarKey(value);
  const todayKey = calendarKey(today);
  const displayedMonthKey = `${displayedMonth.getUTCFullYear()}-${displayedMonth.getUTCMonth()}`;

  function focusDay(nextDate: Date) {
    const nextKey = calendarKey(nextDate);
    setFocusedDate(nextDate);
    setDisplayedMonth(calendarMonth(nextDate));
    window.requestAnimationFrame(() => dayRefs.current.get(nextKey)?.focus());
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const selectedKeyOnOpen = calendarKey(value);
      setDisplayedMonth(calendarMonth(value));
      setFocusedDate(value);
      window.requestAnimationFrame(() => dayRefs.current.get(selectedKeyOnOpen)?.focus());
    }
    setOpen(nextOpen);
  }

  function selectDay(nextDate: Date) {
    onValueChange(nextDate);
    setOpen(false);
  }

  function handleDayKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, date: Date) {
    let nextDate: Date | null = null;

    switch (event.key) {
      case "ArrowDown":
        nextDate = addCalendarDays(date, 7);
        break;
      case "ArrowLeft":
        nextDate = addCalendarDays(date, -1);
        break;
      case "ArrowRight":
        nextDate = addCalendarDays(date, 1);
        break;
      case "ArrowUp":
        nextDate = addCalendarDays(date, -7);
        break;
      case "End":
        nextDate = addCalendarDays(date, 6 - ((date.getUTCDay() - firstDayOfWeek(locale) + 7) % 7));
        break;
      case "Home":
        nextDate = addCalendarDays(date, -((date.getUTCDay() - firstDayOfWeek(locale) + 7) % 7));
        break;
      case "PageDown":
        nextDate = addCalendarMonths(date, event.shiftKey ? 12 : 1);
        break;
      case "PageUp":
        nextDate = addCalendarMonths(date, event.shiftKey ? -12 : -1);
        break;
      default:
        return;
    }

    event.preventDefault();
    focusDay(nextDate);
  }

  return (
    <div className="grid min-w-0 gap-2">
      <label className="text-[13px] font-medium text-[#384862]" htmlFor={triggerId}>
        {label}
      </label>

      <Popover.Root onOpenChange={handleOpenChange} open={open}>
        <Popover.Trigger asChild>
          <button
            aria-controls={calendarId}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={`${label}: ${formatLongDate(value, locale)}`}
            className="flex h-11 w-full items-center gap-2.5 rounded-[8px] border border-[#d9e1ec] bg-white px-3 text-left text-[13px] text-[#13213f] outline-none transition-[border-color,box-shadow] duration-150 hover:border-[#bac9df] focus-visible:border-[#4e7fe3] focus-visible:ring-3 focus-visible:ring-[#5e8fe8]/15"
            id={triggerId}
            type="button"
          >
            <FiCalendar aria-hidden="true" className="size-[17px] shrink-0 text-[#526987]" />
            <span className="min-w-0 flex-1 truncate font-medium tabular-nums">{formatTransactionFormDate(value, locale)}</span>
            <FiChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-[#60769e] transition-transform", open && "rotate-180")} />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="start"
            aria-label={label}
            className="z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-[10px] border border-[#d9e1ec] bg-white p-3 shadow-[0_18px_45px_rgb(31_62_119/14%)]"
            id={calendarId}
            role="dialog"
            sideOffset={6}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                aria-label={formatMonth(addCalendarMonths(displayedMonth, -1), locale)}
                className="flex size-8 items-center justify-center rounded-[7px] text-[#526987] outline-none transition-colors hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:bg-[#edf3ff] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/25"
                onClick={() => setDisplayedMonth((month) => addCalendarMonths(month, -1))}
                type="button"
              >
                <FiChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <p className="text-[13px] font-semibold text-[#263550]">{formatMonth(displayedMonth, locale)}</p>
              <button
                aria-label={formatMonth(addCalendarMonths(displayedMonth, 1), locale)}
                className="flex size-8 items-center justify-center rounded-[7px] text-[#526987] outline-none transition-colors hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:bg-[#edf3ff] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/25"
                onClick={() => setDisplayedMonth((month) => addCalendarMonths(month, 1))}
                type="button"
              >
                <FiChevronRight aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div aria-label={formatMonth(displayedMonth, locale)} className="grid grid-cols-7 gap-y-1" role="grid">
              {weekdays.map((weekday, index) => (
                <span className="flex h-7 items-center justify-center text-[11px] font-medium text-[#7c8aa1]" key={`${weekday}-${index}`}>
                  {weekday}
                </span>
              ))}
              {days.map((day) => {
                const key = calendarKey(day);
                const isCurrentMonth = `${day.getUTCFullYear()}-${day.getUTCMonth()}` === displayedMonthKey;
                const isSelected = key === selectedKey;
                const isToday = key === todayKey;
                const isFocused = key === calendarKey(focusedDate);

                return (
                  <div className="flex h-9 items-center justify-center" key={key} role="gridcell">
                    <button
                      aria-current={isToday ? "date" : undefined}
                      aria-label={formatLongDate(day, locale)}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-[7px] text-[12px] font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/35",
                        isCurrentMonth ? "text-[#263550] hover:bg-[#edf3ff]" : "text-[#a9b5c7] hover:bg-[#f5f7fa]",
                        isToday && !isSelected && "ring-1 ring-[#91a8cf]",
                        isSelected && "bg-[#2563eb] text-white hover:bg-[#1e55d1]",
                      )}
                      onClick={() => selectDay(day)}
                      onFocus={() => setFocusedDate(day)}
                      onKeyDown={(event) => handleDayKeyDown(event, day)}
                      ref={(element) => {
                        if (element) dayRefs.current.set(key, element);
                        else dayRefs.current.delete(key);
                      }}
                      tabIndex={isFocused ? 0 : -1}
                      type="button"
                    >
                      {day.getUTCDate()}
                    </button>
                  </div>
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
