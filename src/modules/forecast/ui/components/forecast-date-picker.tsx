"use client";

import { Popover } from "radix-ui";
import { FiCheck, FiChevronDown } from "react-icons/fi";

import { cn } from "@/lib/utils";

export function ForecastDatePicker({
  dates,
  label,
  onChange,
  selected,
}: {
  dates: readonly string[];
  label: string;
  onChange: (index: number) => void;
  selected: number;
}) {
  const selectedDate = dates[selected] ?? dates[0];

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={label}
          className="inline-flex h-9 min-w-32 items-center gap-2 rounded-[8px] border border-[#d4deeb] bg-white px-2.5 text-left text-[12px] font-semibold text-[#243958] shadow-[0_1px_2px_rgb(20_44_84_/_4%)] transition-colors hover:border-[#aabbd2] focus-visible:border-[#1769e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769e8] data-[state=open]:border-[#1769e8]"
          type="button">
          <span className="min-w-0 flex-1 truncate">{selectedDate}</span>
          <FiChevronDown aria-hidden className="size-3.5 shrink-0 text-[#40577d]" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-50 max-h-64 w-(--radix-popover-trigger-width) overflow-y-auto rounded-[9px] border border-[#b9c8dc] bg-white p-1 shadow-[0_8px_18px_rgb(24_52_94_/_14%)]"
          sideOffset={5}>
          <div aria-label={label} role="menu">
            {dates.map((date, index) => (
              <Popover.Close asChild key={date}>
                <button
                  aria-checked={index === selected}
                  className={cn(
                    "flex min-h-9 w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[12px] font-medium text-[#243958] transition-colors hover:bg-[#edf4ff] focus-visible:bg-[#edf4ff] focus-visible:outline-none",
                    index === selected && "bg-[#1769e8] text-white hover:bg-[#1769e8] focus-visible:bg-[#1769e8]",
                  )}
                  onClick={() => onChange(index)}
                  role="menuitemradio"
                  type="button">
                  <span className="min-w-0 flex-1 truncate">{date}</span>
                  {index === selected ? <FiCheck aria-hidden className="size-3.5 shrink-0" /> : null}
                </button>
              </Popover.Close>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
