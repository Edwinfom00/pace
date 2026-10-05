import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { localDateForInstant, localDateKey } from "@/money/period";
import { parseAmountToMinor } from "@/modules/agent-actions/transaction-draft";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { AgentTransactionSearchQuery } from "../domain/agent-transaction-query";
import { DEFAULT_TRANSACTION_FILTER_STATE } from "../domain/transaction-list-url";
import type { TransactionListItem } from "../types/transaction-ui.types";
import { getTransactionDetail } from "./get-transaction-detail";
import { getTransactionsPage } from "./get-transactions-page";

type ReadDependencies = {
  readonly ledger: Parameters<typeof getTransactionsPage>[1]["ledger"] &
    Parameters<typeof getTransactionDetail>[1]["ledger"];
  readonly workspaces: Pick<WorkspaceRepository, "findMembership" | "findMemberContext">;
};

type ReadScope = { readonly actor: AuthenticatedActor; readonly workspaceId: string };

const AMOUNT_SCAN_SIZE = 100;

/**
 * The assistant's list, search, and totals read. It is the Transactions page
 * query with a server-resolved period: rows, counts, and spending and income
 * totals all come from the canonical ledger list, so the model never adds up
 * money or decides which calendar days "this week" covers.
 */
export async function searchAgentTransactions(
  input: ReadScope & { readonly query: AgentTransactionSearchQuery; readonly now?: Date },
  dependencies: ReadDependencies,
) {
  const member = await dependencies.workspaces.findMemberContext(input.workspaceId, input.actor.userId);
  if (!member) throw new AuthorizationError("You are not a member of this workspace.");
  const { currency, timezone, weekStartsOn } = member.preferences;
  const { query } = input;

  const amountMinor = query.amountText ? parseAmountToMinor(query.amountText, currency) : null;
  if (query.amountText && !amountMinor) throw new ConflictError("The amount to search for could not be read.");
  const range = resolveAgentTransactionRange(query, { timezone, weekStartsOn }, input.now ?? new Date());

  const page = await getTransactionsPage(
    {
      actor: input.actor,
      workspaceId: input.workspaceId,
      filters: {
        ...DEFAULT_TRANSACTION_FILTER_STATE,
        kind: query.kind ?? "ALL",
        search: query.search ?? "",
        accountId: query.accountId,
        categoryId: query.categoryId,
        from: range?.from,
        to: range?.to,
        page: 1,
        pageSize: amountMinor ? AMOUNT_SCAN_SIZE : query.limit,
      },
      timeZone: timezone,
      unknownMerchantName: "Transaction",
      summaryCurrency: currency,
    },
    dependencies,
  );
  // The page query drops a filter id it does not recognise. For the assistant
  // that would silently widen the answer, so an unknown id is an error instead.
  if (page.filters.accountId !== query.accountId) throw new NotFoundError("Account not found in this workspace.");
  if (page.filters.categoryId !== query.categoryId) throw new NotFoundError("Category not found in this workspace.");

  const items = amountMinor
    ? page.items.filter((item) => item.amount.minor === amountMinor).slice(0, query.limit)
    : page.items;
  const totals = page.summary;

  return {
    currency,
    timeZone: timezone,
    period: range,
    matchedCount: amountMinor ? items.length : page.totalCount,
    transactions: items.map(presentAgentTransaction),
    // Totals describe every transaction matching the filters, not only the
    // returned rows, so they are withheld when rows were narrowed by amount.
    totals:
      totals && !amountMinor
        ? {
            spending: { minorUnits: totals.current.spendingMinor, currency: totals.currency },
            income: { minorUnits: totals.current.incomeMinor, currency: totals.currency },
            hasOtherCurrencies: totals.hasOtherCurrencies,
          }
        : null,
  };
}

export async function getAgentTransactionDetail(
  input: ReadScope & { readonly transactionId: string },
  dependencies: ReadDependencies,
) {
  const member = await dependencies.workspaces.findMemberContext(input.workspaceId, input.actor.userId);
  if (!member) throw new AuthorizationError("You are not a member of this workspace.");
  const detail = await getTransactionDetail({ ...input, timeZone: member.preferences.timezone }, dependencies);
  if (!detail) throw new NotFoundError("Transaction not found in this workspace.");
  return detail;
}

export function resolveAgentTransactionRange(
  query: Pick<AgentTransactionSearchQuery, "period" | "from" | "to">,
  preferences: { readonly timezone: string; readonly weekStartsOn: number },
  now: Date,
): { readonly from: string; readonly to: string } | null {
  if (!query.period) {
    if (!query.from && !query.to) return null;
    const from = query.from ?? query.to!;
    const to = query.to ?? query.from!;
    if (from > to) throw new ConflictError("The start date must not be after the end date.");
    return { from, to };
  }

  const today = localDateForInstant(now, preferences.timezone);
  const day = (offset: number) => new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
  const key = (date: Date) =>
    localDateKey({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
  const month = (offset: number) => ({
    from: key(new Date(Date.UTC(today.year, today.month - 1 + offset, 1))),
    to: key(new Date(Date.UTC(today.year, today.month + offset, 0))),
  });
  const sinceWeekStart = (day(0).getUTCDay() - preferences.weekStartsOn + 7) % 7;

  switch (query.period) {
    case "TODAY":
      return { from: key(day(0)), to: key(day(0)) };
    case "YESTERDAY":
      return { from: key(day(-1)), to: key(day(-1)) };
    case "THIS_WEEK":
      return { from: key(day(-sinceWeekStart)), to: key(day(6 - sinceWeekStart)) };
    case "LAST_WEEK":
      return { from: key(day(-sinceWeekStart - 7)), to: key(day(-sinceWeekStart - 1)) };
    case "THIS_MONTH":
      return month(0);
    case "LAST_MONTH":
      return month(-1);
  }
}

function presentAgentTransaction(item: TransactionListItem) {
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    merchantName: item.merchant.name,
    note: item.merchant.description ?? null,
    amount: { minorUnits: item.amount.minor, currency: item.amount.currency },
    categoryName: item.category?.label ?? null,
    categoryKey: item.category?.key ?? null,
    accountName: item.account?.displayName ?? null,
    iconKey: item.merchant.iconKey ?? null,
    merchantLogoKey: item.merchant.merchantLogoKey ?? null,
    occurredAt: item.occurredAt,
  };
}
