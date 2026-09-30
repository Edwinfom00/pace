"use client";

import * as React from "react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "cmdk";
import { Popover } from "radix-ui";
import { FiCheck, FiChevronDown } from "react-icons/fi";

import { cn } from "@/lib/utils";

export type MultiSelectOption<T extends string = string> = {
  readonly value: T;
  readonly label: string;
  readonly searchTerms?: readonly string[];
  readonly icon?: React.ReactNode;
  readonly disabled?: boolean;
};

type PaceMultiSelectProps<T extends string> = {
  readonly ariaLabel: string;
  readonly emptyLabel: string;
  readonly onValueChange: (value: readonly T[]) => void;
  readonly options: readonly MultiSelectOption<T>[];
  readonly placeholder: string;
  readonly searchPlaceholder: string;
  readonly triggerClassName?: string;
  readonly value: readonly T[];
};

export function PaceMultiSelect<T extends string>({
  ariaLabel,
  emptyLabel,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  triggerClassName,
  value,
}: PaceMultiSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const listboxId = React.useId();
  const selected = options.filter((option) => value.includes(option.value));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        [option.label, option.value, ...(option.searchTerms ?? [])]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : options;
  const toggle = (option: MultiSelectOption<T>) => {
    if (option.disabled) return;
    onValueChange(
      value.includes(option.value)
        ? value.filter((item) => item !== option.value)
        : [...value, option.value],
    );
  };

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>
        <button
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-[8px] border border-[#dce4ef] bg-white px-3 text-left text-[13px] outline-none transition-colors hover:border-[#bac9df] focus-visible:border-[#2867e8] focus-visible:ring-2 focus-visible:ring-[#2867e8]/15",
            triggerClassName,
          )}
          type="button">
          {selected.length ? (
            <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              {selected.slice(0, 2).map((option) => (
                <span
                  className="flex min-w-0 items-center gap-1 rounded-[5px] bg-[#edf3ff] py-0.5 pr-1.5 pl-1 text-[12px] font-medium text-[#2867e8]"
                  key={option.value}>
                  {option.icon ? (
                    <span className="shrink-0 text-[#2867e8]">
                      {option.icon}
                    </span>
                  ) : null}
                  <span className="truncate">{option.label}</span>
                </span>
              ))}
              {selected.length > 2 ? (
                <span className="shrink-0 text-[12px] font-medium text-[#526987]">
                  +{selected.length - 2}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-[#71809a]">{placeholder}</span>
          )}
          <FiChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-[#60769e] transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-50 mt-1 w-(--radix-popover-trigger-width) overflow-hidden rounded-[8px] border border-[#dce4ef] bg-white p-1.5 shadow-[0_8px_20px_rgb(15_23_42/10%)]"
          sideOffset={5}>
          <Command shouldFilter={false}>
            <div className="mb-1.5 flex items-center rounded-[6px] border border-[#e1e8f2] bg-[#fbfcfe] px-2.5">
              <CommandInput
                aria-label={searchPlaceholder}
                className="h-9 w-full border-0 bg-transparent text-[13px] text-[#263550] outline-none placeholder:text-[#71809a]"
                onValueChange={setQuery}
                placeholder={searchPlaceholder}
                value={query}
              />
            </div>
            <CommandList
              className="max-h-64 overflow-y-auto overscroll-contain p-0.5"
              id={listboxId}
              role="listbox">
              <CommandEmpty className="px-3 py-7 text-center text-[13px] text-[#71809a]">
                {emptyLabel}
              </CommandEmpty>
              {filteredOptions.map((option) => {
                const checked = value.includes(option.value);
                return (
                  <CommandItem
                    aria-selected={checked}
                    className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] text-[#263550] outline-none data-[selected=true]:bg-[#f4f7fb] data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50"
                    disabled={option.disabled}
                    key={option.value}
                    onSelect={() => toggle(option)}
                    value={option.label}>
                    {option.icon ? (
                      <span className="shrink-0 text-[#526987]">
                        {option.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-[5px] border",
                        checked
                          ? "border-[#2867e8] bg-[#2867e8] text-white"
                          : "border-[#aab7c9] bg-white",
                      )}>
                      {checked ? <FiCheck className="size-3.5" /> : null}
                    </span>
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
