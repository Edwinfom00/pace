import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";

import type { SerializedMoney, TransactionListItem } from "../../types/transaction-ui.types";

export type TransactionDateLabels = {
  readonly today: string;
  readonly yesterday: string;
};

export function formatTransactionAmount(
  amount: SerializedMoney,
  kind: TransactionListItem["kind"],
  locale: string,
): string {
  const formatted = formatOverviewMoney(amount.minor, amount.currency, locale).replace(/^-/, "");

  if (kind === "EXPENSE") return `−${formatted}`;
  if (kind === "INCOME" || kind === "REFUND") return `+${formatted}`;
  return formatted;
}

export function transactionAmountTone(kind: TransactionListItem["kind"]): "positive" | "neutral" {
  return kind === "INCOME" || kind === "REFUND" ? "positive" : "neutral";
}

export function formatTransactionDate(
  occurredAt: string,
  now: string,
  locale: string,
  timeZone: string,
  labels: TransactionDateLabels,
): string {
  const dayDistance = localDayNumber(now, timeZone) - localDayNumber(occurredAt, timeZone);
  const date = new Date(occurredAt);

  if (dayDistance === 0) {
    const time = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(date);
    return `${labels.today}, ${time}`;
  }

  if (dayDistance === 1) return labels.yesterday;

  const currentYear = localYear(now, timeZone);
  const occurredYear = localYear(occurredAt, timeZone);
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(occurredYear === currentYear ? {} : { year: "numeric" }),
    timeZone,
  }).format(date);
}

function localDayNumber(instant: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value;
  return Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day"))) / 86_400_000;
}

function localYear(instant: string, timeZone: string): string | undefined {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone })
    .formatToParts(new Date(instant))
    .find((part) => part.type === "year")?.value;
}
