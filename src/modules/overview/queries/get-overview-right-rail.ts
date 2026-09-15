import type { AuthenticatedActor } from "@/authorization/session";
import type { DashboardLabels } from "@/i18n/dashboard-messages";
import type { Period } from "@/money/period";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import { getInsightService } from "@/modules/insights/server";

import {
  buildOverviewDailyBrief,
  buildOverviewUpcomingBills,
  type OverviewDailyBrief,
  type OverviewUpcomingBill,
} from "../domain/overview-right-rail";

export interface OverviewRightRailData {
  readonly dailyBrief: OverviewDailyBrief | null;
  readonly upcomingBills: readonly OverviewUpcomingBill[] | null;
  readonly dailyBriefUnavailable: boolean;
  readonly upcomingBillsUnavailable: boolean;
}

export interface GetOverviewRightRailInput {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly language: string;
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly period: Period;
  readonly now?: Date;
}

export interface OverviewRightRailReaders {
  readonly listInsights: (actor: AuthenticatedActor, workspaceId: string) => Promise<Awaited<ReturnType<ReturnType<typeof getInsightService>["listInsights"]>>>;
  readonly listRecurring: (actor: AuthenticatedActor, workspaceId: string) => Promise<Awaited<ReturnType<ReturnType<typeof getFinancialInboxService>["listRecurring"]>>>;
}

export async function getOverviewRightRail({
  ...input
}: GetOverviewRightRailInput): Promise<OverviewRightRailData> {
  return getOverviewRightRailWithReaders(input, {
    listInsights: (actor, workspaceId) => getInsightService().listInsights(actor, workspaceId),
    listRecurring: (actor, workspaceId) => getFinancialInboxService().listRecurring(actor, workspaceId),
  });
}

export async function getOverviewRightRailWithReaders({
  actor,
  workspaceId,
  language,
  labels,
  locale,
  timeZone,
  period,
  now = new Date(),
}: GetOverviewRightRailInput, readers: OverviewRightRailReaders): Promise<OverviewRightRailData> {
  const [insightResult, recurringResult] = await Promise.allSettled([
    readers.listInsights(actor, workspaceId),
    readers.listRecurring(actor, workspaceId),
  ]);

  return {
    dailyBrief: insightResult.status === "fulfilled"
      ? buildOverviewDailyBrief(insightResult.value, language, labels, locale, period)
      : null,
    upcomingBills: recurringResult.status === "fulfilled"
      ? buildOverviewUpcomingBills(recurringResult.value, timeZone, now)
      : null,
    dailyBriefUnavailable: insightResult.status === "rejected",
    upcomingBillsUnavailable: recurringResult.status === "rejected",
  };
}
