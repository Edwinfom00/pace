"use client";

import { useId, useMemo, useState, type RefObject } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "cmdk";
import { Popover } from "radix-ui";
import { FiCheck, FiChevronDown } from "react-icons/fi";

import { cn } from "@/lib/utils";
import {
  CURRENCY_CATALOG,
  getLocalizedCurrencyName,
  type CurrencyCode,
} from "@/money/currency";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";

type TransactionCurrencySelectorProps = {
  readonly ariaLabel: string;
  readonly describedBy?: string;
  readonly disabled?: boolean;
  readonly emptyLabel: string;
  readonly invalid?: boolean;
  readonly language: OnboardingLanguage;
  readonly onValueChange: (currency: CurrencyCode) => void;
  readonly searchPlaceholder: string;
  readonly triggerRef?: RefObject<HTMLButtonElement | null>;
  readonly value: CurrencyCode;
};

export function getTransactionCurrencyOptions(language: OnboardingLanguage) {
  return CURRENCY_CATALOG.map((currency) => ({
    ...currency,
    localizedName: getLocalizedCurrencyName(currency.code, language),
  }));
}

export function TransactionCurrencySelector({
  ariaLabel,
  describedBy,
  disabled = false,
  emptyLabel,
  invalid = false,
  language,
  onValueChange,
  searchPlaceholder,
  triggerRef,
  value,
}: TransactionCurrencySelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listboxId = useId();
  const options = useMemo(() => getTransactionCurrencyOptions(language), [language]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((currency) =>
        [currency.code, currency.localizedName, currency.englishName, currency.nativeName, currency.symbol]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : options;

  function choose(currency: CurrencyCode) {
    onValueChange(currency);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>
        <button
          aria-controls={listboxId}
          aria-describedby={describedBy}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            "flex min-w-22 cursor-pointer items-center justify-center gap-1.5 px-3 text-[13px] font-semibold text-[#263550] outline-none transition-colors hover:bg-[#f7f9fc] focus-visible:bg-[#f7f9fc] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5e8fe8] disabled:cursor-default disabled:text-[#526987] disabled:hover:bg-transparent sm:min-w-26 sm:px-4",
            invalid && "text-[#a83142] focus-visible:ring-[#c55b68]",
          )}
          ref={triggerRef}
          role="combobox"
          type="button"
        >
          <span>{value}</span>
          <FiChevronDown aria-hidden="true" className={cn("size-4 text-[#5f6f88] transition-transform", open && "rotate-180")} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className="z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-[10px] border border-[#dfe6f0] bg-white p-1.5 shadow-[0_12px_26px_rgb(15_23_42/12%)]"
          sideOffset={8}
        >
          <Command shouldFilter={false}>
            <div className="mb-1.5 flex items-center rounded-[7px] border border-[#e2e8f1] bg-[#f8faff] px-3">
              <CommandInput
                aria-label={searchPlaceholder}
                className="h-9 w-full border-0 bg-transparent text-[13px] text-[#263550] outline-none placeholder:text-[#7d8ba2]"
                onValueChange={setQuery}
                placeholder={searchPlaceholder}
                value={query}
              />
            </div>
            <CommandList className="max-h-60 overflow-y-auto overscroll-contain p-0.5" id={listboxId} role="listbox">
              <CommandEmpty className="px-3 py-7 text-center text-[13px] text-[#71809a]">{emptyLabel}</CommandEmpty>
              {filteredOptions.map((currency) => {
                const selected = currency.code === value;
                return (
                  <CommandItem
                    aria-selected={selected}
                    className="flex min-h-10 cursor-pointer items-center gap-3 rounded-[7px] px-2.5 py-2 text-[13px] text-[#263550] outline-none data-[selected=true]:bg-[#f0f5ff]"
                    key={currency.code}
                    onSelect={() => choose(currency.code)}
                    value={currency.code}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{currency.code}</span>
                      <span className="block truncate text-[11px] leading-4 text-[#71809a]">{currency.localizedName}</span>
                    </span>
                    {selected ? <FiCheck aria-hidden="true" className="size-4 shrink-0 text-[#2867df]" /> : null}
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
