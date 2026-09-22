import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError, DomainConflictError, NotFoundError } from "@/authorization/errors";
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
        id: `${id}-initial`,
        workspaceId: id,
        name: "Initial account",
        type: "CHECKING",
        currency: "XAF",
        createdByUserId: owner.userId,
      },
    });
  }
  workspaces.addMembership({
    workspaceId,
    userId: viewer.userId,
    role: "VIEWER",
    invitedByUserId: owner.userId,
    joinedAt: now,
  });
  const account = await ledger.createAccount(owner, workspaceId, {
    name: "Main account",
    type: "CHECKING",
    currency: "XAF",
  });
  return { account, financial, ledger, ledgerRecords, service };
}

async function createDetectedCandidate(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  overrides: Partial<Omit<RecurringPaymentRecord, "createdAt" | "updatedAt">> = {},
) {
  return fixture.financial.createRecurringPayment({
    id: "recurring-detected",
    workspaceId,
    detectionKey: "detected:netflix:xaf",
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
    sampleTransactionIds: ["transaction-evidence"],
    status: "CANDIDATE",
    lifecycle: "ACTIVE",
    createdByUserId: owner.userId,
    idempotencyKey: null,
    commandFingerprint: null,
    confirmedByUserId: null,
    confirmedAt: null,
    ignoredByUserId: null,
    ignoredAt: null,
    ...overrides,
  });
}

async function overviewFor(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  filter: "ALL" | "CONFIRMED" | "NEEDS_REVIEW" | "IGNORED" = "ALL",
) {
  return buildRecurringOverview({
    payments: await fixture.service.listRecurring(owner, workspaceId),
    accounts: await fixture.ledgerRecords.listAccounts(workspaceId),
    categories: await fixture.ledgerRecords.listCategories(workspaceId),
    filter,
    timeZone: "UTC",
    now,
    workspaceRole: "OWNER",
  });
}

test("confirm preserves detected evidence and financial truth while reconciling the canonical read model", async () => {
  const fixture = await createFixture();
  const candidate = await createDetectedCandidate(fixture);
  const beforeBalance = await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id);
  const transactionCount = fixture.ledgerRecords.transactions.size;

  const confirmed = await fixture.service.confirmRecurring(owner, {
    workspaceId,
    recurringId: candidate.id,
    expectedUpdatedAt: candidate.updatedAt,
    idempotencyKey: "confirm-netflix-1",
  });

  const stored = await fixture.financial.findRecurringPaymentById(workspaceId, candidate.id);
  const afterBalance = await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id);
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(stored?.origin, "DETECTED");
  assert.deepEqual(stored?.sampleTransactionIds, ["transaction-evidence"]);
  assert.equal(stored?.confirmedByUserId, owner.userId);
  assert.equal(stored?.ignoredAt, null);
  assert.equal(fixture.ledgerRecords.transactions.size, transactionCount);
  assert.equal(afterBalance?.currentBalanceMinor, beforeBalance?.currentBalanceMinor);
  assert.equal(afterBalance?.availableBalanceMinor, beforeBalance?.availableBalanceMinor);

  const audit = [...fixture.financial.audit.values()];
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.event, "RECURRING_CONFIRMED");
  assert.deepEqual(audit[0]?.metadata.before, { status: "CANDIDATE", reviewState: "NEEDS_REVIEW" });
  assert.deepEqual(audit[0]?.metadata.after, { status: "CONFIRMED", reviewState: null });

  const overview = await overviewFor(fixture);
  assert.deepEqual(overview.counts, { ALL: 1, CONFIRMED: 1, NEEDS_REVIEW: 0, IGNORED: 0 });
  assert.equal(overview.items[0]?.capabilities.canConfirm, false);
  assert.equal(overview.upcoming[0]?.id, candidate.id);
  const detail = buildRecurringDetail({
    payment: confirmed,
    accounts: await fixture.ledgerRecords.listAccounts(workspaceId),
    categories: await fixture.ledgerRecords.listCategories(workspaceId),
    merchants: [],
    evidence: [],
    merchant: null,
    now,
    timeZone: "UTC",
    workspaceRole: "OWNER",
  });
  assert.equal(detail.status, "CONFIRMED");
  assert.equal(detail.capabilities.canConfirm, false);
});

test("ignore retains the candidate and evidence, removes projections, and records the optional reason", async () => {
  const fixture = await createFixture();
  const candidate = await createDetectedCandidate(fixture);
  const beforeBalance = await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id);

  const ignored = await fixture.service.ignoreRecurring(owner, {
    workspaceId,
    recurringId: candidate.id,
    idempotencyKey: "ignore-netflix-1",
    reason: "Not a subscription",
  });

  const stored = await fixture.financial.findRecurringPaymentById(workspaceId, candidate.id);
  const afterBalance = await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id);
  assert.equal(ignored.status, "IGNORED");
  assert.equal(stored?.id, candidate.id);
  assert.equal(stored?.origin, "DETECTED");
  assert.deepEqual(stored?.sampleTransactionIds, ["transaction-evidence"]);
  assert.equal(stored?.ignoredByUserId, owner.userId);
  assert.equal(afterBalance?.currentBalanceMinor, beforeBalance?.currentBalanceMinor);
  assert.equal(afterBalance?.availableBalanceMinor, beforeBalance?.availableBalanceMinor);

  const audit = [...fixture.financial.audit.values()][0];
  assert.equal(audit?.event, "RECURRING_IGNORED");
  assert.equal(audit?.metadata.reason, "Not a subscription");
  const overview = await overviewFor(fixture);
  assert.deepEqual(overview.counts, { ALL: 1, CONFIRMED: 0, NEEDS_REVIEW: 0, IGNORED: 1 });
  assert.equal(overview.items[0]?.nextExpectedAt, null);
  assert.deepEqual(overview.upcoming, []);
  const detail = buildRecurringDetail({
    payment: ignored,
    accounts: await fixture.ledgerRecords.listAccounts(workspaceId),
    categories: await fixture.ledgerRecords.listCategories(workspaceId),
    merchants: [],
    evidence: [],
    merchant: null,
    now,
    timeZone: "UTC",
    workspaceRole: "OWNER",
  });
  assert.equal(detail.status, "IGNORED");
  assert.equal(detail.nextOccurrenceAt, null);
  assert.equal(detail.capabilities.canIgnore, false);
});

test("restore returns an ignored detection to review without changing financial truth", async () => {
  const fixture = await createFixture();
  const candidate = await createDetectedCandidate(fixture);
  const beforeBalance = await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id);
  const transactionCount = fixture.ledgerRecords.transactions.size;
  await fixture.service.ignoreRecurring(owner, {
    workspaceId,
    recurringId: candidate.id,
    idempotencyKey: "ignore-terminal",
  });

  const restored = await fixture.service.restoreRecurring(owner, {
    workspaceId,
    recurringId: candidate.id,
    idempotencyKey: "restore-after-ignore",
  });

  const afterBalance = await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id);
  assert.equal(restored.status, "CANDIDATE");
  assert.equal(restored.sampleTransactionIds.length, candidate.sampleTransactionIds.length);
  assert.equal(afterBalance?.currentBalanceMinor, beforeBalance?.currentBalanceMinor);
  assert.equal(afterBalance?.availableBalanceMinor, beforeBalance?.availableBalanceMinor);
  assert.equal(fixture.ledgerRecords.transactions.size, transactionCount);

  const overview = await overviewFor(fixture);
  assert.deepEqual(overview.counts, { ALL: 1, CONFIRMED: 0, NEEDS_REVIEW: 1, IGNORED: 0 });
  assert.equal(overview.items[0]?.capabilities.canConfirm, true);
  assert.equal(overview.items[0]?.capabilities.canIgnore, true);
  assert.equal(overview.items[0]?.capabilities.canRestore, false);
  assert.equal(overview.upcoming.length, 0);
  assert.deepEqual((await overviewFor(fixture, "NEEDS_REVIEW")).items.map((item) => item.id), [candidate.id]);
  assert.deepEqual((await overviewFor(fixture, "IGNORED")).items, []);
  assert.equal([...fixture.financial.audit.values()].at(-1)?.event, "RECURRING_RESTORED");
});

test("manual recurring patterns never enter detected confirm or ignore flows", async () => {
  const fixture = await createFixture();
  const manual = await fixture.service.createManualRecurring(owner, {
    workspaceId,
    direction: "EXPENSE",
    name: "Netflix plan",
    amountMinor: 6500n,
    currency: "XAF",
    cadenceDays: 30,
    nextOccurrenceAt: new Date("2026-10-01T00:00:00.000Z"),
    accountId: fixture.account.id,
    categoryId: SYSTEM_OTHER_EXPENSE_ID,
    merchantOrSource: "Netflix",
    idempotencyKey: "manual-foundation",
  });

  for (const action of [
    fixture.service.confirmRecurring(owner, { workspaceId, recurringId: manual.id, idempotencyKey: "manual-confirm" }),
    fixture.service.ignoreRecurring(owner, { workspaceId, recurringId: manual.id, idempotencyKey: "manual-ignore" }),
    fixture.service.restoreRecurring(owner, { workspaceId, recurringId: manual.id, idempotencyKey: "manual-restore" }),
  ]) {
    await assert.rejects(
      action,
      (error: unknown) => error instanceof DomainConflictError && error.code === "RECURRING_ACTION_NOT_ALLOWED",
    );
  }
  assert.equal((await fixture.financial.findRecurringPaymentById(workspaceId, manual.id))?.origin, "MANUAL");
  assert.deepEqual([...fixture.financial.audit.values()].map((event) => event.event), ["RECURRING_MANUAL_CREATED"]);
});

test("review commands are idempotent and safely reject stale or competing transitions", async () => {
  const fixture = await createFixture();
  const candidate = await createDetectedCandidate(fixture);
  const command = { workspaceId, recurringId: candidate.id, idempotencyKey: "confirm-once" };
  const first = await fixture.service.confirmRecurring(owner, command);
  const retry = await fixture.service.confirmRecurring(owner, command);
  assert.equal(first.id, retry.id);
  assert.equal(fixture.financial.audit.size, 1);

  const competingFixture = await createFixture();
  const competing = await createDetectedCandidate(competingFixture);
  const outcomes = await Promise.allSettled([
    competingFixture.service.confirmRecurring(owner, {
      workspaceId,
      recurringId: competing.id,
      idempotencyKey: "race-confirm",
    }),
    competingFixture.service.ignoreRecurring(owner, {
      workspaceId,
      recurringId: competing.id,
      idempotencyKey: "race-ignore",
    }),
  ]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);
  assert.equal(competingFixture.financial.audit.size, 1);

  const staleFixture = await createFixture();
  const stale = await createDetectedCandidate(staleFixture);
  await staleFixture.financial.updateRecurringPayment(workspaceId, stale.id, {
    sampleTransactionIds: ["transaction-evidence", "new-evidence"],
  });
  await assert.rejects(
    staleFixture.service.confirmRecurring(owner, {
      workspaceId,
      recurringId: stale.id,
      expectedUpdatedAt: stale.updatedAt,
      idempotencyKey: "stale-confirm",
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "CONCURRENT_MODIFICATION",
  );

  const restoreFixture = await createFixture();
  const restoreCandidate = await createDetectedCandidate(restoreFixture);
  await restoreFixture.service.ignoreRecurring(owner, {
    workspaceId,
    recurringId: restoreCandidate.id,
    idempotencyKey: "ignore-before-stale-restore",
  });
  const ignored = await restoreFixture.financial.findRecurringPaymentById(workspaceId, restoreCandidate.id);
  await restoreFixture.financial.updateRecurringPayment(workspaceId, restoreCandidate.id, {
    sampleTransactionIds: ["transaction-evidence", "new-evidence"],
  });
  await assert.rejects(
    restoreFixture.service.restoreRecurring(owner, {
      workspaceId,
      recurringId: restoreCandidate.id,
      expectedUpdatedAt: ignored!.updatedAt,
      idempotencyKey: "stale-restore",
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "CONCURRENT_MODIFICATION",
  );
});

test("review commands remain workspace-scoped and policy-gated on the server", async () => {
  const fixture = await createFixture();
  const candidate = await createDetectedCandidate(fixture);

  await assert.rejects(
    fixture.service.confirmRecurring(viewer, {
      workspaceId,
      recurringId: candidate.id,
      idempotencyKey: "viewer-confirm",
    }),
    AuthorizationError,
  );
  await assert.rejects(
    fixture.service.confirmRecurring(owner, {
      workspaceId: foreignWorkspaceId,
      recurringId: candidate.id,
      idempotencyKey: "foreign-confirm",
    }),
    NotFoundError,
  );
  await fixture.service.ignoreRecurring(owner, {
    workspaceId,
    recurringId: candidate.id,
    idempotencyKey: "ignore-first",
  });
  await assert.rejects(
    fixture.service.ignoreRecurring(owner, {
      workspaceId,
      recurringId: candidate.id,
      idempotencyKey: "ignore-stale-capability",
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "RECURRING_ALREADY_IGNORED",
  );
});
