import type { RecurringPaymentStatus } from "@/modules/financial-inbox/domain";
import type { SerializedMoney, TransactionListItem } from "@/modules/transactions/types/transaction-ui.types";

import type { RecurringCapabilities } from "./recurring-action-policy";

export const RECURRING_DETAIL_TABS = ["overview", "history", "upcoming", "transactions"] as const;
export type RecurringDetailTab = (typeof RECURRING_DETAIL_TABS)[number];

export type RecurringDetailOccurrence = {
  readonly date: string;
  readonly amount: SerializedMoney;
};

export type RecurringDetailHistory = RecurringDetailOccurrence & {
  readonly transaction: TransactionListItem;
};


export type RecurringDetail = {
  readonly id: string;
  readonly title: string;
  readonly direction: "OUTFLOW" | "INFLOW";
  readonly status: RecurringPaymentStatus;
  readonly lifecycle: "ACTIVE" | "PAUSED";
  readonly reviewState: "NEEDS_REVIEW" | null;
  readonly capabilities: RecurringCapabilities;
  readonly amount: SerializedMoney & { readonly kind: "TYPICAL" };
  readonly cadenceDays: number;
  readonly startedAt: string;
  /** The latest canonical matched date, not a retrospective projection. */
  readonly lastOccurrenceAt: string | null;
  readonly nextOccurrenceAt: string | null;
  readonly account: { readonly id: string; readonly name: string } | null;
  readonly category: { readonly id: string; readonly name: string; readonly systemKey: string | null } | null;
  readonly merchant: { readonly id: string; readonly name: string } | null;
  readonly origin: "DETERMINISTIC_DETECTION" | "MANUAL";
  readonly sampleCount: number;
  /** Canonical optimistic-concurrency token for review-state actions. */
  readonly updatedAt: string;
  readonly upcomingOccurrences: readonly RecurringDetailOccurrence[];
  readonly history: readonly RecurringDetailHistory[];
  readonly relatedTransactions: readonly TransactionListItem[];
};

export function parseRecurringDetailTab(value: string | string[] | undefined): RecurringDetailTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return RECURRING_DETAIL_TABS.includes(candidate as RecurringDetailTab)
    ? candidate as RecurringDetailTab
    : "overview";
}
