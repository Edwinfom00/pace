"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  FiArrowDownRight,
  FiArrowUpRight,
  FiArrowRight,
  FiArrowLeft,
  FiRepeat,
} from "react-icons/fi";
import { HiOutlineArchiveBox } from "react-icons/hi2";

import { FilterLoadingSurface } from "@/components/pace/shared/filter-loading-surface";
import { cn } from "@/lib/utils";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import { TransactionCategoryBadge } from "@/modules/transactions/ui/components/transaction-category-badge";
import { TransactionDateCell } from "@/modules/transactions/ui/components/transaction-date-cell";
import { TransactionMerchantCell } from "@/modules/transactions/ui/components/transaction-merchant-cell";
import { TransactionStatusBadge } from "@/modules/transactions/ui/components/transaction-status-badge";
import { getAccountTypeMetadata } from "@/modules/ledger/ui/components/account-type-metadata";

import {
  ACCOUNT_DETAIL_CHART_RANGES,
  accountDetailHref,
  type AccountDetail,
  type AccountDetailChartRange,
  type AccountDetailRecentTransaction,
} from "../../domain/account-detail";
import type { AccountDetailUiLabels } from "../account-detail-ui-labels";
import { AccountDetailBalanceChart } from "../components/account-detail-balance-chart";
import { AccountsAskPace } from "../components/accounts-ask-pace";

export function AccountDetailView({
  detail,
  labels,
  language,
  locale,
  now,
  timeZone,
  workspaceId,
  workspaceSlug,
}: {
  readonly detail: AccountDetail;
  readonly labels: AccountDetailUiLabels;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly now: string;
  readonly timeZone: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const account = detail.account;
  const AccountIcon = getAccountTypeMetadata(account.type).icon;
  const accountsPath = `/w/${workspaceSlug}/accounts`;
  const transactionsPath = `/w/${workspaceSlug}/transactions?account=${encodeURIComponent(account.id)}`;
  const statusClass =
    account.status === "ARCHIVED"
      ? "bg-[#f1f4f8] text-[#596981]"
      : "bg-[#e8f8f0] text-[#078652]";

  function setChartRange(range: AccountDetailChartRange) {
    if (range === detail.chart.range) return;
    startTransition(() => router.push(accountDetailHref(pathname, range)));
  }

  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link
        className="inline-flex items-center gap-1.5 rounded-[6px] text-[13px] font-medium text-[#62738f] transition-colors hover:text-[#1d4fbe] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]"
        href={accountsPath}
      >
        <FiArrowLeft aria-hidden="true" className="size-3.5" />
        {labels.back}
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            aria-hidden="true"
            className="grid size-16 shrink-0 place-items-center rounded-[13px] bg-[#eaf2ff] text-[#245ecc]"
          >
            <AccountIcon className="size-7" />
          </span>
          <div className="min-w-0 pt-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">
                {account.name}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                  statusClass,
                )}
              >
                {account.status === "ARCHIVED" ? (
                  <HiOutlineArchiveBox aria-hidden="true" className="size-3" />
                ) : null}
                {labels.statusValues[account.status]}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-[#667895]">
              {labels.typeValues[account.type]}{" "}
              <span aria-hidden="true">·</span> {account.currency}
            </p>
          </div>
        </div>
        <AccountsAskPace
          language={language}
          locale={locale}
          timeZone={timeZone}
          workspaceId={workspaceId}
        />
      </header>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <section
            aria-label={labels.currentBalance}
            className="rounded-[12px] border border-[#e3e9f1] bg-white px-5 py-5 sm:px-6"
          >
            <div className="flex flex-wrap items-end justify-between gap-5">
              <dl>
                <dd className="text-[28px] font-semibold tabular-nums tracking-[-0.04em] text-[#101a35] sm:text-[31px]">
                  {formatOverviewMoney(
                    detail.currentBalanceMinor,
                    account.currency,
                    locale,
                  )}
                </dd>
                <dt className="mt-1 text-[13px] text-[#647793]">
                  {labels.currentBalance}
                </dt>
              </dl>
              <dl className="text-left sm:text-right">
                <dd className="text-[19px] font-semibold tabular-nums tracking-tight text-[#078652] sm:text-[21px]">
                  {formatOverviewMoney(
                    detail.availableBalanceMinor,
                    account.currency,
                    locale,
                  )}
                </dd>
                <dt className="mt-1 text-[13px] text-[#647793]">
                  {labels.availableBalance}
                </dt>
              </dl>
            </div>
          </section>

          <section
            aria-label={labels.thisMonth}
            className="mt-4 grid gap-3 sm:grid-cols-3"
          >
            <MovementMetric
              icon={<FiArrowUpRight className="size-5" />}
              iconClass="bg-[#e8f8f0] text-[#078652]"
              label={labels.inflows}
              value={formatSigned(
                detail.summary.inflowsMinor,
                account.currency,
                locale,
                "positive",
              )}
              secondary={transactionCountLabel(
                detail.summary.transactionCount,
                labels,
              )}
              tone="positive"
            />
            <MovementMetric
              icon={<FiArrowDownRight className="size-5" />}
              iconClass="bg-[#fff0f1] text-[#cf3d4c]"
              label={labels.outflows}
              value={formatSigned(
                detail.summary.outflowsMinor,
                account.currency,
                locale,
                "negative",
              )}
              secondary={labels.thisMonth}
              tone="negative"
            />
            <MovementMetric
              icon={<FiRepeat className="size-5" />}
              iconClass="bg-[#f1f4f8] text-[#52627b]"
              label={labels.netTransfers}
              value={formatSigned(
                detail.summary.netTransfersMinor,
                account.currency,
                locale,
                "automatic",
              )}
              secondary={labels.thisMonth}
              tone="neutral"
            />
          </section>

          <section
            aria-labelledby="account-balance-history"
            className="mt-4 rounded-[12px] border border-[#e5eaf1] bg-white px-4 py-4 sm:px-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2
                  className="text-[16px] font-semibold tracking-[-0.018em] text-[#16213b]"
                  id="account-balance-history"
                >
                  {labels.balanceHistory}
                </h2>
                <p className="mt-0.5 text-[12px] text-[#71809a]">
                  {labels.balanceHistoryDescription}
                </p>
              </div>
              <div
                aria-label={labels.balanceHistory}
                className="flex overflow-hidden rounded-[8px] border border-[#e2e8f1] bg-white"
                role="group"
              >
                {ACCOUNT_DETAIL_CHART_RANGES.map((range) => (
                  <button
                    aria-pressed={range === detail.chart.range}
                    className={cn(
                      "min-h-8 border-r border-[#e8edf3] px-2.5 text-[12px] font-medium transition-colors last:border-r-0 focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#2563eb]",
                      range === detail.chart.range
                        ? "bg-[#edf4ff] text-[#2463e8]"
                        : "text-[#60718d] hover:bg-[#f7f9fc] hover:text-[#1f4eaf]",
                    )}
                    key={range}
                    onClick={() => setChartRange(range)}
                    type="button"
                  >
                    {labels.chartRange[range]}
                  </button>
                ))}
              </div>
            </div>
            <FilterLoadingSurface
              isLoading={isPending}
              label={labels.loadingHistory}
            >
              <AccountDetailBalanceChart
                currency={account.currency}
                labels={labels}
                locale={locale}
                points={detail.chart.points}
              />
            </FilterLoadingSurface>
          </section>

          <section
            aria-labelledby="account-recent-transactions"
            className="mt-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                className="text-[17px] font-semibold tracking-[-0.02em] text-[#16213b]"
                id="account-recent-transactions"
              >
                {labels.recentTransactions}
              </h2>
              <Link
                className="inline-flex min-h-8 items-center gap-1 rounded-[7px] px-2.5 text-[12px] font-medium text-[#1f64e8] transition-colors hover:bg-[#eff5ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                href={transactionsPath}
              >
                {labels.viewAllTransactions}
                <FiArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            </div>
            {detail.recentTransactions.length ? (
              <RecentTransactionList
                detail={detail}
                labels={labels}
                locale={locale}
                now={now}
                timeZone={timeZone}
                workspaceSlug={workspaceSlug}
              />
            ) : (
              <p className="mt-3 rounded-[10px] border border-dashed border-[#dce4ee] px-4 py-6 text-[13px] text-[#667895]">
                {labels.recentTransactionsEmpty}
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section
            aria-labelledby="account-information"
            className="rounded-[12px] border border-[#e5eaf1] bg-white p-4"
          >
            <h2
              className="text-[14px] font-semibold tracking-[-0.014em] text-[#16213b]"
              id="account-information"
            >
              {labels.information}
            </h2>
            <dl className="mt-4 space-y-3 text-[13px]">
              <Definition
                label={labels.type}
                value={labels.typeValues[account.type]}
              />
              <Definition label={labels.currency} value={account.currency} />
              <Definition
                label={labels.status}
                value={
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                      statusClass,
                    )}
                  >
                    {labels.statusValues[account.status]}
                  </span>
                }
              />
              <Definition
                label={labels.createdAt}
                value={formatDate(account.createdAt, locale, timeZone)}
              />
            </dl>
          </section>

          <section
            aria-labelledby="account-quick-summary"
            className="rounded-[12px] border border-[#e5eaf1] bg-white p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2
                className="text-[14px] font-semibold tracking-[-0.014em] text-[#16213b]"
                id="account-quick-summary"
              >
                {labels.quickSummary}
              </h2>
              <span className="text-[11px] text-[#71809a]">
                {labels.thisMonth}
              </span>
            </div>
            <dl className="mt-3 divide-y divide-[#edf0f4] text-[12px]">
              <SummaryRow
                label={labels.inflows}
                tone="positive"
                value={formatSigned(
                  detail.summary.inflowsMinor,
                  account.currency,
                  locale,
                  "positive",
                )}
              />
              <SummaryRow
                label={labels.outflows}
                tone="negative"
                value={formatSigned(
                  detail.summary.outflowsMinor,
                  account.currency,
                  locale,
                  "negative",
                )}
              />
              <SummaryRow
                label={labels.netTransfers}
                tone="neutral"
                value={formatSigned(
                  detail.summary.netTransfersMinor,
                  account.currency,
                  locale,
                  "automatic",
                )}
              />
              <SummaryRow
                label={labels.transactionCount}
                tone="neutral"
                value={String(detail.summary.transactionCount)}
              />
            </dl>
          </section>

          <section
            aria-labelledby="account-top-categories"
            className="rounded-[12px] border border-[#e5eaf1] bg-white p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2
                className="text-[14px] font-semibold tracking-[-0.014em] text-[#16213b]"
                id="account-top-categories"
              >
                {labels.topCategories}
              </h2>
              <span className="text-[11px] text-[#71809a]">
                {labels.thisMonth}
              </span>
            </div>
            {detail.topCategories.length ? (
              <ol className="mt-3 divide-y divide-[#edf0f4]">
                {detail.topCategories.map((category) => (
                  <li
                    className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0"
                    key={category.id}
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#263653]">
                      {category.name}
                    </span>
                    <span className="whitespace-nowrap text-[12px] font-medium tabular-nums text-[#1f2f4b]">
                      -
                      {formatOverviewMoney(
                        category.amountMinor,
                        account.currency,
                        locale,
                      )}
                    </span>
                    <span className="w-8 text-right text-[11px] tabular-nums text-[#71809a]">
                      {category.percentage}%
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-[12px] leading-5 text-[#71809a]">
                {labels.topCategoriesEmpty}
              </p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function MovementMetric({
  icon,
  iconClass,
  label,
  value,
  secondary,
  tone,
}: {
  readonly icon: React.ReactNode;
  readonly iconClass: string;
  readonly label: string;
  readonly value: string;
  readonly secondary: string;
  readonly tone: "positive" | "negative" | "neutral";
}) {
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-[11px] border border-[#e5eaf1] bg-white px-4 py-3.5">
      <span
        aria-hidden="true"
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-[11px]",
          iconClass,
        )}
      >
        {icon}
      </span>
      <dl className="min-w-0">
        <dt className="text-[12px] text-[#62738f]">{label}</dt>
        <dd
          className={cn(
            "mt-1 truncate text-[15px] font-semibold tabular-nums tracking-[-0.02em]",
            tone === "positive"
              ? "text-[#078652]"
              : tone === "negative"
                ? "text-[#1b2844]"
                : "text-[#1b2844]",
          )}
        >
          {value}
        </dd>
        <dd className="mt-0.5 text-[11px] text-[#71809a]">{secondary}</dd>
      </dl>
    </article>
  );
}

function Definition({
  label,
  value,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[#71809a]">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-[#243451]">{value}</dd>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <dt className="text-[#71809a]">{label}</dt>
      <dd
        className={cn(
          "whitespace-nowrap font-medium tabular-nums",
          tone === "positive"
            ? "text-[#078652]"
            : tone === "negative"
              ? "text-[#cf3d4c]"
              : "text-[#263653]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function RecentTransactionList({
  detail,
  labels,
  locale,
  now,
  timeZone,
  workspaceSlug,
}: {
  readonly detail: AccountDetail;
  readonly labels: AccountDetailUiLabels;
  readonly locale: string;
  readonly now: string;
  readonly timeZone: string;
  readonly workspaceSlug: string;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-[12px] border border-[#e5eaf1] bg-white">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-160 border-collapse text-left">
          <thead>
            <tr className="border-b border-[#e7ebf1] bg-[#fcfdff]">
              <TableHead>{labels.columns.transaction}</TableHead>
              <TableHead>{labels.columns.category}</TableHead>
              <TableHead>{labels.columns.date}</TableHead>
              <TableHead align="right">{labels.columns.amount}</TableHead>
              <TableHead>{labels.columns.status}</TableHead>
            </tr>
          </thead>
          <tbody>
            {detail.recentTransactions.map((transaction) => (
              <RecentTransactionRow
                desktop
                detail={detail}
                key={transaction.id}
                labels={labels}
                locale={locale}
                now={now}
                timeZone={timeZone}
                transaction={transaction}
                workspaceSlug={workspaceSlug}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-[#edf0f4] md:hidden">
        {detail.recentTransactions.map((transaction) => (
          <RecentTransactionRow
            detail={detail}
            key={transaction.id}
            labels={labels}
            locale={locale}
            now={now}
            timeZone={timeZone}
            transaction={transaction}
            workspaceSlug={workspaceSlug}
          />
        ))}
      </div>
    </div>
  );
}

function TableHead({
  children,
  align = "left",
}: {
  readonly children: React.ReactNode;
  readonly align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-[11px] font-medium text-[#71809a]",
        align === "right" && "text-right",
      )}
      scope="col"
    >
      {children}
    </th>
  );
}

function RecentTransactionRow({
  detail,
  desktop = false,
  labels,
  locale,
  now,
  timeZone,
  transaction,
  workspaceSlug,
}: {
  readonly detail: AccountDetail;
  readonly desktop?: boolean;
  readonly labels: AccountDetailUiLabels;
  readonly locale: string;
  readonly now: string;
  readonly timeZone: string;
  readonly transaction: AccountDetailRecentTransaction;
  readonly workspaceSlug: string;
}) {
  const href = `/w/${workspaceSlug}/transactions/${transaction.id}`;
  const transferLabel =
    transaction.kind === "TRANSFER"
      ? (transaction.movementDirection === "OUTFLOW"
          ? labels.transferTo
          : labels.transferFrom
        ).replace(
          "{account}",
          transaction.transferCounterpartyName ?? labels.transfer,
        )
      : (transaction.merchantName ?? transaction.note ?? labels.uncategorized);
  const category =
    transaction.kind === "TRANSFER"
      ? { key: "transfer", label: labels.transfer }
      : transaction.category;
  const directionPrefix = transaction.movementMinor.startsWith("-") ? "-" : "+";
  const absoluteMinor = transaction.movementMinor.startsWith("-")
    ? transaction.movementMinor.slice(1)
    : transaction.movementMinor;
  const amount = `${directionPrefix}${formatOverviewMoney(absoluteMinor, detail.account.currency, locale)}`;
  const merchant = {
    name: transferLabel,
    description:
      transaction.kind === "TRANSFER" ? transaction.note : transaction.note,
  };
  const date = (
    <TransactionDateCell
      labels={{ today: labels.today, yesterday: labels.yesterday }}
      locale={locale}
      now={now}
      occurredAt={transaction.occurredAt}
      timeZone={timeZone}
    />
  );
  const status = (
    <TransactionStatusBadge
      pendingLabel={labels.pending}
      postedLabel={labels.posted}
      status={transaction.status}
    />
  );
  const amountCell = (
    <span
      aria-label={`${transaction.movementDirection === "INFLOW" ? labels.inflows : labels.outflows}: ${amount}`}
      className={cn(
        "whitespace-nowrap text-[13px] font-semibold tabular-nums",
        transaction.movementDirection === "INFLOW"
          ? "text-[#078652]"
          : "text-[#1b2844]",
      )}
    >
      {amount}
    </span>
  );
  if (!desktop)
    return (
      <article className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <Link
            className="min-w-0 rounded-[7px] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]"
            href={href}
          >
            <TransactionMerchantCell
              category={category}
              kind={transaction.kind}
              merchant={merchant}
            />
          </Link>
          {amountCell}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 pl-11">
          <TransactionCategoryBadge
            category={category}
            uncategorizedLabel={labels.uncategorized}
          />
          {status}
        </div>
        <div className="mt-3 border-t border-[#f0f2f5] pt-3 pl-11">{date}</div>
      </article>
    );
  return (
    <tr className="border-b border-[#edf0f4] last:border-b-0">
      <td className="px-4 py-3.5">
        <Link
          className="block rounded-[7px] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]"
          href={href}
        >
          <TransactionMerchantCell
            category={category}
            kind={transaction.kind}
            merchant={merchant}
          />
        </Link>
      </td>
      <td className="px-4 py-3.5">
        <TransactionCategoryBadge
          category={category}
          uncategorizedLabel={labels.uncategorized}
        />
      </td>
      <td className="px-4 py-3.5">{date}</td>
      <td className="px-4 py-3.5 text-right">{amountCell}</td>
      <td className="px-4 py-3.5">{status}</td>
    </tr>
  );
}

function formatSigned(
  value: string,
  currency: string,
  locale: string,
  direction: "positive" | "negative" | "automatic",
) {
  const minor = BigInt(value);
  if (minor === 0n) return formatOverviewMoney("0", currency, locale);
  if (direction === "negative")
    return `-${formatOverviewMoney(minor < 0n ? -minor : minor, currency, locale)}`;
  if (direction === "positive")
    return `+${formatOverviewMoney(minor < 0n ? -minor : minor, currency, locale)}`;
  return `${minor > 0n ? "+" : "-"}${formatOverviewMoney(minor < 0n ? -minor : minor, currency, locale)}`;
}

function formatDate(value: string, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}
function transactionCountLabel(count: number, labels: AccountDetailUiLabels) {
  return `${count} ${labels.transactions}`;
}
