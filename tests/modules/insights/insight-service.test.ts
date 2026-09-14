import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import type { LedgerTransactionRecord } from "@/modules/ledger/domain";
import { InsightService } from "@/modules/insights/insight-service";
import { presentInsight } from "@/modules/insights/presenters";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryInsightRepository } from "../../support/in-memory-insight-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner", email: "owner@pace.test", name: "Owner" };
const member: AuthenticatedActor = { userId: "member", email: "member@pace.test", name: "Member" };
const firstWorkspace = "workspace-one";
const secondWorkspace = "workspace-two";
const now = new Date("2026-03-15T12:00:00.000Z");

function ledgerTransaction(
  id: string,
  workspaceId: string,
  amountMinor: bigint,
  occurredAt: string,
): LedgerTransactionRecord {
  return {
    id,
    workspaceId,
    kind: "EXPENSE",
    status: "POSTED",
    amountMinor,
    currency: "USD",
    occurredAt: new Date(occurredAt),
    accountId: "cash",
    transferAccountId: null,
    categoryId: "groceries",
    merchantId: "market",
    createdByUserId: owner.userId,
    paidByUserId: null,
    transferGroupId: null,
    refundedTransactionId: null,
    source: { provider: "manual" },
    deduplicationFingerprint: null,
    note: null,
    createdAt: new Date(occurredAt),
    updatedAt: new Date(occurredAt),
  };
}

async function fixture() {
  const workspaces = new InMemoryWorkspaceRepository();
  const repository = new InMemoryInsightRepository();
  const workspaceRecords: WorkspaceRecord[] = [firstWorkspace, secondWorkspace].map((id) => ({
    id,
    name: id,
    type: "PERSONAL",
    createdByUserId: owner.userId,
    createdAt: now,
    updatedAt: now,
  }));
  for (const workspace of workspaceRecords) {
    await workspaces.createWorkspaceWithOwner({
      workspace,
      preferences: { currency: "USD", locale: "en-US", timezone: "UTC", weekStartsOn: 1 },
      owner: { workspaceId: workspace.id, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now },
    });
    repository.settings.set(workspace.id, { workspaceId: workspace.id, currency: "USD", timezone: "UTC" });
  }
  workspaces.addMembership({
    workspaceId: firstWorkspace,
    userId: member.userId,
    role: "MEMBER",
    invitedByUserId: owner.userId,
    joinedAt: now,
  });
  repository.setRecipients(firstWorkspace, [
    { workspaceId: firstWorkspace, userId: owner.userId, language: "en", dailyEnabled: true, weeklyEnabled: true, monthlyEnabled: true, minimumSeverity: "INFO", createdAt: now, updatedAt: now },
    { workspaceId: firstWorkspace, userId: member.userId, language: "fr", dailyEnabled: true, weeklyEnabled: true, monthlyEnabled: true, minimumSeverity: "WARNING", createdAt: now, updatedAt: now },
  ]);
  repository.setRecipients(secondWorkspace, [
    { workspaceId: secondWorkspace, userId: owner.userId, language: "en", dailyEnabled: true, weeklyEnabled: true, monthlyEnabled: true, minimumSeverity: "INFO", createdAt: now, updatedAt: now },
  ]);
  const transactions = [
    ledgerTransaction("previous", firstWorkspace, 100n, "2026-02-10T12:00:00.000Z"),
    ledgerTransaction("current", firstWorkspace, 250n, "2026-03-10T12:00:00.000Z"),
  ];
  const ledger = {
    listTransactions: async (workspaceId: string) => transactions.filter((entry) => entry.workspaceId === workspaceId),
    listMerchants: async () => [{ id: "market", workspaceId: firstWorkspace, name: "Market", normalizedName: "market", createdByUserId: owner.userId, createdAt: now, updatedAt: now }],
  };
  const plans = {
    listBudgets: async () => [],
    listSavingsGoals: async (workspaceId: string) => workspaceId === firstWorkspace ? [{
      id: "goal",
      workspaceId: firstWorkspace,
      name: "Emergency fund",
      targetAmountMinor: 1_000n,
      currentSavedMinor: 100n,
      currency: "USD",
      targetDate: new Date("2026-04-01T00:00:00.000Z"),
      status: "ACTIVE" as const,
      createdByUserId: owner.userId,
      updatedByUserId: owner.userId,
      createdByAgentActionId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: now,
    }] : [],
  };
  const inbox = { listRecurringPayments: async () => [] };
  const service = new InsightService(repository, ledger, plans, inbox, workspaces);
  return { repository, service, transactions };
}

test("insight persistence deduplicates, resolves stale facts, and respects workspace isolation", async () => {
  const { repository, service, transactions } = await fixture();
  const first = await service.refreshForMember(owner, firstWorkspace, now);
  assert.ok(first.insights.length > 0);
  assert.equal(first.newlyActive.length, first.insights.length);
  const firstCount = repository.records.size;

  const second = await service.refreshForMember(owner, firstWorkspace, now);
  assert.equal(repository.records.size, firstCount);
  assert.equal(second.newlyActive.length, 0);
  const active = first.insights[0]!;
  assert.equal((await service.markRead(owner, firstWorkspace, active.id)).status, "READ");

  transactions.splice(0);
  const cleared = await service.refreshForMember(owner, firstWorkspace, now);
  assert.ok(cleared.resolvedCount > 0);
  assert.equal((await repository.findInsight(firstWorkspace, active.id))?.status, "RESOLVED");
  assert.deepEqual(await service.listInsights(owner, secondWorkspace), []);
  await assert.rejects(service.listInsights(member, secondWorkspace), AuthorizationError);
});

test("member preferences, member language, and schedule review noise controls stay private", async () => {
  const { repository, service } = await fixture();
  await service.updateNotificationPreference(owner, firstWorkspace, {
    dailyEnabled: false,
    weeklyEnabled: true,
    monthlyEnabled: true,
    minimumSeverity: "INFO",
  });
  const scheduled = await service.runProactiveReview("DAILY", now);
  assert.ok(scheduled.notificationCount > 0);
  assert.equal((await repository.listNotifications(firstWorkspace, owner.userId)).length, 0);
  const memberNotifications = await repository.listNotifications(firstWorkspace, member.userId);
  assert.ok(memberNotifications.length > 0);
  assert.equal(memberNotifications[0]?.language, "fr");
  const translationKey = memberNotifications[0]?.payload.translationKey;
  assert.equal(typeof translationKey, "string");
  assert.ok(typeof translationKey === "string" && translationKey.startsWith("insights.type."));
  assert.equal((await repository.listNotifications(secondWorkspace, owner.userId)).length, 0);

  const notification = memberNotifications[0]!;
  assert.equal((await service.markNotificationRead(member, firstWorkspace, notification.id)).status, "READ");
  const sameInsight = (await service.listInsights(member, firstWorkspace))[0]!;
  const english = presentInsight(sameInsight, "en");
  const french = presentInsight(sameInsight, "fr");
  assert.notEqual(english.title, french.title);
  assert.deepEqual(english.data, french.data);
  assert.equal(english.suggestedAction, "REVIEW_TRANSACTIONS");
});

test("plan-oriented insights reuse the established M3 approval flow rather than adding an insight mutation", async () => {
  const { service } = await fixture();
  const result = await service.refreshForMember(owner, firstWorkspace, now);
  const goalInsight = result.insights.find((insight) => insight.type === "GOAL_OFF_TRACK");
  assert.ok(goalInsight);
  assert.equal(presentInsight(goalInsight, "en").suggestedAction, "REVIEW_PLAN");
  const instructions = await readFile("agent/instructions.md", "utf8");
  assert.match(instructions, /get_plan_context → create_plan_draft → submit_plan_draft/);
  // The service constructor accepts only list methods from PlansRepository. TypeScript prevents an insight from bypassing M3.
  assert.equal(typeof service.refreshWorkspace, "function");
});
