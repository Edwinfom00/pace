"use client";

import { type ReactNode, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiMoreHorizontal } from "react-icons/fi";
import {
  HiCheckCircle,
  HiOutlineCheck,
  HiOutlineCheckCircle,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineEnvelope,
  HiOutlineMagnifyingGlass,
  HiOutlineSparkles,
  HiOutlineArrowTrendingUp,
} from "react-icons/hi2";

import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import { FilterLoadingSurface } from "@/components/pace/shared/filter-loading-surface";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import { TransactionAmountCell } from "@/modules/transactions/ui/components/transaction-amount-cell";
import { TransactionDateCell } from "@/modules/transactions/ui/components/transaction-date-cell";

import { INBOX_REASONS } from "../../domain";
import {
  inboxOverviewHref,
  type InboxOverview,
  type InboxOverviewFilter,
  type InboxOverviewItem,
  type InboxOverviewSort,
} from "../../inbox-overview";
import { InboxPaceRail } from "../components/inbox-pace-rail";
import { InboxSortFilter } from "../components/inbox-sort-filter";
import { inboxReasonText } from "../inbox-reason-labels";
import { useInboxPages } from "../use-inbox-pages";

type RowContext = {
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly inboxHref: string;
  readonly workspaceSlug: string;
};

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
  const pages = useInboxPages({ overview, pathname, workspaceId });
  const { items, pagination } = pages.page;
  const currentInboxHref = inboxOverviewHref(pathname, {
    reason: overview.activeFilter,
    sort: overview.sort,
    page: pages.currentPage,
  });
  const navigate = (
    reason: InboxOverviewFilter,
    page = 1,
    sort: InboxOverviewSort = overview.sort,
  ) => {
    startTransition(() =>
      router.push(inboxOverviewHref(pathname, { reason, page, sort })),
    );
  };
  const rowContext: RowContext = {
    labels,
    locale,
    timeZone,
    now,
    inboxHref: currentInboxHref,
    workspaceSlug,
  };
  const firstItem = items[0];

  return (
    <FilterLoadingSurface
      detail={labels["inbox.loading.detail"]}
      isLoading={isPending}
      label={labels["inbox.loading"]}>
      <main className="grid min-h-[calc(100svh-4rem)] w-full min-w-0 bg-white xl:grid-cols-[minmax(0,1fr)_clamp(340px,27vw,390px)]">
        <section className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-8 xl:px-10">
          <header>
            <div className="flex items-center gap-3">
              <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.04em] text-[#101a35] sm:text-[32px]">
                {labels["inbox.title"]}
              </h1>
              <CountBadge value={overview.unresolvedCount} large />
            </div>
            <p className="mt-1.5 text-[15px] leading-6 text-[#5f6e87]">
              {labels["inbox.description"]}
            </p>
          </header>

          <nav
            aria-label={labels["inbox.filters.label"]}
            className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
            <FilterTab
              active={overview.activeFilter === null}
              label={labels["inbox.filters.all"]}
              onSelect={() => navigate(null)}
            />
            {INBOX_REASONS.map((reason) => (
              <FilterTab
                active={overview.activeFilter === reason}
                key={reason}
                label={inboxReasonText(labels, "filter", reason)}
                onSelect={() => navigate(reason)}
              />
            ))}
          </nav>

          <InboxSummaryCards
            labels={labels}
            locale={locale}
            overview={overview}
          />

          <section aria-labelledby="inbox-queue-heading" className="mt-9">
            <header className="flex items-center justify-between gap-4 pb-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <h2
                  className="text-[20px] font-semibold tracking-[-0.03em] text-[#14203b]"
                  id="inbox-queue-heading">
                  {overview.activeFilter
                    ? inboxReasonText(labels, "filter", overview.activeFilter)
                    : labels["inbox.queue.title"]}
                </h2>
                <CountBadge value={overview.pagination.totalCount} />
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

            {items.length ? (
              <div
                aria-busy={pages.isLoadingPage}
                className={cn(
                  "border-t border-[#e8ecf2] transition-opacity duration-150",
                  pages.isLoadingPage && "opacity-60",
                )}>
                {items.map((item) => (
                  <InboxRow context={rowContext} item={item} key={item.id} />
                ))}
              </div>
            ) : (
              <InboxEmptyState
                activeFilter={overview.activeFilter}
                labels={labels}
                onClear={() => navigate(null)}
                unresolvedCount={overview.unresolvedCount}
              />
            )}
            <InboxPagination
              disabled={isPending}
              labels={labels}
              onNavigate={pages.goToPage}
              onPrefetch={pages.prefetchPage}
              page={pages.currentPage}
              pageSize={pagination.pageSize}
              totalCount={pagination.totalCount}
            />
          </section>

          <section
            aria-labelledby="inbox-recently-resolved-heading"
            className="mt-9">
            <header className="flex items-center gap-2.5 pb-3">
              <h2
                className="text-[20px] font-semibold tracking-[-0.03em] text-[#14203b]"
                id="inbox-recently-resolved-heading">
                {labels["inbox.recentlyResolved.title"]}
              </h2>
              <CountBadge value={overview.recentlyResolved.length} />
            </header>
            {overview.recentlyResolved.length ? (
              <div className="border-t border-[#e8ecf2]">
                {overview.recentlyResolved.map((item) => (
                  <InboxRow context={rowContext} item={item} key={item.id} />
                ))}
              </div>
            ) : (
              <p className="border-t border-[#e8ecf2] py-6 text-[13px] text-[#71809a]">
                {labels["inbox.recentlyResolved.empty"]}
              </p>
            )}
          </section>
        </section>

        <div className="min-w-0 border-t border-[#e8ecf2] px-5 py-7 sm:px-7 xl:border-t-0 xl:border-l xl:px-6 xl:py-8">
          <div className="xl:sticky xl:top-8">
            <InboxPaceRail
              labels={labels}
              language={language}
              locale={locale}
              now={now}
              onFilter={(reason) => navigate(reason)}
              onShowHighImpact={() =>
                navigate(
                  overview.activeFilter,
                  1,
                  overview.sort === "LARGEST" ? "NEWEST" : "LARGEST",
                )
              }
              overview={overview}
              reviewAllHref={firstItem ? itemHref(firstItem, rowContext) : null}
              timeZone={timeZone}
              workspaceId={workspaceId}
            />
          </div>
        </div>
      </main>
    </FilterLoadingSurface>
  );
}

function CountBadge({
  value,
  large = false,
}: {
  readonly value: number;
  readonly large?: boolean;
}) {
  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex items-center justify-center rounded-[7px] bg-[#eef1f5] font-semibold text-[#34415a] tabular-nums",
        large
          ? "min-w-9 px-2.5 py-1 text-[15px] leading-5"
          : "min-w-7 px-2 py-0.5 text-[13px] leading-5",
      )}>
      {value}
    </span>
  );
}

function FilterTab({
  active,
  label,
  onSelect,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-[8px] border px-4 text-[13px] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]",
        active
          ? "border-[#dbe7fd] bg-[#edf4ff] font-medium text-[#1f69e8]"
          : "border-[#e3e7ee] bg-white text-[#53627b] hover:border-[#d3dce9] hover:bg-[#f8fafc]",
      )}
      onClick={onSelect}
      type="button">
      {label}
    </button>
  );
}

function InboxSummaryCards({
  overview,
  labels,
  locale,
}: {
  readonly overview: InboxOverview;
  readonly labels: DashboardLabels;
  readonly locale: string;
}) {
  const amount = overview.amountToReview;

  return (
    <section
      aria-label={labels["inbox.summary.needsAttention"]}
      className="mt-5 grid gap-3 sm:grid-cols-3">
      <SummaryCard
        caption={
          overview.unresolvedCount
            ? labels["inbox.card.open.caption"]
            : labels["inbox.card.open.captionEmpty"]
        }
        icon={<HiOutlineEnvelope aria-hidden className="size-6" />}
        title={labels["inbox.card.open.title"]}
        tone="blue"
        value={String(overview.unresolvedCount)}
      />
      <SummaryCard
        caption={
          overview.reviewedTodayCount
            ? labels["inbox.card.reviewed.caption"]
            : labels["inbox.card.reviewed.captionEmpty"]
        }
        icon={<HiOutlineCheck aria-hidden className="size-6" />}
        title={labels["inbox.card.reviewed.title"]}
        tone="green"
        value={String(overview.reviewedTodayCount)}
      />
      <SummaryCard
        caption={
          amount
            ? labels["inbox.card.amount.caption"].replace(
                "{count}",
                String(amount.count),
              )
            : labels["inbox.card.amount.captionEmpty"]
        }
        icon={<HiOutlineArrowTrendingUp aria-hidden className="size-6" />}
        title={labels["inbox.card.amount.title"]}
        tone="green"
        value={
          amount
            ? formatOverviewMoney(amount.minor, amount.currency, locale)
            : "—"
        }
      />
    </section>
  );
}

function SummaryCard({
  title,
  value,
  caption,
  icon,
  tone,
}: {
  readonly title: string;
  readonly value: string;
  readonly caption: string;
  readonly icon: ReactNode;
  readonly tone: "blue" | "green";
}) {
  return (
    <div className="flex min-w-0 items-center gap-4 rounded-[12px] border border-[#e5e9f0] bg-white px-4 py-4.5 lg:px-5">
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-[12px]",
          tone === "blue"
            ? "bg-[#eef4ff] text-[#2563eb]"
            : "bg-[#eaf8f0] text-[#16a06a]",
        )}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] text-[#5f6e87]">{title}</p>
        <p className="mt-1 truncate text-[24px] font-semibold leading-7 tracking-[-0.035em] text-[#101a35] tabular-nums">
          {value}
        </p>
        <p className="mt-1 truncate text-[13px] text-[#71809a]">{caption}</p>
      </div>
    </div>
  );
}

function itemHref(item: InboxOverviewItem, context: RowContext): string {
  return `/w/${context.workspaceSlug}/inbox/${item.id}?returnTo=${encodeURIComponent(context.inboxHref)}`;
}

function InboxRow({
  item,
  context,
}: {
  readonly item: InboxOverviewItem;
  readonly context: RowContext;
}) {
  const { labels } = context;
  const destination = itemHref(item, context);
  const resolved = item.status === "RESOLVED";
  const merchant = item.transaction.merchant;
  const question = inboxReasonText(
    labels,
    resolved ? "resolvedNote" : "question",
    item.reason,
  );

  return (
    <article className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 border-b border-[#edf0f4] py-3.5 md:grid-cols-[minmax(0,1.35fr)_minmax(108px,0.6fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_auto]">
      <Link
        aria-label={`${labels["inbox.openTransaction"]}: ${merchant.name}. ${inboxReasonText(labels, "reason", item.reason)}.`}
        className="flex min-w-0 items-center gap-3 rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]"
        href={destination}>
        {resolved ? (
          <HiCheckCircle
            aria-hidden
            className="size-6 shrink-0 text-[#22b573]"
          />
        ) : null}
        <TransactionIcon
          categoryKey={item.transaction.category?.key}
          categoryName={item.transaction.category?.label}
          className="border-[#e1e7ef] shadow-[0_1px_2px_rgb(16_24_40/5%)]"
          iconKey={merchant.iconKey}
          merchantLogoKey={merchant.merchantLogoKey}
          merchantName={merchant.name}
          size="lg"
          transactionKind={item.transaction.kind}
        />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium tracking-[-0.01em] text-[#14203b]">
            {merchant.name}
          </span>
          <span className="mt-0.5 block truncate">
            <TransactionDateCell
              labels={{
                today: labels["transactions.date.today"],
                yesterday: labels["transactions.date.yesterday"],
              }}
              locale={context.locale}
              now={context.now}
              occurredAt={item.transaction.occurredAt}
              timeZone={context.timeZone}
            />
          </span>
        </span>
      </Link>

      <div className="text-right md:text-left [&>span]:text-[14px]">
        <TransactionAmountCell
          amount={item.transaction.amount}
          kind={item.transaction.kind}
          locale={context.locale}
        />
      </div>

      <div
        className={cn(
          "col-span-2 flex min-w-0 items-center gap-3 md:contents",
          resolved ? "pl-23" : "pl-14",
        )}>
        <p className="flex min-w-0 items-center gap-2 text-[13px] leading-5 text-[#5f6e87]">
          {resolved ? null : (
            <HiOutlineChatBubbleOvalLeft
              aria-hidden
              className="size-4 shrink-0 text-[#71809a]"
            />
          )}
          <span className="truncate">{question}</span>
        </p>

        <div className="min-w-0">
          <CategoryPill item={item} labels={labels} />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          {resolved ? (
            <span className="inline-flex h-8 min-w-19 items-center justify-center rounded-[7px] bg-[#e9f8f0] px-3 text-[12px] font-medium text-[#14935f]">
              {labels["inbox.status.resolved"]}
            </span>
          ) : (
            <Link
              className="inline-flex h-8 min-w-19 items-center justify-center rounded-[7px] border border-[#dfe5ee] bg-white px-3.5 text-[13px] font-medium text-[#22314b] transition-colors hover:border-[#c9d7ea] hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              href={destination}>
              {labels["inbox.review"]}
            </Link>
          )}
          <RowActions
            destination={destination}
            item={item}
            labels={labels}
            workspaceSlug={context.workspaceSlug}
          />
        </div>
      </div>
    </article>
  );
}

function CategoryPill({
  item,
  labels,
}: {
  readonly item: InboxOverviewItem;
  readonly labels: DashboardLabels;
}) {
  const proposal =
    item.status === "OPEN" ? item.classification?.proposal : null;
  const base =
    "inline-flex max-w-full items-center gap-1 rounded-full px-3 py-1 text-[12px] leading-4";

  if (proposal) {
    return (
      <span
        aria-label={`${labels["inbox.proposal"]}: ${proposal.label}`}
        className={cn(
          base,
          "border border-dashed border-[#c9d7f2] bg-[#f6f9ff] text-[#3c5a8f]",
        )}
        title={`${labels["inbox.proposal"]}: ${proposal.label}`}>
        <HiOutlineSparkles aria-hidden className="size-3 shrink-0" />
        <span className="truncate">{proposal.label}</span>
      </span>
    );
  }

  const category = item.transaction.category?.label;
  return (
    <span
      className={cn(
        base,
        category
          ? "bg-[#f1f3f6] text-[#53627b]"
          : "bg-[#f7f8fa] text-[#8a96a8]",
      )}>
      <span className="truncate">
        {category ?? labels["inbox.uncategorized"]}
      </span>
    </span>
  );
}

function RowActions({
  item,
  destination,
  labels,
  workspaceSlug,
}: {
  readonly item: InboxOverviewItem;
  readonly destination: string;
  readonly labels: DashboardLabels;
  readonly workspaceSlug: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${labels["inbox.rowActions"]}: ${item.transaction.merchant.name}`}
          className="grid size-8 place-items-center rounded-[7px] text-[#53627b] transition-colors hover:bg-[#f3f6fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          type="button">
          <FiMoreHorizontal aria-hidden className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 rounded-[9px] border border-[#e4e9f1] bg-white p-1 shadow-[0_5px_14px_rgb(16_24_40/10%)]">
        <DropdownMenuItem
          asChild
          className="rounded-[6px] px-2.5 py-2 text-[13px] text-[#34415a]">
          <Link href={destination}>{labels["inbox.rowActions.open"]}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          asChild
          className="rounded-[6px] px-2.5 py-2 text-[13px] text-[#34415a]">
          <Link
            href={`/w/${workspaceSlug}/transactions/${item.transaction.id}`}>
            {labels["inbox.rowActions.viewTransaction"]}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
    <div className="flex min-h-56 flex-col items-center justify-center border-t border-[#e8ecf2] px-5 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-[10px] bg-[#f2f5f9] text-[#6780aa]">
        {filteredEmpty ? (
          <HiOutlineMagnifyingGlass aria-hidden className="size-5" />
        ) : (
          <HiOutlineCheckCircle aria-hidden className="size-5" />
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
  disabled,
  onNavigate,
  onPrefetch,
}: {
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly labels: DashboardLabels;
  readonly disabled: boolean;
  readonly onNavigate: (page: number) => void;
  readonly onPrefetch: (page: number) => void;
}) {
  if (totalCount <= pageSize) return null;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalCount);
  const navButton =
    "grid size-8 place-items-center rounded-[7px] border border-[#e3e8ef] bg-white text-[#53627b] transition-colors hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <nav
      aria-label={labels["inbox.pagination.page"]}
      className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px] text-[#71809a] tabular-nums">
        {labels["inbox.pagination.summary"]
          .replace("{from}", String(from))
          .replace("{to}", String(to))
          .replace("{count}", String(totalCount))}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          aria-label={labels["inbox.pagination.previous"]}
          className={navButton}
          disabled={disabled || currentPage === 1}
          onClick={() => onNavigate(currentPage - 1)}
          onPointerEnter={() => onPrefetch(currentPage - 1)}
          type="button">
          <HiOutlineChevronLeft aria-hidden className="size-4" />
        </button>
        {pageWindow(currentPage, totalPages).map((entry, index) =>
          entry === null ? (
            <span
              className="w-6 text-center text-[13px] text-[#9aa5b5]"
              key={`gap-${index}`}>
              …
            </span>
          ) : (
            <button
              aria-current={entry === currentPage ? "page" : undefined}
              className={cn(
                "h-8 min-w-8 rounded-[7px] px-2 text-[13px] tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]",
                entry === currentPage
                  ? "bg-[#edf4ff] font-medium text-[#1f69e8]"
                  : "text-[#53627b] hover:bg-[#f3f6fa]",
              )}
              disabled={disabled}
              key={entry}
              onClick={() => onNavigate(entry)}
              onFocus={() => onPrefetch(entry)}
              onPointerEnter={() => onPrefetch(entry)}
              type="button">
              {entry}
            </button>
          ),
        )}
        <button
          aria-label={labels["inbox.pagination.next"]}
          className={navButton}
          disabled={disabled || currentPage === totalPages}
          onClick={() => onNavigate(currentPage + 1)}
          onPointerEnter={() => onPrefetch(currentPage + 1)}
          type="button">
          <HiOutlineChevronRight aria-hidden className="size-4" />
        </button>
      </div>
    </nav>
  );
}

function pageWindow(
  current: number,
  total: number,
): readonly (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages]
    .filter((value) => value >= 1 && value <= total)
    .sort((a, b) => a - b);
  return sorted.flatMap((value, index) =>
    index > 0 && value - sorted[index - 1]! > 1 ? [null, value] : [value],
  );
}
