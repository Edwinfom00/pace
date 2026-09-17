"use client";

import * as React from "react";
import { Command, CommandInput, CommandItem, CommandList } from "cmdk";
import { Popover } from "radix-ui";
import {
  FiCheck,
  FiChevronDown,
  FiDollarSign,
  FiPlus,
} from "react-icons/fi";

import { cn } from "@/lib/utils";
import type { LedgerAccountType } from "@/modules/ledger/domain";

import { getAccountTypeMetadata } from "./transaction-account-metadata";
import type { TransactionAccountOption } from "./transaction-account.types";

export type TransactionAccountFieldProps<T extends string = string> = {
  readonly accounts: readonly (TransactionAccountOption & { readonly id: T })[];
  readonly accountTypeLabels: Readonly<Record<LedgerAccountType, string>>;
  readonly disabledAccountIds?: readonly T[];
  readonly disabledAccountLabel?: string;
  readonly emptyDescription: string;
  readonly emptyTitle: string;
  readonly helperText?: string;
  readonly label: string;
  readonly noResultsLabel: string;
  readonly onCreateAccount: () => void;
  readonly onValueChange: (value: T) => void;
  readonly placeholder: string;
  /** Reserved for the later currency-eligibility policy. */
  readonly preferredCurrency?: string;
  readonly searchPlaceholder: string;
  readonly triggerRef?: React.RefObject<HTMLButtonElement | null>;
  readonly value: T | "";
  readonly createAccountLabel: string;
  readonly createFirstAccountLabel: string;
};

function AccountIcon({ type }: { readonly type: LedgerAccountType }) {
  const { icon: Icon } = getAccountTypeMetadata(type);

  return <Icon aria-hidden="true" className="size-[17px]" />;
}

function getAccountMetadata(account: TransactionAccountOption, accountTypeLabels: Readonly<Record<LedgerAccountType, string>>) {
  const typeLabel = accountTypeLabels[account.type];

  return account.type === "CASH" ? account.currency : `${typeLabel} · ${account.currency}`;
}


export function TransactionAccountField<T extends string = string>({
  accounts,
  accountTypeLabels,
  createAccountLabel,
  createFirstAccountLabel,
  disabledAccountIds = [],
  disabledAccountLabel,
  emptyDescription,
  emptyTitle,
  helperText,
  label,
  noResultsLabel,
  onCreateAccount,
  onValueChange,
  placeholder,
  searchPlaceholder,
  triggerRef,
  value,
}: TransactionAccountFieldProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const triggerId = React.useId();
  const helperId = React.useId();
  const listboxId = React.useId();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const selectedAccount = accounts.find((account) => account.id === value);
  const disabledAccountIdSet = new Set(disabledAccountIds);
  const filteredAccounts = normalizedQuery
    ? accounts.filter((account) =>
        [account.name, account.type, getAccountMetadata(account, accountTypeLabels), account.currency]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : accounts;
  const hasAccounts = accounts.length > 0;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setQuery("");
  }

  function choose(nextValue: T) {
    if (disabledAccountIdSet.has(nextValue)) return;
    onValueChange(nextValue);
    handleOpenChange(false);
  }

  function requestCreateAccount() {
    handleOpenChange(false);
    onCreateAccount();
  }

  return (
    <div className="grid min-w-0 gap-2">
      <label className="text-[13px] font-medium text-[#384862]" htmlFor={triggerId}>
        {label}
      </label>

      <Popover.Root onOpenChange={handleOpenChange} open={open}>
        <Popover.Trigger asChild>
          <button
            aria-controls={listboxId}
            aria-describedby={helperText ? helperId : undefined}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={`${label}: ${selectedAccount?.name ?? placeholder}`}
            className={cn(
              "flex h-11 w-full items-center gap-2.5 rounded-[8px] border border-[#d9e1ec] bg-white px-3 text-left text-[13px] text-[#13213f] outline-none transition-[border-color,box-shadow] duration-150",
              "hover:border-[#bac9df] focus-visible:border-[#4e7fe3] focus-visible:ring-3 focus-visible:ring-[#5e8fe8]/15",
            )}
            id={triggerId}
            ref={triggerRef}
            role="combobox"
            type="button"
          >
            {selectedAccount ? (
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-[#edf3ff] text-[#356fe0]">
                  <AccountIcon type={selectedAccount.type} />
                </span>
                <span className="truncate font-medium">{selectedAccount.name}</span>
              </span>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-2.5 text-[#8a9ab3]">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-[#f2f5f9] text-[#526987]">
                  <FiDollarSign aria-hidden="true" className="size-[17px]" />
                </span>
                <span className="truncate">{placeholder}</span>
              </span>
            )}
            <FiChevronDown
              aria-hidden="true"
              className={cn("size-4 shrink-0 text-[#60769e] transition-transform", open && "rotate-180")}
            />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="start"
            className="z-50 mt-1 w-[var(--radix-popover-trigger-width)] min-w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-[10px] border border-[#d9e1ec] bg-white p-1.5 shadow-[0_18px_45px_rgb(31_62_119/14%)]"
            sideOffset={6}
          >
            {hasAccounts ? (
              <Command shouldFilter={false}>
                <div className="mb-1.5 flex items-center rounded-[7px] border border-[#e2e9f3] bg-[#f8faff] px-3">
                  <CommandInput
                    aria-label={searchPlaceholder}
                    className="h-10 w-full border-0 bg-transparent text-[13px] text-[#172442] outline-none placeholder:text-[#8190ab]"
                    onValueChange={setQuery}
                    placeholder={searchPlaceholder}
                    value={query}
                  />
                </div>

                <CommandList
                  className="max-h-56 overflow-y-auto overscroll-contain p-0.5"
                  id={listboxId}
                  role="listbox"
                >
                  {filteredAccounts.length > 0 ? (
                    filteredAccounts.map((account) => {
                      const isSelected = account.id === value;
                      const isDisabled = disabledAccountIdSet.has(account.id);
                      return (
                        <CommandItem
                          aria-disabled={isDisabled || undefined}
                          aria-selected={isSelected}
                          className="flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-[#172442] outline-none data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 data-[selected=true]:bg-[#edf3ff]"
                          disabled={isDisabled}
                          key={account.id}
                          onSelect={() => choose(account.id)}
                          value={`${account.name} ${account.type} ${account.currency}`}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-[7px] bg-[#f1f5fb] text-[#526987]">
                            <AccountIcon type={account.type} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{account.name}</span>
                            <span className="mt-0.5 block truncate text-[11px] leading-4 text-[#71809a]">
                              {getAccountMetadata(account, accountTypeLabels)}
                            </span>
                          </span>
                          {isDisabled ? (
                            <span className="shrink-0 text-right text-[10px] leading-4 font-medium text-[#71809a]">
                              {disabledAccountLabel}
                            </span>
                          ) : isSelected ? <FiCheck aria-hidden="true" className="size-4 shrink-0 text-[#2f67e9]" /> : null}
                        </CommandItem>
                      );
                    })
                  ) : (
                    <div className="px-3 py-8 text-center text-[13px] text-[#71809a]">{noResultsLabel}</div>
                  )}
                </CommandList>

                <div className="mt-1.5 border-t border-[#e7ecf3] pt-1.5">
                  <button
                    className="flex h-9 w-full items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] font-medium text-[#2f67e9] outline-none transition-colors hover:bg-[#edf3ff] focus-visible:bg-[#edf3ff] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/25"
                    onClick={requestCreateAccount}
                    type="button"
                  >
                    <FiPlus aria-hidden="true" className="size-4" />
                    {createAccountLabel}
                  </button>
                </div>
              </Command>
            ) : (
              <div className="px-3 py-5 text-center">
                <span className="mx-auto mb-3 flex size-9 items-center justify-center rounded-[9px] bg-[#edf3ff] text-[#356fe0]">
                  <FiDollarSign aria-hidden="true" className="size-[18px]" />
                </span>
                <p className="text-[13px] font-medium text-[#263550]">{emptyTitle}</p>
                <p className="mx-auto mt-1 max-w-[15rem] text-[12px] leading-5 text-[#71809a]">{emptyDescription}</p>
                <button
                  className="mt-4 inline-flex h-9 items-center gap-2 rounded-[7px] bg-[#edf3ff] px-3 text-[12px] font-medium text-[#2f67e9] outline-none transition-colors hover:bg-[#e4eeff] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/30"
                  onClick={requestCreateAccount}
                  type="button"
                >
                  <FiPlus aria-hidden="true" className="size-4" />
                  {createFirstAccountLabel}
                </button>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {helperText ? <p className="min-h-5 text-[12px] leading-5 text-[#71809a]" id={helperId}>{helperText}</p> : null}
    </div>
  );
}
