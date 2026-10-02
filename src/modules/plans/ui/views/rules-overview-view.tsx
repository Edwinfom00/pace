"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { IconType } from "react-icons";
import { Popover } from "radix-ui";
import {
  FiArrowLeft,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiInbox,
  FiLayers,
  FiPlus,
  FiSearch,
  FiZap,
} from "react-icons/fi";

import { FilterLoadingSurface } from "@/components/pace/shared/filter-loading-surface";
import { Button } from "@/components/ui/button";
import {
  RULE_STATUS_FILTERS,
  type RulesOverview,
  type RuleStatusFilter,
} from "@/modules/plans/rules/rules-overview";
import { cn } from "@/lib/utils";

import { RuleBuilderDialog, type RuleBuilderMode } from "../components/rule-builder-dialog";
import { RuleDetailPanel } from "../components/rule-detail-panel";
import { RuleManagementActions } from "../components/rule-management-actions";
import { RulesCardList, RulesTable } from "../components/rules-list";
import { RuleDetailSkeleton } from "../components/rules-skeleton";
import { statusLabel } from "../rules-format";
import type { RulesUiLabels } from "../rules-ui-labels";

const CARD = "rounded-[14px] border border-[#e5eaf1] bg-white";
const SEARCH_DEBOUNCE_MS = 300;

export function RulesOverviewView({
  labels,
  locale,
  overview,
  timeZone,
  workspaceId,
  workspaceSlug,
}: {
  readonly labels: RulesUiLabels;
  readonly locale: string;
  readonly overview: RulesOverview;
  readonly timeZone: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filtering, startFiltering] = useTransition();
  const [selecting, startSelecting] = useTransition();
  const [requestedRuleId, setRequestedRuleId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(overview.filters.query);
  const [builder, setBuilder] = useState<{ readonly mode: RuleBuilderMode; readonly session: number } | null>(null);
  const submittedQuery = useRef(overview.filters.query);

  const visible = useMemo(() => {
    const byId = new Map(overview.rules.map((rule) => [rule.id, rule]));
    return overview.visibleRuleIds.flatMap((id) => byId.get(id) ?? []);
  }, [overview.rules, overview.visibleRuleIds]);
  const selected = overview.selected;
  const selectedId = selecting && requestedRuleId ? requestedRuleId : (selected?.rule.id ?? null);
  const showDetailOnSmall = selecting ? requestedRuleId !== null : Boolean(selected?.explicit);
  const hasFilters = overview.filters.query !== "" || overview.filters.status !== "ALL";

  const navigate = (update: (params: URLSearchParams) => void, start: typeof startFiltering) => {
    const next = new URLSearchParams(searchParams.toString());
    update(next);
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  useEffect(() => {
    submittedQuery.current = overview.filters.query;
  }, [overview.filters.query]);

  useEffect(() => {
    const query = searchDraft.trim();
    if (query === submittedQuery.current) return;
    const timer = setTimeout(() => {
      submittedQuery.current = query;
      const next = new URLSearchParams(searchParams.toString());
      if (query) next.set("q", query);
      else next.delete("q");
      next.delete("rule");
      startFiltering(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pathname, router, searchDraft, searchParams]);

  const selectStatus = (status: RuleStatusFilter) =>
    navigate((params) => {
      if (status === "ALL") params.delete("status");
      else params.set("status", status.toLowerCase());
      params.delete("rule");
    }, startFiltering);
  const selectRule = (ruleId: string) => {
    setRequestedRuleId(ruleId);
    navigate((params) => params.set("rule", ruleId), startSelecting);
  };
  const clearSelection = () => {
    setRequestedRuleId(null);
    navigate((params) => params.delete("rule"), startSelecting);
  };
  const clearFilters = () => {
    submittedQuery.current = "";
    setSearchDraft("");
    navigate((params) => {
      params.delete("q");
      params.delete("status");
      params.delete("rule");
    }, startFiltering);
  };
  const refresh = () => startFiltering(() => router.refresh());
  const openBuilder = (mode: RuleBuilderMode) => setBuilder({ mode, session: Date.now() });
  const onRuleSaved = (ruleId: string) => {
    setBuilder(null);
    setRequestedRuleId(ruleId);
    navigate((params) => params.set("rule", ruleId), startSelecting);
  };
  const onStaleRule = () => {
    setBuilder(null);
    refresh();
  };

  const detail = selecting ? (
    <RuleDetailSkeleton />
  ) : selected ? (
    <RuleDetailPanel
      actions={
        <RuleManagementActions
          editAction={
            overview.builder && selected.rule.capabilities.canEdit ? (
              <Button
                className="h-9 min-w-20 rounded-[9px] border-[#d8e0eb] text-[13px]"
                onClick={() => openBuilder({ kind: "edit", rule: selected.rule })}
                type="button"
                variant="outline"
              >
                {labels.edit}
              </Button>
            ) : undefined
          }
          key={`${selected.rule.id}:${selected.rule.updatedAt}`}
          labels={labels}
          onChanged={refresh}
          rule={selected.rule}
          workspaceId={workspaceId}
        />
      }
      executions={selected.executions}
      labels={labels}
      leading={
        <button
          className="mb-4 inline-flex items-center gap-2 rounded-[6px] text-[13px] text-[#526788] hover:text-[#14213c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] xl:hidden"
          onClick={clearSelection}
          type="button"
        >
          <FiArrowLeft aria-hidden />
          {labels.back}
        </button>
      }
      locale={locale}
      rule={selected.rule}
      timeZone={timeZone}
    />
  ) : null;

  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-355">
        <div className={cn("grid gap-5", detail && "xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]")}>
          <div className={cn("min-w-0", showDetailOnSmall && "hidden xl:block")}>
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <nav aria-label={labels.plans} className="flex items-center gap-1.5 text-[12px] text-[#71809a]">
                  <Link
                    className="rounded-[4px] hover:text-[#14213c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                    href={`/w/${workspaceSlug}/plans`}
                  >
                    {labels.plans}
                  </Link>
                  <FiChevronRight aria-hidden className="size-3" />
                  <span aria-current="page" className="font-medium text-[#18243b]">
                    {labels.title}
                  </span>
                </nav>
                <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">
                  {labels.title}
                </h1>
                <p className="mt-1 max-w-xl text-[13px] leading-5 text-[#71809a]">{labels.subtitle}</p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <label className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                  <span className="sr-only">{labels.searchLabel}</span>
                  <FiSearch
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8a97ad]"
                  />
                  <input
                    className="h-10 w-full rounded-[10px] border border-[#d8e0eb] bg-white pr-3 pl-9 text-[13px] text-[#18243b] shadow-[0_1px_2px_rgb(20_44_84/5%)] placeholder:text-[#8a97ad] focus-visible:border-[#1769e8] focus-visible:ring-3 focus-visible:ring-[#1769e8]/12 focus-visible:outline-none"
                    onChange={(event) => setSearchDraft(event.target.value)}
                    placeholder={labels.searchPlaceholder}
                    type="search"
                    value={searchDraft}
                  />
                </label>
                <RulesStatusSelect labels={labels} onChange={selectStatus} value={overview.filters.status} />
                {overview.builder ? (
                  <Button
                    className="h-10 gap-1.5 rounded-[10px] bg-[#1769e8] px-4 text-[13px] font-semibold text-white hover:bg-[#145bd0]"
                    data-new-rule
                    onClick={() => openBuilder({ kind: "create" })}
                    type="button"
                  >
                    <FiPlus aria-hidden className="size-4" />
                    {labels.newRule}
                  </Button>
                ) : null}
              </div>
            </header>

            <section aria-label={labels.title} className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={FiLayers} label={labels.kpiTotal} tone="bg-[#eaf2ff] text-[#1769e8]" value={overview.kpis.total} />
              <Kpi icon={FiCheckCircle} label={labels.kpiActive} tone="bg-[#e8f7ef] text-[#14945a]" value={overview.kpis.active} />
              <Kpi icon={FiZap} label={labels.kpiApplied} tone="bg-[#f1ecff] text-[#7c4ddb]" value={overview.kpis.appliedThisMonth} />
              <Kpi icon={FiInbox} label={labels.kpiReview} tone="bg-[#fff1e5] text-[#e8730c]" value={overview.kpis.sentForReviewThisMonth} />
            </section>

            <div className="mt-4">
              <FilterLoadingSurface isLoading={filtering} label={labels.loading}>
                {visible.length ? (
                  <>
                    <div className="hidden lg:block">
                      <RulesTable
                        labels={labels}
                        locale={locale}
                        onSelect={selectRule}
                        rules={visible}
                        selectedId={selectedId}
                        timeZone={timeZone}
                      />
                    </div>
                    <div className="lg:hidden">
                      <RulesCardList labels={labels} onSelect={selectRule} rules={visible} selectedId={selectedId} />
                    </div>
                  </>
                ) : (
                  <div className={cn(CARD, "px-5 py-12 text-center")}>
                    <h2 className="text-[15px] font-semibold text-[#18243b]">
                      {hasFilters ? labels.noResultsTitle : labels.emptyTitle}
                    </h2>
                    <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-[#71809a]">
                      {hasFilters ? labels.noResultsDescription : labels.emptyDescription}
                    </p>
                    {hasFilters ? (
                      <Button className="mt-4 rounded-[9px]" onClick={clearFilters} type="button" variant="outline">
                        {labels.clearFilters}
                      </Button>
                    ) : null}
                  </div>
                )}
              </FilterLoadingSurface>
            </div>
          </div>

          {detail ? (
            <aside
              aria-label={labels.details}
              className={cn("min-w-0 xl:sticky xl:top-5 xl:self-start", showDetailOnSmall ? "block" : "hidden xl:block")}
            >
              {detail}
            </aside>
          ) : null}
        </div>
      </div>
      {builder && overview.builder ? (
        <RuleBuilderDialog
          key={builder.session}
          labels={labels}
          locale={locale}
          mode={builder.mode}
          onOpenChange={(open) => !open && setBuilder(null)}
          onSaved={onRuleSaved}
          onStale={onStaleRule}
          open
          references={overview.builder}
          timeZone={timeZone}
          workspaceId={workspaceId}
        />
      ) : null}
    </main>
  );
}

function Kpi({
  icon: Icon,
  label,
  tone,
  value,
}: {
  readonly icon: IconType;
  readonly label: string;
  readonly tone: string;
  readonly value: number;
}) {
  return (
    <div className={cn(CARD, "flex items-center gap-3 p-4")}>
      <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full", tone)}>
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[20px] font-semibold tracking-[-0.03em] text-[#101a35] tabular-nums">{value}</p>
        <p className="truncate text-[12px] text-[#53627b]">{label}</p>
      </div>
    </div>
  );
}

function RulesStatusSelect({
  labels,
  onChange,
  value,
}: {
  readonly labels: RulesUiLabels;
  readonly onChange: (status: RuleStatusFilter) => void;
  readonly value: RuleStatusFilter;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={`${labels.statusFilter}: ${statusLabel(labels, value)}`}
          className="group inline-flex h-10 min-w-36 items-center gap-2 rounded-[10px] border border-[#d8e0eb] bg-white px-3 text-left text-[13px] font-semibold text-[#1c3154] shadow-[0_1px_2px_rgb(20_44_84/5%)] transition-colors hover:border-[#9eb4d3] focus-visible:border-[#1769e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769e8] data-[state=open]:border-[#1769e8] data-[state=open]:ring-3 data-[state=open]:ring-[#1769e8]/12"
          type="button"
        >
          <span className="min-w-0 flex-1 truncate">{statusLabel(labels, value)}</span>
          <FiChevronDown
            aria-hidden
            className="size-4 shrink-0 text-[#40577d] transition-transform duration-200 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className="z-50 w-(--radix-popover-trigger-width) min-w-40 overflow-hidden rounded-[10px] border border-[#dbe3ee] bg-white p-1 shadow-[0_10px_24px_rgb(24_52_94/14%)]"
          sideOffset={6}
        >
          <div aria-label={labels.statusFilter} role="menu">
            {RULE_STATUS_FILTERS.map((status) => {
              const selected = status === value;
              return (
                <Popover.Close asChild key={status}>
                  <button
                    aria-checked={selected}
                    className={cn(
                      "flex min-h-9 w-full items-center gap-2 rounded-[7px] px-3 py-2 text-left text-[13px] font-medium text-[#243958] transition-colors hover:bg-[#f2f6fc] focus-visible:bg-[#f2f6fc] focus-visible:outline-none",
                      selected && "bg-[#eaf2ff] font-semibold text-[#1769e8] hover:bg-[#eaf2ff] focus-visible:bg-[#eaf2ff]",
                    )}
                    onClick={() => !selected && onChange(status)}
                    role="menuitemradio"
                    type="button"
                  >
                    <span className="min-w-0 flex-1 truncate">{statusLabel(labels, status)}</span>
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
