"use client";

import { ACCOUNT_LIST_FILTERS, type AccountListFilter } from "@/modules/accounts/domain/accounts-overview";
import type { AccountsUiLabels } from "@/modules/accounts/ui/accounts-ui-labels";

import { useAccountsFilterLoading } from "./accounts-filter-loading";

export function AccountsFilterTabs({
  counts,
  labels,
}: {
  readonly counts: Readonly<Record<AccountListFilter, number>>;
  readonly labels: AccountsUiLabels;
}) {
  const { activeFilter, isLoading, selectFilter } = useAccountsFilterLoading();
  return (
    <div aria-label={labels.filtersLabel} className="flex flex-wrap gap-2" role="tablist">
      {ACCOUNT_LIST_FILTERS.map((filter) => {
        const selected = activeFilter === filter;
        return (
          <button
            aria-selected={selected}
            className={selected
              ? "inline-flex h-9 items-center gap-2 rounded-[9px] border border-[#d8e5fb] bg-[#edf4ff] px-3 text-[13px] font-semibold text-[#205bcc]"
              : "inline-flex h-9 items-center gap-2 rounded-[9px] border border-[#e0e5ed] bg-white px-3 text-[13px] font-medium text-[#53627b] transition-colors hover:border-[#cbd6e5] hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"}
            disabled={isLoading}
            key={filter}
            onClick={() => selectFilter(filter)}
            role="tab"
            type="button"
          >
            <span>{labels.filters[filter]}</span>
            <span className={selected ? "grid min-w-5 place-items-center rounded-full bg-[#dceaff] px-1 text-[11px] leading-5 text-[#205bcc]" : "grid min-w-5 place-items-center rounded-full bg-[#f0f3f7] px-1 text-[11px] leading-5 text-[#697992]"}>{counts[filter]}</span>
          </button>
        );
      })}
    </div>
  );
}
