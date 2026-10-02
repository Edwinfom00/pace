"use client";

import { Popover } from "radix-ui";
import { FiCheck, FiChevronDown } from "react-icons/fi";

import type { ForecastAccountOption } from "@/modules/forecast/domain/forecast";
import { cn } from "@/lib/utils";

export function ForecastAccountFilter({
  accounts,
  allAccountsLabel,
  label,
  onChange,
  value,
}: {
  accounts: readonly ForecastAccountOption[];
  allAccountsLabel: string;
  label: string;
  onChange: (accountId: string) => void;
  value: string | null;
}) {
  const selected = accounts.find((account) => account.id === value);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={label}
          className="group inline-flex h-9 min-w-40 items-center gap-2 rounded-[9px] border border-[#d8e0eb] bg-white px-3 text-left text-[13px] font-semibold text-[#1c3154] shadow-[0_1px_2px_rgb(20_44_84/5%)] transition-colors hover:border-[#9eb4d3] hover:bg-[#fbfdff] focus-visible:border-[#1769e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769e8] data-[state=open]:border-[#1769e8] data-[state=open]:ring-3 data-[state=open]:ring-[#1769e8]/12"
          type="button">
          <span className="min-w-0 flex-1 truncate">
            {selected ? `${selected.name} (${selected.currency})` : allAccountsLabel}
          </span>
          <FiChevronDown aria-hidden className="size-4 shrink-0 text-[#40577d] transition-transform duration-200 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className="z-50 w-(--radix-popover-trigger-width) min-w-52 overflow-hidden rounded-[10px] border border-[#dbe3ee] bg-white p-1 shadow-[0_8px_18px_rgb(24_52_94/14%)]"
          sideOffset={5}>
          <div aria-label={label} role="menu">
            <AccountOption
              label={allAccountsLabel}
              onSelect={() => onChange("")}
              selected={!value}
            />
            {accounts.map((account) => (
              <AccountOption
                key={account.id}
                label={`${account.name} (${account.currency})`}
                onSelect={() => onChange(account.id)}
                selected={account.id === value}
              />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AccountOption({
  label,
  onSelect,
  selected,
}: {
  label: string;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <Popover.Close asChild>
      <button
        aria-checked={selected}
        className={cn(
          "flex min-h-10 w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[13px] font-medium text-[#243958] transition-colors hover:bg-[#edf4ff] focus-visible:bg-[#edf4ff] focus-visible:outline-none",
          selected && "bg-[#eaf2ff] font-semibold text-[#1769e8] hover:bg-[#eaf2ff] focus-visible:bg-[#eaf2ff]",
        )}
        onClick={onSelect}
        role="menuitemradio"
        type="button">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {selected ? <FiCheck aria-hidden className="size-4 shrink-0" /> : null}
      </button>
    </Popover.Close>
  );
}
