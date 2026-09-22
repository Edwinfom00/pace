import assert from "node:assert/strict";
import test from "node:test";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import type { AuthenticatedActor } from "@/authorization/session";
import type { RecurringPaymentView } from "@/modules/financial-inbox/financial-inbox-service";
import type { InsightRecord } from "@/modules/insights/domain";
import { periodForLocalDates } from "@/money/period";
import {
  buildOverviewDailyBrief,
  buildOverviewUpcomingBills,
  nextExpectedRecurringDate,
  overviewUpcomingBillsPath,
} from "@/modules/overview/domain/overview-right-rail";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import { getOverviewRightRailWithReaders } from "@/modules/overview/queries/get-overview-right-rail";

const actor: AuthenticatedActor = { userId: "member-1", email: "member@example.com", name: "Member" };
const labels = getDashboardLabels("en");

function insight(
  id: string,
  type: InsightRecord["type"],
  overrides: Partial<InsightRecord> = {},
): InsightRecord {
  const now = new Date("2026-09-20T12:00:00.000Z");
  return {
    id,
    workspaceId: "workspace-a",
    type,
    severity: "INFO",
    data: { currency: "XAF" },
    periodStart: new Date("2026-09-01T00:00:00.000Z"),
    periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    status: "ACTIVE",
    readAt: null,
    dismissedAt: null,
    resolvedAt: null,
    lastDetectedAt: now,
    createdAt: now,
    updatedAt: now,
    source: "MONEY_ENGINE",
    fingerprint: id,
    expiresAt: null,
    ...overrides,
  };
}

function recurring(id: string, overrides: Partial<RecurringPaymentView> = {}): RecurringPaymentView {
  return {
    id,
    normalizedMerchant: "netflix",
    displayName: null,
    origin: "DETECTED",
    direction: "EXPENSE",
    accountId: null,
    categoryId: null,
    status: "CONFIRMED",
    cadenceDays: 30,
    typicalAmountMinor: "5700",
    currency: "XAF",
    firstOccurredAt: "2026-07-01T12:00:00.000Z",
    lastOccurredAt: "2026-09-01T12:00:00.000Z",
    nextOccurrenceAt: null,
    sampleTransactionIds: [],
    updatedAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

test("daily brief prioritizes active M6 insights, caps the preview, and carries domain tone", () => {
  const brief = buildOverviewDailyBrief([
    insight("drop", "CATEGORY_DROP", { data: { currency: "XAF", changeMinor: "1200" } }),
    insight("budget", "BUDGET_EXCEEDED", { severity: "CRITICAL", data: { currency: "XAF", spentMinor: "9000", budgetMinor: "8000" } }),
    insight("goal", "GOAL_OFF_TRACK", { severity: "WARNING", data: { currency: "XAF", currentSavedMinor: "4000", targetMinor: "10000" } }),
    insight("dismissed", "SPENDING_PACE_LOW", { status: "DISMISSED" }),
    insight("pace", "SPENDING_PACE_LOW", { data: { currency: "XAF", spentMinor: "2000", expectedMinor: "3000" } }),
  ], "en", labels, "en-US");

  assert.deepEqual(brief.items.map((item) => item.id), ["budget", "goal", "drop"]);
  assert.equal(brief.items[0]?.tone, "attention");
  assert.equal(brief.items[2]?.tone, "positive");
  assert.equal(brief.items[0]?.description, "FCFA 9,000 of FCFA 8,000 spent.");
  assert.equal(brief.tip?.insightId, "pace");
});

test("daily brief stays honest when no meaningful insight or eligible tip exists", () => {
  const empty = buildOverviewDailyBrief([], "en", labels, "en-US");
  const noTip = buildOverviewDailyBrief([insight("new", "NEW_RECURRING_PAYMENT")], "en", labels, "en-US");

  assert.deepEqual(empty.items, []);
  assert.equal(empty.tip, null);
  assert.equal(noTip.tip, null);
});

test("upcoming bills use only confirmed recurring records, local calendar dates, and the preview limit", () => {
  const bills = buildOverviewUpcomingBills([
    recurring("internet", { normalizedMerchant: "internet", cadenceDays: 30, typicalAmountMinor: "15000", lastOccurredAt: "2026-09-03T12:00:00.000Z" }),
    recurring("candidate", { status: "CANDIDATE", normalizedMerchant: "candidate" }),
    recurring("rent", { normalizedMerchant: "rent", cadenceDays: 30, typicalAmountMinor: "250000", lastOccurredAt: "2026-09-01T12:00:00.000Z" }),
    recurring("netflix"),
  ], "Africa/Douala", new Date("2026-09-20T12:00:00.000Z"), 2);

  assert.deepEqual(bills.map((bill) => bill.recurringId), ["netflix", "rent"]);
  assert.equal(bills[0]?.merchantName, "Netflix");
  assert.equal(bills[0]?.nextExpectedAt, "2026-09-30T23:00:00.000Z");
  assert.equal(formatOverviewMoney(bills[0]?.amountMinor ?? "0", bills[0]?.currency ?? "XAF", "fr-CM"), "5 700 FCFA");
  assert.equal(overviewUpcomingBillsPath("home"), "/w/home/recurring");
  assert.equal(nextExpectedRecurringDate("2026-09-01T23:00:00.000Z", 30, new Date("2026-09-20T12:00:00.000Z"), "Africa/Douala"), "2026-10-01T23:00:00.000Z");
});

test("right-rail readers retain workspace scope and degrade each section independently", async () => {
  const requested: string[] = [];
  const result = await getOverviewRightRailWithReaders({
    actor,
    workspaceId: "workspace-a",
    language: "en",
    labels,
    locale: "en-US",
    timeZone: "UTC",
    period: periodForLocalDates("2026-09-01", "2026-10-01", "UTC"),
    now: new Date("2026-09-20T12:00:00.000Z"),
  }, {
    listInsights: async (_actor, workspaceId) => {
      requested.push(`insights:${workspaceId}`);
      return [insight("pace", "SPENDING_PACE_LOW", { data: { currency: "XAF", spentMinor: "2000", expectedMinor: "3000" } })];
    },
    listRecurring: async (_actor, workspaceId) => {
      requested.push(`recurring:${workspaceId}`);
      throw new Error("recurring temporarily unavailable");
    },
  });

  assert.deepEqual(requested, ["insights:workspace-a", "recurring:workspace-a"]);
  assert.equal(result.dailyBrief?.items.length, 1);
  assert.equal(result.upcomingBills, null);
  assert.equal(result.dailyBriefUnavailable, false);
  assert.equal(result.upcomingBillsUnavailable, true);
});
