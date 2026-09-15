import { z } from "zod";

import {
  DEFAULT_TRANSACTION_FILTER_STATE,
  TRANSACTIONS_PAGE_SIZE,
} from "../domain/transaction-list-url";
import type {
  TransactionFilterKind,
  TransactionFilterState,
  TransactionSortValue,
} from "../types/transaction-ui.types";

export type TransactionSearchParams = Record<string, string | string[] | undefined>;

export type ParsedTransactionSearchParams = TransactionFilterState & {
  readonly page: number;
  readonly pageSize: number;
};

const PAGE_MAX = 100_000;
const SEARCH_MAX_LENGTH = 200;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate);

const pageSchema = z.coerce.number().int().min(1).max(PAGE_MAX);
const typeSchema = z.enum(["ALL", "EXPENSE", "INCOME", "TRANSFER", "REFUND"]);
const sortSchema = z.enum(["NEWEST", "OLDEST", "HIGHEST", "LOWEST"]);
const idSchema = z.string().uuid();

export function parseTransactionSearchParams(searchParams: TransactionSearchParams): ParsedTransactionSearchParams {
  const page = pageSchema.safeParse(first(searchParams.page));
  const rawSearch = first(searchParams.q);
  const type = typeSchema.safeParse(first(searchParams.type)?.toUpperCase());
  const category = idSchema.safeParse(first(searchParams.category));
  const account = idSchema.safeParse(first(searchParams.account));
  const from = dateSchema.safeParse(first(searchParams.from));
  const to = dateSchema.safeParse(first(searchParams.to));
  const sort = sortSchema.safeParse(first(searchParams.sort)?.toUpperCase());
  const search = typeof rawSearch === "string" ? rawSearch.trim().slice(0, SEARCH_MAX_LENGTH) : "";
  const dateRange = from.success && to.success && from.data > to.data
    ? { from: undefined, to: undefined }
    : { from: from.success ? from.data : undefined, to: to.success ? to.data : undefined };

  return {
    ...DEFAULT_TRANSACTION_FILTER_STATE,
    page: page.success ? page.data : 1,
    pageSize: TRANSACTIONS_PAGE_SIZE,
    search,
    kind: type.success ? (type.data as TransactionFilterKind) : "ALL",
    categoryId: category.success ? category.data : undefined,
    accountId: account.success ? account.data : undefined,
    from: dateRange.from,
    to: dateRange.to,
    sort: sort.success ? (sort.data as TransactionSortValue) : "NEWEST",
  };
}

export function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 1) - 1 && date.getUTCDate() === day;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
