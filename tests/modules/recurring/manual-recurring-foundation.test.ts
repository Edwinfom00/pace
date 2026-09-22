import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError, DomainConflictError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import {
  type CreateManualRecurringCommand,
  FinancialInboxService,
} from "@/modules/financial-inbox/financial-inbox-service";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { buildRecurringDetail } from "@/modules/recurring/queries/get-recurring-detail";
import { buildRecurringOverview } from "@/modules/recurring/domain/recurring-overview";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import {
  InMemoryLedgerRepository,
  SYSTEM_OTHER_EXPENSE_ID,
  SYSTEM_SALARY_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceId = "workspace-one";
const foreignWorkspaceId = "workspace-two";
const now = new Date("2026-09-20T12:00:00.000Z");

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
  const foreignAccount = await ledger.createAccount(owner, foreignWorkspaceId, {
    name: "Foreign account",
    type: "CHECKING",
    currency: "XAF",
  });

  return { account, financial, foreignAccount, ledger, ledgerRecords, service };
}

function manualCommand(
  accountId: string,
  overrides: Partial<CreateManualRecurringCommand> = {},
): CreateManualRecurringCommand {
  return {
    workspaceId,
    direction: "EXPENSE",
    name: "Netflix",
    amountMinor: 6500n,
    currency: "XAF",
    cadenceDays: 30,
    nextOccurrenceAt: new Date("2026-10-01T00:00:00.000Z"),
    accountId,
    categoryId: SYSTEM_OTHER_EXPENSE_ID,
    merchantOrSource: "Netflix",
    idempotencyKey: "manual-netflix-1",
    ...overrides,
  };
}

test("manual recurring expense is confirmed, projected, audited, and never creates a financial write", async () => {
  const fixture = await createFixture();
  const beforeBalance = await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id);
  const created = await fixture.service.createManualRecurring(owner, manualCommand(fixture.account.id));
  const afterBalance = await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id);

  assert.equal(created.origin, "MANUAL");
  assert.equal(created.direction, "EXPENSE");
  assert.equal(created.status, "CONFIRMED");
  assert.equal(created.displayName, "Netflix");
  assert.equal(created.typicalAmountMinor, "6500");
  assert.equal(created.currency, "XAF");
  assert.equal(created.nextOccurrenceAt, "2026-10-01T00:00:00.000Z");
  assert.equal(fixture.ledgerRecords.transactions.size, 0);
  assert.equal(beforeBalance?.currentBalanceMinor, afterBalance?.currentBalanceMinor);
  assert.equal(beforeBalance?.availableBalanceMinor, afterBalance?.availableBalanceMinor);
  assert.deepEqual(
    [...fixture.financial.audit.values()].map((entry) => entry.event),
    ["RECURRING_MANUAL_CREATED"],
  );

  const payments = await fixture.service.listRecurring(owner, workspaceId);
  const accounts = await fixture.ledgerRecords.listAccounts(workspaceId);
  const categories = await fixture.ledgerRecords.listCategories(workspaceId);
  const overview = buildRecurringOverview({
    payments,
    accounts,
    categories,
    filter: "ALL",
    timeZone: "UTC",
    now,
    workspaceRole: "OWNER",
  });
  const item = overview.items[0];
  assert.ok(item);
  assert.equal(item.origin, "MANUAL");
  assert.equal(item.reviewState, null);
  assert.equal(item.nextExpectedAt, "2026-10-01T00:00:00.000Z");
  assert.equal(item.capabilities.canConfirm, false);
  assert.equal(item.capabilities.canIgnore, false);
  assert.deepEqual(overview.counts, { ALL: 1, CONFIRMED: 1, NEEDS_REVIEW: 0, IGNORED: 0 });
  assert.equal(overview.upcoming[0]?.id, created.id);

  const detail = buildRecurringDetail({
    payment: created,
    accounts,
    categories,
    merchants: [],
    evidence: [],
    merchant: null,
    now,
    timeZone: "UTC",
    workspaceRole: "OWNER",
  });
  assert.equal(detail.origin, "MANUAL");
  assert.equal(detail.lastOccurrenceAt, null);
  assert.equal(detail.nextOccurrenceAt, "2026-10-01T00:00:00.000Z");
  assert.equal(detail.upcomingOccurrences[0]?.date, "2026-10-01T00:00:00.000Z");
});

test("manual recurring income stores its canonical income category without recording income", async () => {
  const fixture = await createFixture();
  const created = await fixture.service.createManualRecurring(owner, manualCommand(fixture.account.id, {
    direction: "INCOME",
    name: "Salary",
    amountMinor: 450_000n,
    categoryId: SYSTEM_SALARY_ID,
    merchantOrSource: "Employer",
    idempotencyKey: "manual-salary-1",
  }));

  assert.equal(created.direction, "INCOME");
  assert.equal(created.status, "CONFIRMED");
  assert.equal(created.categoryId, SYSTEM_SALARY_ID);
  assert.equal(fixture.ledgerRecords.transactions.size, 0);
  assert.equal((await fixture.ledgerRecords.getAccountBalance(workspaceId, fixture.account.id))?.currentBalanceMinor, 0n);
});

test("manual creation is idempotent per actor and rejects idempotency-key reuse for a different command", async () => {
  const fixture = await createFixture();
  const command = manualCommand(fixture.account.id);
  const first = await fixture.service.createManualRecurring(owner, command);
  const retry = await fixture.service.createManualRecurring(owner, command);

  assert.equal(first.id, retry.id);
  assert.equal(fixture.financial.recurring.size, 1);
  await assert.rejects(
    fixture.service.createManualRecurring(owner, { ...command, name: "Different subscription" }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "RECURRING_ALREADY_PROCESSED",
  );
});

test("manual creation enforces workspace permission and linked-resource scope", async () => {
  const fixture = await createFixture();
  const foreignCategory = await fixture.ledger.createCategory(owner, foreignWorkspaceId, {
    name: "Foreign category",
    kind: "EXPENSE",
  });
  await assert.rejects(
    fixture.service.createManualRecurring(viewer, manualCommand(fixture.account.id, { idempotencyKey: "viewer" })),
    AuthorizationError,
  );
  await assert.rejects(
    fixture.service.createManualRecurring(owner, manualCommand(fixture.foreignAccount.id, { idempotencyKey: "foreign" })),
    (error: unknown) => error instanceof DomainConflictError && error.code === "ACCOUNT_NOT_FOUND",
  );
  await assert.rejects(
    fixture.service.createManualRecurring(owner, manualCommand(fixture.account.id, {
      currency: "USD",
      idempotencyKey: "currency-mismatch",
    })),
    (error: unknown) => error instanceof DomainConflictError && error.code === "CURRENCY_MISMATCH",
  );
  await assert.rejects(
    fixture.service.createManualRecurring(owner, manualCommand(fixture.account.id, {
      categoryId: foreignCategory.id,
      idempotencyKey: "foreign-category",
    })),
    (error: unknown) => error instanceof DomainConflictError && error.code === "CATEGORY_NOT_FOUND",
  );
  await assert.rejects(
    fixture.service.createManualRecurring(owner, manualCommand(fixture.account.id, {
      name: " ",
      idempotencyKey: "invalid-name",
    })),
    (error: unknown) => error instanceof DomainConflictError && error.code === "INVALID_RECURRING_NAME",
  );
  await assert.rejects(
    fixture.service.createManualRecurring(owner, manualCommand(fixture.account.id, {
      cadenceDays: 6,
      idempotencyKey: "invalid-cadence",
    })),
    (error: unknown) => error instanceof DomainConflictError && error.code === "INVALID_RECURRING_FREQUENCY",
  );
});

test("later strong expense detection attaches evidence to a manual pattern without creating a detected duplicate", async () => {
  const fixture = await createFixture();
  const manual = await fixture.service.createManualRecurring(owner, manualCommand(fixture.account.id));
  const merchant = await fixture.ledger.createOrFindMerchant(owner, workspaceId, "Netflix");
  const transactionIds: string[] = [];

  for (const occurredAt of ["2026-07-01", "2026-07-31", "2026-08-30"]) {
    const transaction = await fixture.ledger.createTransaction(owner, workspaceId, {
      kind: "EXPENSE",
      accountId: fixture.account.id,
      categoryId: SYSTEM_OTHER_EXPENSE_ID,
      merchantId: merchant.id,
      amountMinor: "6500",
      currency: "XAF",
      occurredAt: `${occurredAt}T12:00:00.000Z`,
    });
    transactionIds.push(transaction.id);
    await fixture.service.ingestTransaction(owner, workspaceId, { transaction });
  }

  assert.equal(fixture.financial.recurring.size, 1);
  const matched = await fixture.financial.findRecurringPaymentById(workspaceId, manual.id);
  assert.equal(matched?.origin, "MANUAL");
  assert.deepEqual(matched?.sampleTransactionIds, transactionIds);
  assert.equal([...fixture.financial.items.values()].some((item) => item.reason === "POSSIBLE_RECURRING"), false);

  const detail = buildRecurringDetail({
    payment: await fixture.service.listRecurring(owner, workspaceId).then((payments) => payments[0]!),
    accounts: await fixture.ledgerRecords.listAccounts(workspaceId),
    categories: await fixture.ledgerRecords.listCategories(workspaceId),
    merchants: [merchant],
    evidence: await fixture.ledgerRecords.listTransactions(workspaceId),
    merchant,
    now,
    timeZone: "UTC",
    workspaceRole: "OWNER",
  });
  assert.equal(detail.relatedTransactions.length, 3);
  assert.equal(detail.origin, "MANUAL");
});

test("same amount and cadence at an unrelated merchant is not merged into a manual pattern", async () => {
  const fixture = await createFixture();
  const manual = await fixture.service.createManualRecurring(owner, manualCommand(fixture.account.id));
  const merchant = await fixture.ledger.createOrFindMerchant(owner, workspaceId, "Landlord");

  for (const occurredAt of ["2026-07-01", "2026-07-31", "2026-08-30"]) {
    const transaction = await fixture.ledger.createTransaction(owner, workspaceId, {
      kind: "EXPENSE",
      accountId: fixture.account.id,
      categoryId: SYSTEM_OTHER_EXPENSE_ID,
      merchantId: merchant.id,
      amountMinor: "6500",
      currency: "XAF",
      occurredAt: `${occurredAt}T12:00:00.000Z`,
    });
    await fixture.service.ingestTransaction(owner, workspaceId, { transaction });
  }

  assert.equal(fixture.financial.recurring.size, 2);
  assert.equal((await fixture.financial.findRecurringPaymentById(workspaceId, manual.id))?.sampleTransactionIds.length, 0);
  assert.ok([...fixture.financial.recurring.values()].some((payment) => payment.origin === "DETECTED"));
});
