"use client";

import * as React from "react";
import { Popover } from "radix-ui";
import { FiChevronDown, FiClock, FiX } from "react-icons/fi";

import { cn } from "@/lib/utils";

export type TransactionTimeFieldProps = {
  readonly clearLabel: string;
  readonly error?: string;
  readonly label: string;
  readonly locale: string;
  readonly onValueChange: (value: string) => void;
  readonly optionalLabel: string;
  readonly placeholder: string;
  readonly triggerRef?: React.RefObject<HTMLButtonElement | null>;
  /** A 24-hour HH:mm value, or an empty string when no time is chosen. */
  readonly value: string;
};

type TimeParts = { readonly hour: number; readonly minute: number };

function parseTime(value: string): TimeParts | null {
  const match = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/.exec(value);
  if (!match?.groups) return null;

  return { hour: Number(match.groups.hour), minute: Number(match.groups.minute) };
}

function timeValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTransactionFormTime(value: string, locale: string): string {
  const time = parseTime(value);
  if (!time) return value;

  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, time.hour, time.minute)));
}

export function TransactionTimeField({
  clearLabel,
  error,
  label,
  locale,
  onValueChange,
  optionalLabel,
  placeholder,
  triggerRef,
  value,
}: TransactionTimeFieldProps) {
  const [open, setOpen] = React.useState(false);
  const triggerId = React.useId();
  const errorId = React.useId();
  const time = parseTime(value);
  const selectedHour = time?.hour ?? 0;
  const selectedMinute = time?.minute ?? 0;
  const displayValue = time ? formatTransactionFormTime(value, locale) : placeholder;

  function chooseHour(hour: number) {
    onValueChange(timeValue(hour, selectedMinute));
  }

  function chooseMinute(minute: number) {
    onValueChange(timeValue(selectedHour, minute));
  }

  return (
    <div className="grid min-w-0 gap-2">
      <label className="flex items-center gap-1.5 text-[13px] font-medium text-[#384862]" htmlFor={triggerId}>
        <span>{label}</span>
        <span className="text-[12px] font-normal text-[#71809a]">{optionalLabel}</span>
      </label>

      <Popover.Root onOpenChange={setOpen} open={open}>
        <div className={cn(
          "flex h-11 overflow-hidden rounded-[8px] border bg-white transition-[border-color,box-shadow] duration-150 hover:border-[#bac9df] focus-within:ring-3",
          error ? "border-[#d88690] focus-within:border-[#c55b68] focus-within:ring-[#d88690]/15" : "border-[#d9e1ec] focus-within:border-[#4e7fe3] focus-within:ring-[#5e8fe8]/15",
        )}>
          <Popover.Trigger asChild>
            <button
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-describedby={error ? errorId : undefined}
              aria-label={time ? `${label}: ${displayValue}` : `${label}: ${placeholder}`}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 px-3 text-left text-[13px] outline-none",
                time ? "text-[#13213f]" : "text-[#8a9ab3]",
              )}
              id={triggerId}
              ref={triggerRef}
              type="button"
            >
              <FiClock aria-hidden="true" className="size-[17px] shrink-0 text-[#526987]" />
              <span className="min-w-0 flex-1 truncate font-medium tabular-nums">{displayValue}</span>
              <FiChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-[#60769e] transition-transform", open && "rotate-180")} />
            </button>
          </Popover.Trigger>
          {time ? (
            <button
              aria-label={`${clearLabel}: ${label}`}
              className="mr-1 flex size-9 shrink-0 items-center justify-center self-center rounded-[7px] text-[#71809a] outline-none transition-colors hover:bg-[#f3f6fa] hover:text-[#43516a] focus-visible:bg-[#edf3ff] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/25"
              onClick={(event) => {
                event.stopPropagation();
                onValueChange("");
              }}
              type="button"
            >
              <FiX aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>

        <Popover.Portal>
          <Popover.Content
            align="start"
            aria-label={label}
            className="z-50 mt-1 w-[min(17rem,calc(100vw-2rem))] overflow-hidden rounded-[10px] border border-[#d9e1ec] bg-white p-1.5 shadow-[0_18px_45px_rgb(31_62_119/14%)]"
            role="dialog"
            sideOffset={6}
          >
            <div className="grid grid-cols-2 divide-x divide-[#e7ecf3]">
              <div aria-label={label} className="min-w-0 px-1.5" role="group">
                <p aria-hidden="true" className="px-1.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-[#7c8aa1]">HH</p>
                <div className="grid max-h-44 grid-cols-3 gap-1 overflow-y-auto overscroll-contain pr-1" role="group">
                  {Array.from({ length: 24 }, (_, hour) => {
                    const selected = time?.hour === hour;
                    const formatted = formatTransactionFormTime(timeValue(hour, selectedMinute), locale);

                    return (
                      <button
                        aria-label={formatted}
                        aria-pressed={selected}
                        className={cn(
                          "h-8 rounded-[6px] text-[12px] font-medium tabular-nums outline-none transition-colors hover:bg-[#edf3ff] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/35",
                          selected ? "bg-[#2563eb] text-white hover:bg-[#1e55d1]" : "text-[#43516a]",
                        )}
                        key={hour}
                        onClick={() => chooseHour(hour)}
                        type="button"
                      >
                        {String(hour).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div aria-label={label} className="min-w-0 px-1.5" role="group">
                <p aria-hidden="true" className="px-1.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-[#7c8aa1]">MM</p>
                <div className="grid max-h-44 grid-cols-3 gap-1 overflow-y-auto overscroll-contain pl-1" role="group">
                  {Array.from({ length: 60 }, (_, minute) => {
                    const selected = time?.minute === minute;
                    const formatted = formatTransactionFormTime(timeValue(selectedHour, minute), locale);

                    return (
                      <button
                        aria-label={formatted}
                        aria-pressed={selected}
                        className={cn(
                          "h-8 rounded-[6px] text-[12px] font-medium tabular-nums outline-none transition-colors hover:bg-[#edf3ff] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/35",
                          selected ? "bg-[#2563eb] text-white hover:bg-[#1e55d1]" : "text-[#43516a]",
                        )}
                        key={minute}
                        onClick={() => chooseMinute(minute)}
                        type="button"
                      >
                        {String(minute).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {error ? <p className="text-[12px] leading-5 text-[#c23445]" id={errorId}>{error}</p> : null}
    </div>
  );
}
