import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError, DomainConflictError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import type { FinancialInboxItemRecord, RecurringPaymentRecord } from "@/modules/financial-inbox/domain";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { buildRecurringOverview } from "@/modules/recurring/domain/recurring-overview";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import { InMemoryLedgerRepository, SYSTEM_OTHER_EXPENSE_ID } from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceId = "workspace-one";
const foreignWorkspaceId = "workspace-two";
const now = new Date("2026-09-22T12:00:00.000Z");

async function createFixture() {
  const financial = new InMemoryFinancialInboxRepository();
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const service = new FinancialInboxService(financial, ledgerRecords, workspaces);
  for (const id of [workspaceId, foreignWorkspaceId]) {
    const workspace: WorkspaceRecord = {
      id,
      name: id,
      slug: id,
      type: "PERSONAL",
      createdByUserId: owner.userId,
      createdAt: now,
      updatedAt: now,
    };
    await workspaces.createWorkspaceWithOwner({
      workspace,
      preferences: { currency: "XAF", locale: "fr-CM", timezone: "Africa/Douala", weekStartsOn: 1 },
      owner: { workspaceId: id, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now },
      initialAccount: {
        id: `${id}-initial`, workspaceId: id, name: "Initial", type: "CHECKING", currency: "XAF", createdByUserId: owner.userId,
      },
    });
  }
  workspaces.addMembership({
    workspaceId, userId: viewer.userId, role: "VIEWER", invitedByUserId: owner.userId, joinedAt: now,
  });
  const account = await ledger.createAccount(owner, workspaceId, {
    name: "Main account", type: "CHECKING", currency: "XAF",
  });
  return { account, financial, ledgerRecords, service };
}

async function createCandidate(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  id = "recurring-1",
): Promise<RecurringPaymentRecord> {
  return fixture.financial.createRecurringPayment({
    id,
    workspaceId,
    detectionKey: `detected:${id}`,
    normalizedMerchant: "netflix",
    displayName: null,
    origin: "DETECTED",
    direction: "EXPENSE",
    accountId: fixture.account.id,
    categoryId: SYSTEM_OTHER_EXPENSE_ID,
    currency: "XAF",
    typicalAmountMinor: 6500n,
    amountToleranceBps: 500,
    cadenceDays: 30,
    firstOccurredAt: new Date("2026-06-01T12:00:00.000Z"),
    lastOccurredAt: new Date("2026-09-01T12:00:00.000Z"),
    nextOccurrenceAt: null,
    sampleTransactionIds: ["evidence-1", "evidence-2"],
    status: "CANDIDATE",
    lifecycle: "ACTIVE",
    createdByUserId: owner.userId,
    idempotencyKey: null,
    commandFingerprint: null,
    confirmedByUserId: null,
    confirmedAt: null,
    ignoredByUserId: null,
    ignoredAt: null,
  });
}

async function createRecurringInbox(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  recurringPaymentId: string,
  id = "inbox-recurring-1",
  transactionId = "transaction-1",
): Promise<FinancialInboxItemRecord> {
  return fixture.financial.createInboxItem({
    id,
    workspaceId,
    transactionId,
    classificationId: null,
    recurringPaymentId,
    reason: "POSSIBLE_RECURRING",
    actions: ["CONFIRM_RECURRING", "IGNORE_RECURRING"],
    status: "OPEN",
    details: { cadenceDays: 30 },
    resolvedByUserId: null,
    resolvedAt: null,
  });
}

async function createOtherInboxReason(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  id = "inbox-other-1",
  transactionId = "transaction-1",
): Promise<FinancialInboxItemRecord> {
  return fixture.financial.createInboxItem({
    id,
    workspaceId,
    transactionId,
    classificationId: null,
    recurringPaymentId: null,
    reason: "MERCHANT_AMBIGUITY",
    actions: ["DISMISS"],
    status: "OPEN",
    details: {},
    resolvedByUserId: null,
    resolvedAt: null,
  });
}

test("Inbox confirm runs the canonical transition, settles linked recurring rows, and leaves financial truth unchanged", async () => {
  const fixture = await createFixture();
  const candidate = await createCandidate(fixture);
  const first = await createRecurringInbox(fixture, candidate.id);
  const second = await createRecurringInbox(fixture, candidate.id, "inbox-recurring-2", "transaction-2");
  const beforeBalance = await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id);
  const transactionCount = fixture.ledgerRecords.transactions.size;

  const result = await fixture.service.confirmInboxRecurring(owner, {
    workspaceId,
    inboxItemId: first.id,
    expectedInboxUpdatedAt: first.updatedAt,
    idempotencyKey: "inbox-confirm-1",
  });

  const stored = await fixture.financial.findRecurringPaymentById(workspaceId, candidate.id);
  const afterBalance = await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id);
  assert.equal(result.item.status, "RESOLVED");
  assert.equal(result.recurring.status, "CONFIRMED");
  assert.deepEqual(new Set(result.resolvedInboxItemIds), new Set([first.id, second.id]));
  assert.equal((await fixture.financial.findInboxItem(workspaceId, second.id))?.status, "RESOLVED");
  assert.deepEqual(stored?.sampleTransactionIds, candidate.sampleTransactionIds);
  assert.equal(fixture.ledgerRecords.transactions.size, transactionCount);
  assert.deepEqual(afterBalance, beforeBalance);
  assert.equal([...fixture.financial.audit.values()].length, 1);
  assert.equal([...fixture.financial.audit.values()][0]?.event, "RECURRING_CONFIRMED");

  const overview = buildRecurringOverview({
    payments: await fixture.service.listRecurring(owner, workspaceId),
    accounts: await fixture.ledgerRecords.listAccounts(workspaceId),
    categories: await fixture.ledgerRecords.listCategories(workspaceId),
    filter: "ALL",
    timeZone: "UTC",
    now,
    workspaceRole: "OWNER",
  });
  assert.equal(overview.items[0]?.status, "CONFIRMED");
});

test("Inbox ignore retains recurring evidence and exposes the authoritative ignored state", async () => {
  const fixture = await createFixture();
  const candidate = await createCandidate(fixture);
  const item = await createRecurringInbox(fixture, candidate.id);
  const beforeBalance = await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id);
  const transactionCount = fixture.ledgerRecords.transactions.size;

  const result = await fixture.service.ignoreInboxRecurring(owner, {
    workspaceId,
    inboxItemId: item.id,
    expectedInboxUpdatedAt: item.updatedAt,
    idempotencyKey: "inbox-ignore-1",
    reason: "Not a subscription",
  });

  const stored = await fixture.financial.findRecurringPaymentById(workspaceId, candidate.id);
  assert.equal(result.item.status, "RESOLVED");
  assert.equal(result.recurring.status, "IGNORED");
  assert.deepEqual(stored?.sampleTransactionIds, candidate.sampleTransactionIds);
  assert.equal([...fixture.financial.audit.values()][0]?.metadata.reason, "Not a subscription");
  assert.equal(fixture.ledgerRecords.transactions.size, transactionCount);
  assert.deepEqual(await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id), beforeBalance);
});

test("Inbox recurring reconciliation preserves every unrelated source reason", async () => {
  const fixture = await createFixture();
  const candidate = await createCandidate(fixture);
  const recurringItem = await createRecurringInbox(fixture, candidate.id);
  const otherItem = await createOtherInboxReason(fixture);

  const result = await fixture.service.confirmInboxRecurring(owner, {
    workspaceId,
    inboxItemId: recurringItem.id,
    expectedInboxUpdatedAt: recurringItem.updatedAt,
    idempotencyKey: "inbox-multi-reason",
  });

  assert.equal(result.item.status, "RESOLVED");
  assert.deepEqual(result.unresolvedReasons, ["MERCHANT_AMBIGUITY"]);
  assert.equal((await fixture.financial.findInboxItem(workspaceId, otherItem.id))?.status, "OPEN");
});

test("Inbox recurring commands reject a stale Inbox version before changing recurring state", async () => {
  const fixture = await createFixture();
  const candidate = await createCandidate(fixture);
  const item = await createRecurringInbox(fixture, candidate.id);
  fixture.financial.items.set(item.id, {
    ...item,
    details: { changed: true },
    updatedAt: new Date(item.updatedAt.getTime() + 1),
  });

  await assert.rejects(
    fixture.service.confirmInboxRecurring(owner, {
      workspaceId,
      inboxItemId: item.id,
      expectedInboxUpdatedAt: item.updatedAt,
      idempotencyKey: "inbox-stale",
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "INBOX_ITEM_STALE",
  );
  assert.equal((await fixture.financial.findRecurringPaymentById(workspaceId, candidate.id))?.status, "CANDIDATE");
  assert.equal(fixture.financial.audit.size, 0);
});

test("Inbox recurring commands reread canonical recurring state instead of accepting stale Inbox capabilities", async () => {
  const fixture = await createFixture();
  const candidate = await createCandidate(fixture);
  const item = await createRecurringInbox(fixture, candidate.id);
  await fixture.service.confirmRecurring(owner, {
    workspaceId,
    recurringId: candidate.id,
    expectedUpdatedAt: candidate.updatedAt,
    idempotencyKey: "direct-confirm-before-inbox",
  });

  await assert.rejects(
    fixture.service.ignoreInboxRecurring(owner, {
      workspaceId,
      inboxItemId: item.id,
      expectedInboxUpdatedAt: item.updatedAt,
      idempotencyKey: "inbox-after-direct-change",
    }),
    DomainConflictError,
  );
  assert.equal((await fixture.financial.findRecurringPaymentById(workspaceId, candidate.id))?.status, "CONFIRMED");
  assert.equal((await fixture.financial.findInboxItem(workspaceId, item.id))?.status, "OPEN");
});

test("competing Inbox confirm and ignore requests cannot both succeed", async () => {
  const fixture = await createFixture();
  const candidate = await createCandidate(fixture);
  const item = await createRecurringInbox(fixture, candidate.id);

  const outcomes = await Promise.allSettled([
    fixture.service.confirmInboxRecurring(owner, {
      workspaceId, inboxItemId: item.id, expectedInboxUpdatedAt: item.updatedAt, idempotencyKey: "inbox-race-confirm",
    }),
    fixture.service.ignoreInboxRecurring(owner, {
      workspaceId, inboxItemId: item.id, expectedInboxUpdatedAt: item.updatedAt, idempotencyKey: "inbox-race-ignore",
    }),
  ]);

  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  assert.equal(fixture.financial.audit.size, 1);
  assert.equal((await fixture.financial.findInboxItem(workspaceId, item.id))?.status, "RESOLVED");
});

test("Inbox recurring retries replay once and remain workspace- and role-scoped", async () => {
  const fixture = await createFixture();
  const candidate = await createCandidate(fixture);
  const item = await createRecurringInbox(fixture, candidate.id);
  const command = {
    workspaceId, inboxItemId: item.id, expectedInboxUpdatedAt: item.updatedAt, idempotencyKey: "inbox-retry",
  };
  const first = await fixture.service.confirmInboxRecurring(owner, command);
  const retry = await fixture.service.confirmInboxRecurring(owner, command);

  assert.equal(first.replayed, false);
  assert.equal(retry.replayed, true);
  assert.equal(fixture.financial.audit.size, 1);
  await assert.rejects(fixture.service.confirmInboxRecurring(viewer, command), AuthorizationError);
  await assert.rejects(
    fixture.service.confirmInboxRecurring(owner, { ...command, workspaceId: foreignWorkspaceId, idempotencyKey: "foreign-inbox" }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "INBOX_ITEM_NOT_FOUND",
  );
});
