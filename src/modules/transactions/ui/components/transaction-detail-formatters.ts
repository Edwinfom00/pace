import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";

import type { TransactionDetailData } from "../../domain/transaction-detail";

export function formatTransactionDetailAmount(
  amount: TransactionDetailData["amount"],
  kind: TransactionDetailData["kind"],
  locale: string,
): string {
  const formatted = formatOverviewMoney(amount.minor, amount.currency, locale).replace(/^-/, "");
  if (kind === "EXPENSE") return `−${formatted}`;
  if (kind === "INCOME" || kind === "REFUND") return `+${formatted}`;
  return formatted;
}

export function formatDetailDate(value: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

export function formatDetailTime(value: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function formatDetailTimestamp(value: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

export function formatDetailMonth(value: string, locale: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)));
}

export function transactionKindLabel(kind: TransactionDetailData["kind"]): string {
  switch (kind) {
    case "EXPENSE": return "Expense";
    case "INCOME": return "Income";
    case "TRANSFER": return "Transfer";
    case "REFUND": return "Refund";
  }
}

export function transactionStatusLabel(status: TransactionDetailData["status"]): string {
  return status === "POSTED" ? "Posted" : "Pending";
}
