"use client";

import { Popover } from "radix-ui";
import { FiCheck, FiChevronDown } from "react-icons/fi";

import {
  FORECAST_HORIZONS,
  type ForecastHorizonDays,
} from "@/modules/forecast/domain/forecast";
import { cn } from "@/lib/utils";

export function ForecastHorizonSelect({
  label,
  optionLabel,
  onChange,
  value,
}: {
  label: string;
  optionLabel: (horizon: ForecastHorizonDays) => string;
  onChange: (horizon: ForecastHorizonDays) => void;
  value: ForecastHorizonDays;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={`${label}: ${optionLabel(value)}`}
          className="group inline-flex h-10 min-w-40 items-center gap-2 rounded-[10px] border border-[#d8e0eb] bg-white px-3 text-left text-[13px] font-semibold text-[#1c3154] shadow-[0_1px_2px_rgb(20_44_84/5%)] transition-colors hover:border-[#9eb4d3] focus-visible:border-[#1769e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769e8] data-[state=open]:border-[#1769e8] data-[state=open]:ring-3 data-[state=open]:ring-[#1769e8]/12"
          type="button">
          <span className="min-w-0 flex-1 truncate">{optionLabel(value)}</span>
          <FiChevronDown
            aria-hidden
            className="size-4 shrink-0 text-[#40577d] transition-transform duration-200 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className="z-50 w-(--radix-popover-trigger-width) min-w-44 overflow-hidden rounded-[10px] border border-[#dbe3ee] bg-white p-1 shadow-[0_10px_24px_rgb(24_52_94/14%)]"
          sideOffset={6}>
          <div aria-label={label} role="menu">
            {FORECAST_HORIZONS.map((horizon) => {
              const selected = horizon === value;
              return (
                <Popover.Close asChild key={horizon}>
                  <button
                    aria-checked={selected}
                    className={cn(
                      "flex min-h-9 w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-[13px] font-medium text-[#243958] transition-colors hover:bg-[#f2f6fc] focus-visible:bg-[#f2f6fc] focus-visible:outline-none",
                      selected && "bg-[#eaf2ff] font-semibold text-[#1769e8] hover:bg-[#eaf2ff] focus-visible:bg-[#eaf2ff]",
                    )}
                    onClick={() => onChange(horizon)}
                    role="menuitemradio"
                    type="button">
                    <span className="min-w-0 flex-1 truncate">{optionLabel(horizon)}</span>
                    {selected ? <FiCheck aria-hidden className="size-4 shrink-0" /> : null}
                  </button>
                </Popover.Close>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
