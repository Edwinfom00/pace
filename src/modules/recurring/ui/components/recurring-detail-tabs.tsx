"use client";

import { useOptimistic, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FilterLoadingSurface } from "@/components/pace/shared/filter-loading-surface";

import {
  RECURRING_DETAIL_TABS,
  type RecurringDetailTab,
} from "../../domain/recurring-detail";
import type { RecurringDetailUiLabels } from "../recurring-detail-ui-labels";

export function RecurringDetailTabs({
  children,
  labels,
  selectedTab,
}: {
  readonly children: ReactNode;
  readonly labels: Pick<RecurringDetailUiLabels, "details" | "tabs">;
  readonly selectedTab: RecurringDetailTab;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useOptimistic(selectedTab, (_current, next: RecurringDetailTab) => next);

  function selectTab(tab: RecurringDetailTab) {
    if (tab === activeTab || isPending) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    if (tab === "overview") nextParams.delete("tab");
    else nextParams.set("tab", tab);
    const query = nextParams.toString();
    startTransition(() => {
      setActiveTab(tab);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return (
    <FilterLoadingSurface isLoading={isPending} label={labels.tabs[activeTab]}>
      <div>
        <div aria-label={labels.details} className="overflow-x-auto border-b border-[#e4e9f0]" role="tablist">
          <div className="flex min-w-max gap-5 px-1">
            {RECURRING_DETAIL_TABS.map((tab) => {
              const selected = activeTab === tab;
              return (
                <button
                  aria-controls={`recurring-detail-panel-${tab}`}
                  aria-selected={selected}
                  className={selected
                    ? "relative border-b-2 border-[#2f6fed] px-1 py-3 text-[13px] font-semibold text-[#1f5ec7]"
                    : "relative border-b-2 border-transparent px-1 py-3 text-[13px] font-medium text-[#66758e] transition-colors hover:text-[#263756] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2563eb]"}
                  disabled={isPending}
                  id={`recurring-detail-tab-${tab}`}
                  key={tab}
                  onClick={() => selectTab(tab)}
                  role="tab"
                  type="button"
                >
                  {labels.tabs[tab]}
                </button>
              );
            })}
          </div>
        </div>
        <div aria-labelledby={`recurring-detail-tab-${activeTab}`} id={`recurring-detail-panel-${activeTab}`} role="tabpanel">
          {children}
        </div>
      </div>
    </FilterLoadingSurface>
  );
}
