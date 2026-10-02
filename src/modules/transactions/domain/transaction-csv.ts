import { money, toDecimalString } from "@/money/money";

import type { TransactionListItem } from "../types/transaction-ui.types";

const CSV_HEADER = ["Date", "Merchant", "Description", "Type", "Category", "Account", "Status", "Amount", "Currency"] as const;

export function transactionsToCsv(items: readonly TransactionListItem[], timeZone: string): string {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone });
  const rows = items.map((item) => [
    dateFormatter.format(new Date(item.occurredAt)),
    textCell(item.merchant.name),
    textCell(item.merchant.description ?? ""),
    item.kind,
    textCell(item.category?.label ?? ""),
    textCell(item.account?.displayName ?? ""),
    item.status,
    signedAmount(item),
    item.amount.currency,
  ]);
  return [CSV_HEADER, ...rows].map((row) => row.map(quoteCell).join(",")).join("\r\n");
}

export function transactionCsvFileName(now: Date): string {
  return `pace-transactions-${now.toISOString().slice(0, 10)}.csv`;
}

function signedAmount(item: TransactionListItem): string {
  const minor = BigInt(item.amount.minor);
  const absolute = minor < 0n ? -minor : minor;
  return toDecimalString(money(item.amount.currency, item.kind === "EXPENSE" ? -absolute : absolute));
}

// Neutralises spreadsheet formula injection from user-controlled text.
function textCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function quoteCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
