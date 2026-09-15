"use client";

import * as React from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "cmdk";
import { Popover } from "radix-ui";
import { FiCheck, FiChevronDown } from "react-icons/fi";

import { cn } from "@/lib/utils";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  searchTerms?: string[];
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
};

type PaceSearchSelectProps<T extends string> = {
  id?: string;
  describedBy?: string;
  value: T | "";
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel?: string;
  ariaLabel: string;
  renderOption?: (option: SelectOption<T>, selected: boolean) => React.ReactNode;
  renderValue?: (option: SelectOption<T>) => React.ReactNode;
  triggerClassName?: string;
  invalid?: boolean;
};

/**
 * The shared Pace combobox intentionally keeps the database value separate
 * from the localized label. cmdk supplies the expected arrow/Enter/Escape
 * keyboard behavior while Radix Popover restores focus to its trigger.
 */
export function PaceSearchSelect<T extends string>({
  id,
  describedBy,
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  ariaLabel,
  renderOption,
  renderValue,
  triggerClassName,
  invalid = false,
}: PaceSearchSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const listboxId = React.useId();
  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        [option.label, option.value, option.description, ...(option.searchTerms ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : options;

  function choose(nextValue: T) {
    onValueChange(nextValue);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          aria-describedby={describedBy}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          data-invalid={invalid || undefined}
          role="combobox"
          className={cn(
            "flex h-14 w-full items-center gap-3 rounded-[10px] border bg-white px-4 text-left text-[15px] font-medium text-[#13213f] outline-none transition-colors",
            "border-[#d9e2ef] hover:border-[#bac9df] focus-visible:border-[#3973ef] focus-visible:ring-4 focus-visible:ring-[#3973ef]/10",
            "data-[invalid=true]:border-red-400 data-[invalid=true]:ring-4 data-[invalid=true]:ring-red-100",
            triggerClassName,
          )}
          type="button"
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? (
              renderValue ? (
                renderValue(selected)
              ) : (
                <span className="flex items-center gap-3">
                  {selected.icon}
                  <span className="truncate">{selected.label}</span>
                </span>
              )
            ) : (
              <span className="font-normal text-[#7b8bab]">{placeholder}</span>
            )}
          </span>
          <FiChevronDown aria-hidden className={cn("size-5 shrink-0 text-[#60769e] transition-transform", open && "rotate-180")} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-50 mt-1 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border border-[#d9e2ef] bg-white p-1.5 shadow-[0_18px_45px_rgba(31,62,119,0.14)]"
          sideOffset={6}
        >
          <Command shouldFilter={false}>
            <div className="mb-1.5 flex items-center rounded-lg border border-[#e2e9f3] bg-[#f8faff] px-3">
              <CommandInput
                aria-label={searchPlaceholder}
                className="h-10 w-full border-0 bg-transparent text-sm text-[#172442] outline-none placeholder:text-[#8190ab]"
                onValueChange={setQuery}
                placeholder={searchPlaceholder}
                value={query}
              />
            </div>
            <CommandList className="max-h-64 overflow-y-auto overscroll-contain p-0.5" id={listboxId} role="listbox">
              {emptyLabel ? (
                <CommandEmpty className="px-3 py-8 text-center text-sm text-[#7182a1]">
                  {emptyLabel}
                </CommandEmpty>
              ) : null}
              {filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <CommandItem
                    aria-selected={isSelected}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-[#172442] outline-none",
                      "data-[selected=true]:bg-[#edf3ff] data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50",
                    )}
                    disabled={option.disabled}
                    key={option.value}
                    onSelect={() => choose(option.value)}
                    value={option.value}
                  >
                    <span className="min-w-0 flex-1">
                      {renderOption ? (
                        renderOption(option, isSelected)
                      ) : (
                        <span className="flex items-center gap-3">
                          {option.icon}
                          <span className="truncate">{option.label}</span>
                        </span>
                      )}
                    </span>
                    {isSelected ? <FiCheck aria-hidden className="size-4 shrink-0 text-[#2f67e9]" /> : null}
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
