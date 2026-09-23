"use client";

import { type ReactNode, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  HiOutlineCheckCircle,
  HiOutlineArrowsRightLeft,
  HiOutlineArrowPath,
  HiOutlineChatBubbleLeftRight,
  HiOutlineEnvelope,
  HiOutlineMagnifyingGlass,
  HiOutlineTag,
} from "react-icons/hi2";
import { FiMoreHorizontal } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import { FilterLoadingSurface } from "@/components/pace/shared/filter-loading-surface";
import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { TransactionAmountCell } from "@/modules/transactions/ui/components/transaction-amount-cell";
import { TransactionDateCell } from "@/modules/transactions/ui/components/transaction-date-cell";
import { TransactionMerchantCell } from "@/modules/transactions/ui/components/transaction-merchant-cell";

import { INBOX_REASONS, type InboxReason } from "../../domain";
import { InboxAskPace } from "../components/inbox-ask-pace";
import { InboxSortFilter } from "../components/inbox-sort-filter";
import {
  inboxOverviewHref,
  type InboxOverview,
  type InboxOverviewFilter,
  type InboxOverviewSort,
  type InboxReasonCount,
} from "../../inbox-overview";

export function InboxOverviewView({
  overview,
  labels,
  language,
  locale,
  timeZone,
  now,
  workspaceId,
  workspaceSlug,
}: {
  readonly overview: InboxOverview;
  readonly labels: DashboardLabels;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pathname = `/w/${workspaceSlug}/inbox`;
  const currentInboxHref = inboxOverviewHref(pathname, {
    reason: overview.activeFilter,
    sort: overview.sort,
    page: overview.pagination.page,
  });
  const filters = filtersForView(overview.availableFilters);
  const navigate = (
    reason: InboxOverviewFilter,
    page = 1,
    sort: InboxOverviewSort = overview.sort,
  ) => {
    startTransition(() =>
      router.push(inboxOverviewHref(pathname, { reason, page, sort })),
    );
  };

  return (
    <FilterLoadingSurface
      detail={labels["inbox.loading.detail"]}
      isLoading={isPending}
      label={labels["inbox.loading"]}>
      <main className="min-h-[calc(100svh-4rem)] w-full min-w-0 bg-white">
        <section className="w-full min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-8 xl:px-10">
          <div className="mx-auto w-full max-w-280">
            <header className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h1 className="text-[28px] font-semibold leading-8 tracking-[-0.04em] text-[#101a35] sm:text-[30px]">
                    {labels["inbox.title"]}
                  </h1>
                  <span
                    aria-live="polite"
                    className="inline-flex min-w-8 items-center justify-center rounded-[7px] bg-[#eef1f5] px-2 py-1 text-[13px] font-semibold leading-4 text-[#34415a]">
                    {overview.unresolvedCount}
                  </span>
                </div>
                <p className="mt-1.5 text-[14px] leading-5 text-[#71809a]">
                  {labels["inbox.description"]}
                </p>
              </div>
              <InboxAskPace
                language={language}
                locale={locale}
                timeZone={timeZone}
                workspaceId={workspaceId}
              />
            </header>

            <nav
              aria-label={labels["inbox.filters.label"]}
              className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
              <FilterChip
                active={overview.activeFilter === null}
                count={undefined}
                label={labels["inbox.filters.all"]}
                onSelect={() => navigate(null)}
              />
              {filters.map((filter) => (
                <FilterChip
                  active={overview.activeFilter === filter.reason}
                  count={undefined}
                  key={filter.reason}
                  label={reasonLabel(filter.reason, labels)}
                  onSelect={() => navigate(filter.reason)}
                />
              ))}
            </nav>

            <InboxSummaryCards
              reasonCounts={filters}
              labels={labels}
              unresolvedCount={overview.unresolvedCount}
            />

            <section aria-labelledby="inbox-queue-heading" className="mt-10">
              <header className="flex items-center justify-between gap-4 border-b border-[#e8ecf2] pb-3.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <h2
                    className="text-[20px] font-semibold tracking-[-0.03em] text-[#14203b]"
                    id="inbox-queue-heading">
                    {labels["inbox.queue.title"]}
                  </h2>
                  <span className="inline-flex min-w-6 items-center justify-center rounded-[6px] bg-[#f1f3f6] px-1.5 py-0.5 text-[12px] font-semibold leading-4 text-[#40506c]">
                    {overview.pagination.totalCount}
                  </span>
                </div>
                <InboxSortFilter
                  disabled={isPending}
                  labels={labels}
                  onValueChange={(sort) =>
                    navigate(overview.activeFilter, 1, sort)
                  }
                  value={overview.sort}
                />
              </header>

              {overview.items.length ? (
                <div>
                  {overview.items.map((item) => (
                    <InboxQueueRow
                      item={item}
                      key={item.id}
                      labels={labels}
                      locale={locale}
                      now={now}
                      timeZone={timeZone}
                      inboxHref={currentInboxHref}
                      workspaceSlug={workspaceSlug}
                    />
                  ))}
                </div>
              ) : (
                <InboxEmptyState
                  activeFilter={overview.activeFilter}
                  labels={labels}
                  unresolvedCount={overview.unresolvedCount}
                  onClear={() => navigate(null)}
                />
              )}
              <InboxPagination
                labels={labels}
                onNavigate={(page) => navigate(overview.activeFilter, page)}
                page={overview.pagination.page}
                pageSize={overview.pagination.pageSize}
                totalCount={overview.pagination.totalCount}
              />
            </section>

            <section
              aria-labelledby="inbox-recently-resolved-heading"
              className="mt-8">
              <header className="flex items-center gap-2.5 border-b border-[#e8ecf2] pb-3.5">
                <h2
                  className="text-[20px] font-semibold tracking-[-0.03em] text-[#14203b]"
                  id="inbox-recently-resolved-heading">
                  {labels["inbox.recentlyResolved.title"]}
                </h2>
                <span className="inline-flex min-w-6 items-center justify-center rounded-[6px] bg-[#f1f3f6] px-1.5 py-0.5 text-[12px] font-semibold leading-4 text-[#40506c]">
                  {overview.recentlyResolved.length}
                </span>
              </header>
              {overview.recentlyResolved.length ? (
                <div>
                  {overview.recentlyResolved.map((item) => (
                    <InboxQueueRow
                      item={item}
                      key={item.id}
                      labels={labels}
                      locale={locale}
                      now={now}
                      timeZone={timeZone}
                      inboxHref={currentInboxHref}
                      workspaceSlug={workspaceSlug}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-6 text-[13px] text-[#71809a]">
                  {labels["inbox.recentlyResolved.empty"]}
                </p>
              )}
            </section>
          </div>
        </section>
      </main>
    </FilterLoadingSurface>
  );
}

function InboxSummaryCards({
  unresolvedCount,
  reasonCounts,
  labels,
}: {
  readonly unresolvedCount: number;
  readonly reasonCounts: readonly InboxReasonCount[];
  readonly labels: DashboardLabels;
}) {
  const reasonCards = reasonCounts.slice(0, 2);

  return (
    <section
      aria-label={labels["inbox.summary.needsAttention"]}
      className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <InboxSummaryCard
        icon={<HiOutlineEnvelope aria-hidden="true" className="size-6" />}
        label={labels["inbox.summary.openItems"]}
        tone="blue"
        value={unresolvedCount}
      />
      {reasonCards.map((filter) => (
        <InboxSummaryCard
          icon={reasonIcon(filter.reason)}
          key={filter.reason}
          label={reasonLabel(filter.reason, labels)}
          tone={summaryTone(filter.reason)}
          value={filter.count}
        />
      ))}
    </section>
  );
}

function InboxSummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly icon: ReactNode;
  readonly tone: "blue" | "green" | "violet";
}) {
  const tones = {
    blue: "bg-[#eef5ff] text-[#2168f3]",
    green: "bg-[#ecf8f2] text-[#169469]",
    violet: "bg-[#f3f0ff] text-[#7658d9]",
  };

  return (
    <div className="flex min-h-29 items-center gap-4 rounded-[10px] border border-[#e3e8f0] bg-white px-4 py-4 shadow-[0_1px_2px_rgb(16_24_40/2%)]">
      <span
        className={`grid size-12 shrink-0 place-items-center rounded-[12px] ${tones[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] text-[#667895]">{label}</p>
        <p className="mt-1 text-[25px] font-semibold leading-6 tracking-[-0.04em] text-[#13203b]">
          {value}
        </p>
      </div>
    </div>
  );
}

function reasonIcon(reason: InboxReason) {
  const className = "size-6";
  switch (reason) {
    case "POSSIBLE_TRANSFER":
      return (
        <HiOutlineArrowsRightLeft aria-hidden="true" className={className} />
      );
    case "POSSIBLE_RECURRING":
      return <HiOutlineArrowPath aria-hidden="true" className={className} />;
    case "MERCHANT_AMBIGUITY":
      return (
        <HiOutlineMagnifyingGlass aria-hidden="true" className={className} />
      );
    case "UNKNOWN_CATEGORY":
    case "CLASSIFICATION_REVIEW":
      return <HiOutlineTag aria-hidden="true" className={className} />;
  }
}

function summaryTone(reason: InboxReason): "green" | "violet" {
  return reason === "POSSIBLE_RECURRING" ? "green" : "violet";
}

function FilterChip({
  active,
  count,
  label,
  onSelect,
}: {
  readonly active: boolean;
  readonly count: number | undefined;
  readonly label: string;
  readonly onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={
        active
          ? "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] border border-[#e5eefc] bg-[#edf4ff] px-3 text-[12px] font-medium text-[#1f69e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          : "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] border border-[#e3e7ee] bg-white px-3 text-[12px] font-medium text-[#61708a] transition-colors hover:border-[#d3dce9] hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
      }
      onClick={onSelect}
      type="button">
      {label}
      {count !== undefined ? <span>{count}</span> : null}
    </button>
  );
}

function InboxQueueRow({
  item,
  labels,
  locale,
  timeZone,
  now,
  inboxHref,
  workspaceSlug,
}: {
  readonly item: InboxOverview["items"][number];
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly inboxHref: string;
  readonly workspaceSlug: string;
}) {
  const reason = reasonLabel(item.reason, labels);
  const destination = `/w/${workspaceSlug}/inbox/${item.id}?returnTo=${encodeURIComponent(inboxHref)}`;
  const provenance =
    item.provenance === "IMPORT" ? labels["inbox.provenance.import"] : null;
  const resolved = item.status === "RESOLVED";

  return (
    <article className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-[#edf0f4] py-4 last:border-b-0 sm:grid-cols-[minmax(195px,1.35fr)_minmax(100px,0.6fr)_minmax(185px,0.95fr)_minmax(118px,0.7fr)_74px_20px] sm:items-center sm:gap-x-3.5 sm:py-3.5">
      <Link
        aria-label={`${labels["inbox.openTransaction"]}: ${item.transaction.merchant.name}. ${reason}.`}
        className="min-w-0 rounded-[7px] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]"
        href={destination}>
        <TransactionMerchantCell
          category={item.transaction.category}
          kind={item.transaction.kind}
          merchant={item.transaction.merchant}
        />
        <span className="mt-1.5 block pl-11 text-[12px] text-[#75839b] sm:hidden">
          <TransactionDateCell
            labels={{
              today: labels["transactions.date.today"],
              yesterday: labels["transactions.date.yesterday"],
            }}
            locale={locale}
            now={now}
            occurredAt={item.transaction.occurredAt}
            timeZone={timeZone}
          />
        </span>
      </Link>
      <div className="sm:col-start-2">
        <TransactionAmountCell
          amount={item.transaction.amount}
          kind={item.transaction.kind}
          locale={locale}
        />
      </div>
      <div className="col-span-2 mt-3 flex min-w-0 items-center gap-2 pl-11 sm:col-span-1 sm:col-start-3 sm:mt-0 sm:pl-0">
        <HiOutlineChatBubbleLeftRight
          aria-hidden="true"
          className="size-4 shrink-0 text-[#7487a6]"
        />
        <span className="truncate text-[12px] leading-5 text-[#73819a]">
          {reason}
        </span>
      </div>
      <div className="col-span-2 mt-2 pl-11 sm:col-span-1 sm:col-start-4 sm:mt-0 sm:pl-0">
        {item.classification?.proposal ? (
          <span
            aria-label={`${labels["inbox.proposal"]}: ${item.classification.proposal.label}`}
            className="inline-flex max-w-full truncate rounded-full bg-[#f3f5f8] px-2.5 py-1 text-[11px] leading-4 text-[#67758c]">
            <span className="truncate">
              {labels["inbox.proposal"]}: {item.classification.proposal.label}
            </span>
          </span>
        ) : provenance ? (
          <span className="text-[12px] text-[#73819a]">{provenance}</span>
        ) : (
          <span className="text-[12px] text-[#9aa5b5]">—</span>
        )}
      </div>
      {resolved ? (
        <span className="col-start-2 row-start-1 inline-flex h-8 items-center justify-center self-center rounded-[999px] bg-[#eaf9f1] px-3 text-[12px] font-medium text-[#159364] sm:col-start-5 sm:row-start-auto">
          {labels["inbox.status.resolved"]}
        </span>
      ) : (
        <Link
          className="col-start-2 row-start-1 inline-flex h-8 items-center justify-center self-center rounded-[7px] border border-[#e2e7ef] bg-white px-3 text-[12px] font-medium text-[#273955] transition-colors hover:border-[#c9d7ea] hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] sm:col-start-5 sm:row-start-auto"
          href={destination}>
          {labels["inbox.openTransaction"]}
        </Link>
      )}
      <FiMoreHorizontal
        aria-hidden="true"
        className="hidden size-4 text-[#8290a5] sm:block"
      />
    </article>
  );
}

function InboxEmptyState({
  activeFilter,
  unresolvedCount,
  labels,
  onClear,
}: {
  readonly activeFilter: InboxOverviewFilter;
  readonly unresolvedCount: number;
  readonly labels: DashboardLabels;
  readonly onClear: () => void;
}) {
  const filteredEmpty = activeFilter !== null && unresolvedCount > 0;
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-5 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-[10px] bg-[#f2f5f9] text-[#6780aa]">
        {filteredEmpty ? (
          <HiOutlineMagnifyingGlass aria-hidden="true" className="size-5" />
        ) : (
          <HiOutlineCheckCircle aria-hidden="true" className="size-5" />
        )}
      </span>
      <h3 className="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-[#22314b]">
        {filteredEmpty
          ? labels["inbox.empty.filtered.title"]
          : labels["inbox.empty.all.title"]}
      </h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-[#70809a]">
        {filteredEmpty
          ? labels["inbox.empty.filtered.description"]
          : labels["inbox.empty.all.description"]}
      </p>
      {filteredEmpty ? (
        <Button
          className="mt-4 h-8 rounded-[7px] border-[#dfe6ef] bg-white text-[12px] text-[#465875] hover:bg-[#f7f9fc]"
          onClick={onClear}
          size="sm"
          type="button"
          variant="outline">
          {labels["inbox.empty.clear"]}
        </Button>
      ) : null}
    </div>
  );
}

function InboxPagination({
  page,
  pageSize,
  totalCount,
  labels,
  onNavigate,
}: {
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly labels: DashboardLabels;
  readonly onNavigate: (page: number) => void;
}) {
  if (totalCount <= pageSize) return null;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalCount);

  return (
    <nav
      aria-label={labels["inbox.pagination.page"]}
      className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[12px] text-[#71809a]">
        {labels["inbox.pagination.summary"]
          .replace("{from}", String(from))
          .replace("{to}", String(to))
          .replace("{count}", String(totalCount))}
      </p>
      <div className="flex items-center gap-2">
        <Button
          className="h-8 rounded-[7px] border-[#e3e8ef] bg-white text-[12px] text-[#53627b] hover:bg-[#f8fafc]"
          disabled={currentPage === 1}
          onClick={() => onNavigate(currentPage - 1)}
          size="sm"
          type="button"
          variant="outline">
          {labels["inbox.pagination.previous"]}
        </Button>
        <Button
          className="h-8 rounded-[7px] border-[#e3e8ef] bg-white text-[12px] text-[#53627b] hover:bg-[#f8fafc]"
          disabled={currentPage === totalPages}
          onClick={() => onNavigate(currentPage + 1)}
          size="sm"
          type="button"
          variant="outline">
          {labels["inbox.pagination.next"]}
        </Button>
      </div>
    </nav>
  );
}

function filtersForView(
  availableFilters: readonly InboxReasonCount[],
): readonly InboxReasonCount[] {
  return INBOX_REASONS.map((reason) => ({
    reason,
    count:
      availableFilters.find((filter) => filter.reason === reason)?.count ?? 0,
  }));
}

function reasonLabel(reason: InboxReason, labels: DashboardLabels): string {
  const keys: Record<InboxReason, keyof DashboardLabels> = {
    UNKNOWN_CATEGORY: "inbox.reason.unknownCategory",
    POSSIBLE_TRANSFER: "inbox.reason.possibleTransfer",
    POSSIBLE_RECURRING: "inbox.reason.possibleRecurring",
    MERCHANT_AMBIGUITY: "inbox.reason.merchantAmbiguity",
    CLASSIFICATION_REVIEW: "inbox.reason.classificationReview",
  };
  return labels[keys[reason]];
}
