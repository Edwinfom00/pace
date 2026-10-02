import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import { resolveMerchantLogo } from "@/lib/transaction-visuals/merchant-logo-matcher";
import { resolveTransactionIcon } from "@/lib/transaction-visuals/transaction-icon-matcher";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type {
  LedgerTransactionListFilters,
  LedgerTransactionListRow,
} from "../../ledger/domain";
import type {
  TransactionFilterOptions,
  TransactionFilterState,
  TransactionListItem,
  TransactionListSummary,
  TransactionPaginationState,
  TransactionSummaryTotals,
} from "../types/transaction-ui.types";
import { startOfWorkspaceDay } from "./workspace-date-range";

type TransactionsLedgerRepository = Pick<
  LedgerRepository,
  | "listAccounts"
  | "listCategories"
  | "countTransactionList"
  | "listTransactionListCurrencies"
  | "listTransactionListPage"
  | "summarizeTransactionList"
>;

type TransactionsWorkspaceRepository = Pick<
  WorkspaceRepository,
  "findMembership"
>;

export type GetTransactionsPageInput = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly filters: TransactionFilterState & {
    readonly page: number;
    readonly pageSize: number;
  };
  readonly timeZone: string;
  readonly unknownMerchantName: string;
  readonly summaryCurrency?: string;
};

export type TransactionsPageResult = {
  readonly items: readonly TransactionListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
  readonly pagination: TransactionPaginationState;
  readonly filters: TransactionFilterState;
  readonly options: TransactionFilterOptions;
  /** Amount ordering is safe only for a single-currency filtered result. */
  readonly amountSortingAvailable: boolean;
  readonly summary: TransactionListSummary | null;
};

export async function getTransactionsPage(
  input: GetTransactionsPageInput,
  dependencies: {
    readonly ledger: TransactionsLedgerRepository;
    readonly workspaces: TransactionsWorkspaceRepository;
  },
): Promise<TransactionsPageResult> {
  const membership = await dependencies.workspaces.findMembership(
    input.workspaceId,
    input.actor.userId,
  );
  if (!membership)
    throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const [accounts, categories] = await Promise.all([
    dependencies.ledger.listAccounts(input.workspaceId),
    dependencies.ledger.listCategories(input.workspaceId),
  ]);
  const options: TransactionFilterOptions = {
    // Historical transactions remain filterable for archived accounts.
    accounts: accounts
      .map((account) => ({ id: account.id, label: account.name }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    categories: categories
      .map((category) => ({ id: category.id, label: category.name }))
      .sort((left, right) => left.label.localeCompare(right.label)),
  };
  const filters: TransactionFilterState = {
    ...input.filters,
    categoryId: options.categories.some(
      (category) => category.id === input.filters.categoryId,
    )
      ? input.filters.categoryId
      : undefined,
    accountId: options.accounts.some(
      (account) => account.id === input.filters.accountId,
    )
      ? input.filters.accountId
      : undefined,
  };
  const queryFilters = toLedgerFilters(filters, input.timeZone);
  const [totalCount, currencies, summary] = await Promise.all([
    dependencies.ledger.countTransactionList(input.workspaceId, queryFilters),
    dependencies.ledger.listTransactionListCurrencies(
      input.workspaceId,
      queryFilters,
    ),
    input.summaryCurrency
      ? summarizeTransactions(
          dependencies.ledger,
          input.workspaceId,
          filters,
          input.timeZone,
          input.summaryCurrency,
        )
      : Promise.resolve(null),
  ]);
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / input.filters.pageSize),
  );
  const page = Math.min(Math.max(1, input.filters.page), totalPages);
  const amountSortingAvailable = currencies.length <= 1;
  const sort =
    isAmountSort(filters.sort) && !amountSortingAvailable
      ? "NEWEST"
      : filters.sort;
  const rows = await dependencies.ledger.listTransactionListPage(
    input.workspaceId,
    {
      ...queryFilters,
      offset: (page - 1) * input.filters.pageSize,
      limit: input.filters.pageSize,
      sort,
    },
  );

  return {
    items: rows.map((row) =>
      mapTransactionListItem(row, input.unknownMerchantName),
    ),
    page,
    pageSize: input.filters.pageSize,
    totalCount,
    totalPages,
    pagination: { page, pageSize: input.filters.pageSize, totalCount },
    filters: { ...filters, sort },
    options,
    amountSortingAvailable,
    summary,
  };
}

async function summarizeTransactions(
  ledger: TransactionsLedgerRepository,
  workspaceId: string,
  filters: TransactionFilterState,
  timeZone: string,
  preferredCurrency: string,
): Promise<TransactionListSummary> {
  const previousMonth = previousCalendarMonth(filters.from, filters.to);
  const previousFilters = previousMonth
    ? toLedgerFilters({ ...filters, ...previousMonth }, timeZone)
    : null;
  const [rows, previousRows, previousCount] = await Promise.all([
    ledger.summarizeTransactionList(
      workspaceId,
      toLedgerFilters(filters, timeZone),
    ),
    previousFilters
      ? ledger.summarizeTransactionList(workspaceId, previousFilters)
      : Promise.resolve([]),
    previousFilters
      ? ledger.countTransactionList(workspaceId, previousFilters)
      : Promise.resolve(0),
  ]);
  const currency = rows.length === 1 ? rows[0]!.currency : preferredCurrency;
  const totalsFor = (source: typeof rows): TransactionSummaryTotals => {
    const row = source.find((entry) => entry.currency === currency);
    return {
      incomeMinor: (row?.incomeMinor ?? 0n).toString(),
      spendingMinor: (row?.spendingMinor ?? 0n).toString(),
    };
  };

  return {
    currency,
    current: totalsFor(rows),
    hasOtherCurrencies: rows.some((row) => row.currency !== currency),
    comparison: previousMonth
      ? {
          from: previousMonth.from,
          totalCount: previousCount,
          totals: totalsFor(previousRows),
        }
      : null,
  };
}

export function previousCalendarMonth(
  from: string | undefined,
  to: string | undefined,
): { readonly from: string; readonly to: string } | null {
  if (!from || !to || !from.endsWith("-01")) return null;
  const [year, month] = from.split("-").map(Number);
  if (to !== lastDayOfMonth(year!, month!)) return null;
  const previousYear = month === 1 ? year! - 1 : year!;
  const previousMonth = month === 1 ? 12 : month! - 1;
  return {
    from: `${previousYear}-${String(previousMonth).padStart(2, "0")}-01`,
    to: lastDayOfMonth(previousYear, previousMonth),
  };
}

function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function toLedgerFilters(
  filters: TransactionFilterState,
  timeZone: string,
): LedgerTransactionListFilters {
  return {
    kind: filters.kind === "ALL" ? undefined : filters.kind,
    status: filters.status,
    accountId: filters.accountId,
    categoryId: filters.categoryId,
    occurredFrom: filters.from
      ? startOfWorkspaceDay(filters.from, timeZone)
      : undefined,
    occurredToExclusive: filters.to
      ? startOfWorkspaceDay(nextCalendarDate(filters.to), timeZone)
      : undefined,
    search: filters.search || undefined,
  };
}

export function mapTransactionListItem(
  row: LedgerTransactionListRow,
  unknownMerchantName: string,
): TransactionListItem {
  const merchantName =
    row.merchant?.name ?? row.transaction.note?.trim() ?? unknownMerchantName;
  const icon = resolveTransactionIcon({
    merchantName,
    categoryName: row.category?.name,
    categoryKey: row.category?.systemKey,
    transactionKind: row.transaction.kind,
  });
  const merchantLogo = resolveMerchantLogo({ merchantName });

  return {
    id: row.transaction.id,
    merchant: {
      name: merchantName,
      description: row.transaction.note,
      iconKey: icon.iconKey,
      merchantLogoKey: merchantLogo?.key ?? null,
    },
    amount: {
      currency: row.transaction.currency,
      minor: row.transaction.amountMinor.toString(),
    },
    kind: row.transaction.kind,
    category: row.category
      ? {
          key: row.category.systemKey ?? row.category.id,
          label: row.category.name,
        }
      : null,
    account: row.account
      ? { id: row.account.id, displayName: row.account.name }
      : null,
    occurredAt: row.transaction.occurredAt.toISOString(),
    status: row.transaction.status,
  };
}

function isAmountSort(sort: TransactionFilterState["sort"]): boolean {
  return sort === "HIGHEST" || sort === "LOWEST";
}

function nextCalendarDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + 1));
  return next.toISOString().slice(0, 10);
}
