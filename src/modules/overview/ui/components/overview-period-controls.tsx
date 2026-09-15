"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { FiChevronDown, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { DashboardLabels } from "@/i18n/dashboard-messages";

export function shiftOverviewPeriodKey(periodKey: string, offset: number): string {
  const [year, month] = periodKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function OverviewPeriodControls({
  currentPeriodKey,
  labels,
  locale,
  periodKey,
}: {
  currentPeriodKey: string;
  labels: DashboardLabels;
  locale: string;
  periodKey: string;
}) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(Number(periodKey.slice(0, 4)));
  const [isPending, startTransition] = useTransition();
  const selectedMonth = Number(periodKey.slice(5, 7));
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(`${periodKey}-01T12:00:00Z`)),
    [locale, periodKey],
  );
  const monthLabels = useMemo(
    () => Array.from({ length: 12 }, (_, index) =>
      new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" })
        .format(new Date(Date.UTC(pickerYear, index, 1)))
        .replace(".", ""),
    ),
    [locale, pickerYear],
  );

  useEffect(() => {
    if (!isPickerOpen) return;
    const dismissPicker = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setIsPickerOpen(false);
    };
    document.addEventListener("pointerdown", dismissPicker);
    return () => document.removeEventListener("pointerdown", dismissPicker);
  }, [isPickerOpen]);

  const selectPeriod = (nextPeriod: string) => {
    if (nextPeriod === periodKey) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextPeriod === currentPeriodKey) nextParams.delete("period");
    else nextParams.set("period", nextPeriod);
    const query = nextParams.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  const chooseMonth = (month: number) => {
    selectPeriod(`${pickerYear}-${String(month).padStart(2, "0")}`);
    setIsPickerOpen(false);
  };

  const openPicker = () => {
    setPickerYear(Number(periodKey.slice(0, 4)));
    setIsPickerOpen(true);
  };

  return (
    <section
      aria-busy={isPending}
      aria-label={labels["overview.period.label"]}
      className="flex items-center justify-between gap-3"
    >
      <div
        className="relative min-w-0"
        onKeyDown={(event) => event.key === "Escape" && setIsPickerOpen(false)}
        ref={pickerRef}
      >
        <button
          aria-expanded={isPickerOpen}
          aria-haspopup="dialog"
          className="flex min-w-0 items-center gap-1.5 rounded-[7px] text-left outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65"
          disabled={isPending}
          onClick={openPicker}
          type="button"
        >
          <span className="truncate text-[28px] leading-9 font-semibold tracking-[-0.035em] text-[#101a35] sm:text-[30px]">
            {monthLabel}
          </span>
          <FiChevronDown aria-hidden="true" className="size-[18px] shrink-0 text-[#52617b]" />
        </button>
        {isPending ? (
          <span aria-hidden="true" className="absolute top-[calc(100%+4px)] left-0 h-0.5 w-full overflow-hidden rounded-full bg-[#dce8fb]">
            <span className="block h-full w-2/3 animate-pulse rounded-full bg-[#2f75e8] motion-reduce:animate-none" />
          </span>
        ) : null}
        {isPickerOpen ? (
          <div
            aria-label={labels["overview.period.label"]}
            className="absolute top-[calc(100%+10px)] left-0 z-20 w-[276px] rounded-[10px] border border-[#dce3ee] bg-white p-3 shadow-[0_6px_8px_rgb(16_24_40/10%)]"
            role="dialog"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                aria-label={labels["overview.period.previousYear"]}
                className="grid size-7 place-items-center rounded-[6px] text-[#667085] outline-none transition-colors hover:bg-[#f3f6fa] hover:text-[#34405d] focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                disabled={isPending}
                onClick={() => setPickerYear((year) => year - 1)}
                type="button"
              >
                <FiChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <p className="text-[14px] font-semibold text-[#25314a]">{pickerYear}</p>
              <button
                aria-label={labels["overview.period.nextYear"]}
                className="grid size-7 place-items-center rounded-[6px] text-[#667085] outline-none transition-colors hover:bg-[#f3f6fa] hover:text-[#34405d] focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                disabled={isPending}
                onClick={() => setPickerYear((year) => year + 1)}
                type="button"
              >
                <FiChevronRight aria-hidden="true" className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1" role="group">
              {monthLabels.map((label, index) => {
                const month = index + 1;
                const selected = pickerYear === Number(periodKey.slice(0, 4)) && month === selectedMonth;
                return (
                  <button
                    aria-pressed={selected}
                    className={selected
                      ? "h-9 rounded-[7px] bg-[#2f75e8] text-[13px] font-semibold text-white outline-none transition-colors hover:bg-[#2368d7] focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-2"
                      : "h-9 rounded-[7px] text-[13px] font-medium text-[#44516a] outline-none transition-colors hover:bg-[#f1f5fb] hover:text-[#1f5fcd] focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-2"}
                    key={`${pickerYear}-${month}`}
                    disabled={isPending}
                    onClick={() => chooseMonth(month)}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end border-t border-[#edf0f5] pt-2.5">
              <button
                className="rounded-[6px] px-2 py-1 text-[13px] font-medium text-[#2166dc] outline-none transition-colors hover:bg-[#edf4ff] focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                disabled={isPending}
                onClick={() => {
                  selectPeriod(currentPeriodKey);
                  setIsPickerOpen(false);
                }}
                type="button"
              >
                {labels["overview.period.thisMonth"]}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          aria-label={labels["overview.period.previous"]}
          className="grid size-8 place-items-center rounded-[7px] border border-[#e5eaf1] bg-white text-[#52617b] outline-none transition-colors hover:border-[#d4ddea] hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-2"
          disabled={isPending}
          onClick={() => selectPeriod(shiftOverviewPeriodKey(periodKey, -1))}
          type="button"
        >
          <FiChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <button
          aria-label={labels["overview.period.next"]}
          className="grid size-8 place-items-center rounded-[7px] border border-[#e5eaf1] bg-white text-[#52617b] outline-none transition-colors hover:border-[#d4ddea] hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-2"
          disabled={isPending}
          onClick={() => selectPeriod(shiftOverviewPeriodKey(periodKey, 1))}
          type="button"
        >
          <FiChevronRight aria-hidden="true" className="size-4" />
        </button>
        <button
          className="ml-1 h-8 rounded-[7px] border border-[#e5eaf1] bg-white px-3 text-[13px] font-medium text-[#34405d] outline-none transition-colors hover:border-[#d4ddea] hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-2"
          disabled={isPending}
          onClick={() => selectPeriod(currentPeriodKey)}
          type="button"
        >
          {labels["overview.period.today"]}
        </button>
      </div>
      <span aria-live="polite" className="sr-only" role="status">
        {isPending ? labels["overview.period.loading"] : ""}
      </span>
    </section>
  );
}
