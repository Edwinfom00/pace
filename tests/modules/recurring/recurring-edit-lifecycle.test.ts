import assert from "node:assert/strict";
import test from "node:test";

import { DomainConflictError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import type { RecurringPaymentRecord } from "@/modules/financial-inbox/domain";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { buildRecurringDetail } from "@/modules/recurring/queries/get-recurring-detail";
import { buildRecurringOverview } from "@/modules/recurring/domain/recurring-overview";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import { InMemoryLedgerRepository, SYSTEM_OTHER_EXPENSE_ID } from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const workspaceId = "workspace-one";
const now = new Date("2026-09-22T12:00:00.000Z");

async function fixture() {
  const financial = new InMemoryFinancialInboxRepository();
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const service = new FinancialInboxService(financial, ledgerRecords, workspaces);
  const workspace: WorkspaceRecord = {
    id: workspaceId,
    name: "Workspace one",
    slug: "workspace-one",
    type: "PERSONAL",
    createdByUserId: owner.userId,
    createdAt: now,
    updatedAt: now,
  };
  await workspaces.createWorkspaceWithOwner({
    workspace,
    preferences: { currency: "XAF", locale: "fr-CM", timezone: "Africa/Douala", weekStartsOn: 1 },
    owner: { workspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now },
    initialAccount: {
      id: "initial-account",
      workspaceId,
      name: "Initial account",
      type: "CHECKING",
      currency: "XAF",
      createdByUserId: owner.userId,
    },
  });
  const account = await ledger.createAccount(owner, workspaceId, {
    name: "Main account",
    type: "CHECKING",
    currency: "XAF",
  });
  const nextAccount = await ledger.createAccount(owner, workspaceId, {
    name: "Orange Money",
    type: "MOBILE_MONEY",
    currency: "XAF",
  });
  const eurAccount = await ledger.createAccount(owner, workspaceId, {
    name: "Euro account",
    type: "CHECKING",
    currency: "EUR",
  });
  return { account, eurAccount, financial, ledger, ledgerRecords, nextAccount, service };
}

async function confirmedRecurring(
  data: Awaited<ReturnType<typeof fixture>>,
  overrides: Partial<Omit<RecurringPaymentRecord, "createdAt" | "updatedAt">> = {},
) {
  return data.financial.createRecurringPayment({
    id: "recurring-netflix",
    workspaceId,
    detectionKey: "detected:netflix:xaf",
    normalizedMerchant: "netflix",
    displayName: "Netflix",
    origin: "DETECTED",
    direction: "EXPENSE",
    accountId: data.account.id,
    categoryId: SYSTEM_OTHER_EXPENSE_ID,
    currency: "XAF",
    typicalAmountMinor: 6500n,
    amountToleranceBps: 500,
    cadenceDays: 30,
    firstOccurredAt: new Date("2026-06-01T12:00:00.000Z"),
    lastOccurredAt: new Date("2026-09-01T12:00:00.000Z"),
    nextOccurrenceAt: new Date("2026-10-01T12:00:00.000Z"),
    sampleTransactionIds: ["historical-netflix"],
    status: "CONFIRMED",
    lifecycle: "ACTIVE",
    createdByUserId: owner.userId,
    idempotencyKey: null,
    commandFingerprint: null,
    confirmedByUserId: owner.userId,
    confirmedAt: now,
    ignoredByUserId: null,
    ignoredAt: null,
    ...overrides,
  });
}

function overviewFor(data: Awaited<ReturnType<typeof fixture>>) {
  return buildRecurringOverview({
    payments: [...data.financial.recurring.values()].map((payment) => ({
      id: payment.id,
      normalizedMerchant: payment.normalizedMerchant,
      displayName: payment.displayName,
      origin: payment.origin,
      direction: payment.direction,
      accountId: payment.accountId,
      categoryId: payment.categoryId,
      status: payment.status,
      lifecycle: payment.lifecycle,
      cadenceDays: payment.cadenceDays,
      typicalAmountMinor: payment.typicalAmountMinor.toString(),
      currency: payment.currency,
      firstOccurredAt: payment.firstOccurredAt.toISOString(),
      lastOccurredAt: payment.lastOccurredAt.toISOString(),
      nextOccurrenceAt: payment.nextOccurrenceAt?.toISOString() ?? null,
      sampleTransactionIds: payment.sampleTransactionIds,
      updatedAt: payment.updatedAt.toISOString(),
    })),
    accounts: [...data.ledgerRecords.accounts.values()],
    categories: awaitableCategories(data),
    filter: "ALL",
    timeZone: "UTC",
    now,
    workspaceRole: "OWNER",
  });
}

function awaitableCategories(data: Awaited<ReturnType<typeof fixture>>) {
  // In-memory category reads are synchronous storage, just like the recurring
  // read model above; keep this helper explicit to avoid a UI-local projection.
  return [...data.ledgerRecords.categories.values()];
}

test("edits update only canonical future scheduling fields and preserve historical financial truth", async () => {
  const data = await fixture();
  const recurring = await confirmedRecurring(data);
  data.ledgerRecords.transactions.set("historical-netflix", {
    id: "historical-netflix",
    workspaceId,
    kind: "EXPENSE",
    status: "POSTED",
    amountMinor: 6500n,
    currency: "XAF",
    occurredAt: new Date("2026-08-01T12:00:00.000Z"),
    accountId: data.account.id,
    transferAccountId: null,
    categoryId: SYSTEM_OTHER_EXPENSE_ID,
    merchantId: null,
    createdByUserId: owner.userId,
    paidByUserId: owner.userId,
    transferGroupId: null,
    refundedTransactionId: null,
    reversalOfTransactionId: null,
    source: {},
    deduplicationFingerprint: "historical-netflix",
    note: "Historical Netflix charge",
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    updatedAt: new Date("2026-08-01T12:00:00.000Z"),
  });
  const beforeTransactions = [...data.ledgerRecords.transactions.entries()];
  const beforeBalance = await data.ledgerRecords.getAccountBalance(workspaceId, data.account.id);
  const beforeSamples = [...recurring.sampleTransactionIds];

  const command = {
    workspaceId,
    recurringId: recurring.id,
    expectedUpdatedAt: recurring.updatedAt,
    idempotencyKey: "edit-netflix-v1",
    name: "Netflix Premium",
    amountMinor: 7000n,
    cadenceDays: 90,
    nextOccurrenceAt: new Date("2099-12-01T12:00:00.000Z"),
    accountId: data.nextAccount.id,
    categoryId: SYSTEM_OTHER_EXPENSE_ID,
  };
  const updated = await data.service.updateRecurring(owner, command);
  const retry = await data.service.updateRecurring(owner, command);

  const stored = await data.financial.findRecurringPaymentById(workspaceId, recurring.id);
  assert.equal(updated.id, recurring.id);
  assert.equal(retry.updatedAt, updated.updatedAt);
  assert.equal(stored?.displayName, "Netflix Premium");
  assert.equal(stored?.typicalAmountMinor, 7000n);
  assert.equal(stored?.cadenceDays, 90);
  assert.equal(stored?.nextOccurrenceAt?.toISOString(), "2099-12-01T12:00:00.000Z");
  assert.equal(stored?.accountId, data.nextAccount.id);
  assert.equal(stored?.categoryId, SYSTEM_OTHER_EXPENSE_ID);
  assert.equal(stored?.origin, "DETECTED");
  assert.equal(stored?.direction, "EXPENSE");
  assert.equal(stored?.currency, "XAF");
  assert.deepEqual(stored?.sampleTransactionIds, beforeSamples);
  assert.deepEqual([...data.ledgerRecords.transactions.entries()], beforeTransactions);
  assert.deepEqual(await data.ledgerRecords.getAccountBalance(workspaceId, data.account.id), beforeBalance);
  assert.equal(data.financial.audit.size, 1);
  assert.equal([...data.financial.audit.values()][0]?.event, "RECURRING_EDITED");
  assert.ok([...data.financial.audit.values()][0]?.metadata.changes);

  const overview = overviewFor(data);
  assert.equal(overview.items[0]?.merchantName, "Netflix Premium");
  assert.equal(overview.items[0]?.typicalAmountMinor, "7000");
  assert.equal(overview.items[0]?.account?.name, "Orange Money");
  assert.equal(overview.items[0]?.nextExpectedAt, "2099-12-01T00:00:00.000Z");

  const detail = buildRecurringDetail({
    payment: updated,
    accounts: [...data.ledgerRecords.accounts.values()],
    categories: awaitableCategories(data),
    merchants: [],
    evidence: [...data.ledgerRecords.transactions.values()],
    merchant: null,
    now,
    timeZone: "UTC",
    workspaceRole: "OWNER",
  });
  assert.equal(detail.title, "Netflix Premium");
  assert.equal(detail.amount.minor, "7000");
  assert.equal(detail.cadenceDays, 90);
  assert.equal(detail.relatedTransactions[0]?.amount.minor, "6500");
});

test("editing a manual pattern preserves manual origin and its confirmed review state", async () => {
  const data = await fixture();
  const manual = await data.service.createManualRecurring(owner, {
    workspaceId,
    direction: "EXPENSE",
    name: "Gym membership",
    amountMinor: 12000n,
    currency: "XAF",
    cadenceDays: 30,
    nextOccurrenceAt: new Date("2099-10-01T12:00:00.000Z"),
    accountId: data.account.id,
    categoryId: SYSTEM_OTHER_EXPENSE_ID,
    merchantOrSource: "Gym",
    idempotencyKey: "manual-create",
  });
  const updated = await data.service.updateRecurring(owner, {
    workspaceId,
    recurringId: manual.id,
    expectedUpdatedAt: new Date(manual.updatedAt),
    idempotencyKey: "manual-edit",
    amountMinor: 14000n,
  });
  assert.equal(updated.origin, "MANUAL");
  assert.equal(updated.status, "CONFIRMED");
  assert.equal(updated.typicalAmountMinor, "14000");
});

test("edit enforces future dates, compatible accounts, policy, and no-op protection", async () => {
  const data = await fixture();
  const recurring = await confirmedRecurring(data);

  await assert.rejects(
    data.service.updateRecurring(owner, {
      workspaceId,
      recurringId: recurring.id,
      expectedUpdatedAt: recurring.updatedAt,
      idempotencyKey: "past-date",
      nextOccurrenceAt: new Date("2020-01-01T00:00:00.000Z"),
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "INVALID_NEXT_OCCURRENCE",
  );
  await assert.rejects(
    data.service.updateRecurring(owner, {
      workspaceId,
      recurringId: recurring.id,
      expectedUpdatedAt: recurring.updatedAt,
      idempotencyKey: "currency-mismatch",
      accountId: data.eurAccount.id,
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "CURRENCY_MISMATCH",
  );
  await assert.rejects(
    data.service.updateRecurring(owner, {
      workspaceId,
      recurringId: recurring.id,
      expectedUpdatedAt: recurring.updatedAt,
      idempotencyKey: "no-change",
      name: "Netflix",
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "RECURRING_NO_CHANGES",
  );
  const candidate = await confirmedRecurring(data, { id: "candidate", status: "CANDIDATE", confirmedAt: null, confirmedByUserId: null });
  await assert.rejects(
    data.service.updateRecurring(owner, {
      workspaceId,
      recurringId: candidate.id,
      expectedUpdatedAt: candidate.updatedAt,
      idempotencyKey: "candidate-edit",
      name: "Not allowed yet",
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "RECURRING_EDIT_NOT_ALLOWED",
  );
  assert.equal(data.financial.audit.size, 0);
});

test("pause and resume suspend/restart projections without posting or backfilling transactions", async () => {
  const data = await fixture();
  const recurring = await confirmedRecurring(data, { nextOccurrenceAt: new Date("2026-09-01T12:00:00.000Z") });
  const transactionCount = data.ledgerRecords.transactions.size;
  const beforeBalance = await data.ledgerRecords.getAccountBalance(workspaceId, data.account.id);

  const paused = await data.service.pauseRecurring(owner, {
    workspaceId,
    recurringId: recurring.id,
    expectedUpdatedAt: recurring.updatedAt,
    idempotencyKey: "pause-once",
  });
  const pauseRetry = await data.service.pauseRecurring(owner, {
    workspaceId,
    recurringId: recurring.id,
    expectedUpdatedAt: recurring.updatedAt,
    idempotencyKey: "pause-once",
  });
  assert.equal(paused.lifecycle, "PAUSED");
  assert.equal(overviewFor(data).items[0]?.capabilities.canResume, true);
  assert.equal(pauseRetry.updatedAt, paused.updatedAt);
  assert.equal(overviewFor(data).upcoming.length, 0);

  const pausedDetail = buildRecurringDetail({
    payment: paused,
    accounts: [...data.ledgerRecords.accounts.values()],
    categories: awaitableCategories(data),
    merchants: [],
    evidence: [],
    merchant: null,
    now,
    timeZone: "UTC",
    workspaceRole: "OWNER",
  });
  assert.equal(pausedDetail.nextOccurrenceAt, null);
  assert.deepEqual(pausedDetail.upcomingOccurrences, []);

  const resumed = await data.service.resumeRecurring(owner, {
    workspaceId,
    recurringId: recurring.id,
    expectedUpdatedAt: new Date(paused.updatedAt),
    idempotencyKey: "resume-once",
  });
  assert.equal(resumed.lifecycle, "ACTIVE");
  assert.equal(overviewFor(data).items[0]?.capabilities.canPause, true);
  assert.equal(overviewFor(data).upcoming[0]?.nextExpectedAt, "2026-10-01T00:00:00.000Z");
  assert.equal(data.ledgerRecords.transactions.size, transactionCount);
  assert.deepEqual(await data.ledgerRecords.getAccountBalance(workspaceId, data.account.id), beforeBalance);
  assert.deepEqual([...data.financial.audit.values()].map((entry) => entry.event), [
    "RECURRING_PAUSED",
    "RECURRING_RESUMED",
  ]);
});

test("lifecycle mutations require a current version and compare-and-set prevents stale edit/pause races", async () => {
  const data = await fixture();
  const recurring = await confirmedRecurring(data);

  await assert.rejects(
    data.service.pauseRecurring(owner, { workspaceId, recurringId: recurring.id, idempotencyKey: "missing-version" }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "RECURRING_NOT_CURRENT",
  );
  const outcomes = await Promise.allSettled([
    data.service.updateRecurring(owner, {
      workspaceId,
      recurringId: recurring.id,
      expectedUpdatedAt: recurring.updatedAt,
      idempotencyKey: "race-edit",
      amountMinor: 8000n,
    }),
    data.service.pauseRecurring(owner, {
      workspaceId,
      recurringId: recurring.id,
      expectedUpdatedAt: recurring.updatedAt,
      idempotencyKey: "race-pause",
    }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  assert.equal(data.financial.audit.size, 1);
});
