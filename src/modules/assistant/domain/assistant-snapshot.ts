import type { OverviewKpiTrend } from "@/modules/overview/domain/overview.types";

export type AssistantSnapshotMetric = {
  readonly minor: string;
  readonly trend: OverviewKpiTrend | null;
};

export type AssistantSnapshotUpcoming = {
  readonly recurringId: string;
  readonly name: string;
  readonly nextExpectedAt: string;
  readonly amountMinor: string;
  readonly currency: string;
};

export type AssistantSnapshot = {
  readonly currency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly periodStart: string;
  readonly balance: { readonly minor: string; readonly accountCount: number } | null;
  readonly spending: AssistantSnapshotMetric | null;
  readonly income: AssistantSnapshotMetric | null;
  readonly inboxCount: number | null;
  readonly upcoming: readonly AssistantSnapshotUpcoming[];
};

export function hasAssistantSnapshotData(snapshot: AssistantSnapshot): boolean {
  return Boolean(
    snapshot.balance ||
      snapshot.spending ||
      snapshot.income ||
      snapshot.inboxCount !== null ||
      snapshot.upcoming.length > 0,
  );
}
