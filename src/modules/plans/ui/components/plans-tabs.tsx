"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { FilterLoadingSurface } from "@/components/pace/shared/filter-loading-surface";

type PlansTabsLabels = {
  readonly title: string;
  readonly all: string;
  readonly budgets: string;
  readonly goals: string;
  readonly forecasts: string;
  readonly rules: string;
  readonly loading: string;
  readonly unavailable: string;
};

export function PlansTabs({
  budgetContent,
  goalContent,
  allContent,
  unavailableContent,
  labels,
}: {
  readonly budgetContent: ReactNode;
  readonly goalContent: ReactNode;
  readonly allContent: ReactNode;
  readonly unavailableContent: ReactNode;
  readonly labels: PlansTabsLabels;
}) {
  const [activeTab, setActiveTab] = useState<"all" | "budgets" | "goals" | "forecasts" | "rules">("all");
  const [isLoading, setIsLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const select = (next: "all" | "budgets" | "goals" | "forecasts" | "rules") => {
    if (next === activeTab) return;
    if (timer.current) clearTimeout(timer.current);
    setIsLoading(true);
    timer.current = setTimeout(() => {
      setActiveTab(next);
      setIsLoading(false);
    }, 180);
  };

  return (
    <>
      <nav aria-label={labels.title} className="mt-5 flex overflow-x-auto border-b border-[#e5e9f0]" role="tablist">
        <button aria-controls="plans-all-panel" aria-selected={activeTab === "all"} className={`border-b-2 px-6 py-2.5 text-[13px] font-medium ${activeTab === "all" ? "border-[#2867e8] bg-[#eff5ff] text-[#2867e8]" : "border-transparent text-[#62718a] hover:text-[#2867e8]"}`} onClick={() => select("all")} role="tab" type="button">{labels.all}</button>
        <button aria-controls="plans-budgets-panel" aria-selected={activeTab === "budgets"} className={`border-b-2 px-6 py-2.5 text-[13px] font-medium ${activeTab === "budgets" ? "border-[#2867e8] bg-[#eff5ff] text-[#2867e8]" : "border-transparent text-[#62718a] hover:text-[#2867e8]"}`} onClick={() => select("budgets")} role="tab" type="button">{labels.budgets}</button>
        <button aria-controls="plans-goals-panel" aria-selected={activeTab === "goals"} className={`border-b-2 px-6 py-2.5 text-[13px] font-medium ${activeTab === "goals" ? "border-[#2867e8] bg-[#eff5ff] text-[#2867e8]" : "border-transparent text-[#62718a] hover:text-[#2867e8]"}`} onClick={() => select("goals")} role="tab" type="button">{labels.goals}</button>
        <button aria-controls="plans-forecasts-panel" aria-selected={activeTab === "forecasts"} className={`border-b-2 px-6 py-2.5 text-[13px] font-medium ${activeTab === "forecasts" ? "border-[#2867e8] bg-[#eff5ff] text-[#2867e8]" : "border-transparent text-[#62718a] hover:text-[#2867e8]"}`} onClick={() => select("forecasts")} role="tab" type="button">{labels.forecasts}</button>
        <button aria-controls="plans-rules-panel" aria-selected={activeTab === "rules"} className={`border-b-2 px-6 py-2.5 text-[13px] font-medium ${activeTab === "rules" ? "border-[#2867e8] bg-[#eff5ff] text-[#2867e8]" : "border-transparent text-[#62718a] hover:text-[#2867e8]"}`} onClick={() => select("rules")} role="tab" type="button">{labels.rules}</button>
      </nav>
      <FilterLoadingSurface isLoading={isLoading} label={labels.loading}>
        <div className="mt-5" aria-hidden={activeTab !== "all" || undefined} hidden={activeTab !== "all"} id="plans-all-panel" role="tabpanel">{allContent}</div>
        <div className="mt-5" aria-hidden={activeTab !== "budgets" || undefined} hidden={activeTab !== "budgets"} id="plans-budgets-panel" role="tabpanel">{budgetContent}</div>
        <div className="mt-5" aria-hidden={activeTab !== "goals" || undefined} hidden={activeTab !== "goals"} id="plans-goals-panel" role="tabpanel">{goalContent}</div>
        <div className="mt-5" aria-hidden={activeTab !== "forecasts" || undefined} hidden={activeTab !== "forecasts"} id="plans-forecasts-panel" role="tabpanel">{unavailableContent}</div>
        <div className="mt-5" aria-hidden={activeTab !== "rules" || undefined} hidden={activeTab !== "rules"} id="plans-rules-panel" role="tabpanel">{unavailableContent}</div>
      </FilterLoadingSurface>
    </>
  );
}
