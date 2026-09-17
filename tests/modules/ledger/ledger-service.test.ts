import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { LedgerService } from "@/modules/ledger/ledger-service";

import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";
import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_SALARY_ID,
} from "../../support/in-memory-ledger-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const payer: AuthenticatedActor = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "payer@pace.test",
  name: "Payer",
};
const admin: AuthenticatedActor = { userId: "admin-1", email: "admin@pace.test", name: "Admin" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";

async function createFixture() {
  const ledgerRepository = new InMemoryLedgerRepository();
  const workspaceRepository = new InMemoryWorkspaceRepository();
  const service = new LedgerService(ledgerRepository, workspaceRepository);

  for (const [workspaceId, userId, role] of [
    [workspaceOne, owner.userId, "OWNER"],
    [workspaceTwo, owner.userId, "OWNER"],
    [workspaceOne, payer.userId, "MEMBER"],
    [workspaceOne, admin.userId, "ADMIN"],
    [workspaceOne, viewer.userId, "VIEWER"],
  ] as const) {
    workspaceRepository.addMembership({
      workspaceId,
      userId,
      role,
      invitedByUserId: null,
      joinedAt: new Date(),
    });
  }

  return { ledgerRepository, workspaceRepository, service };
}

test("ledger creation is workspace-scoped, validates members, and persists source metadata", async () => {
  const { service } = await createFixture();
  const account = await service.createAccount(owner, workspaceOne, {
    name: "Main checking",
    type: "CHECKING",
    currency: "usd",
    openingBalanceMinor: "2500",
  });
  const merchant = await service.createMerchant(owner, workspaceOne, { name: "  Fresh   Market " });

  const expense = await service.createTransaction(owner, workspaceOne, {
    kind: "EXPENSE",
    status: "POSTED",
    accountId: account.id,
    categoryId: SYSTEM_GROCERIES_ID,
    merchantId: merchant.id,
    amountMinor: "12345",
    currency: "USD",
    occurredAt: "2026-02-01T10:00:00.000Z",
    paidByUserId: payer.userId,
    source: { provider: "manual", receipt: { id: "r-42" } },
    deduplicationFingerprint: "manual:receipt:r-42",
  });

  assert.equal(account.currency, "USD");
  assert.equal(account.openingBalanceMinor, 2500n);
  assert.equal(merchant.normalizedName, "fresh market");
  assert.equal(expense.createdByUserId, owner.userId);
  assert.equal(expense.paidByUserId, payer.userId);
  assert.deepEqual(expense.source, { provider: "manual", receipt: { id: "r-42" } });

  await assert.rejects(
    service.createTransaction(owner, workspaceOne, {
      kind: "EXPENSE",
      accountId: account.id,
      categoryId: SYSTEM_GROCERIES_ID,
      amountMinor: "12345",
      currency: "USD",
      occurredAt: "2026-02-01T10:00:00.000Z",
      deduplicationFingerprint: "manual:receipt:r-42",
    }),
    ConflictError,
  );

  const secondWorkspaceAccount = await service.createAccount(owner, workspaceTwo, {
    name: "Separate checking",
    type: "CHECKING",
    currency: "USD",
  });
  const sameFingerprintElsewhere = await service.createTransaction(owner, workspaceTwo, {
    kind: "EXPENSE",
    accountId: secondWorkspaceAccount.id,
    categoryId: SYSTEM_GROCERIES_ID,
    amountMinor: "12345",
    currency: "USD",
    occurredAt: "2026-02-01T10:00:00.000Z",
    deduplicationFingerprint: "manual:receipt:r-42",
  });
  assert.equal(sameFingerprintElsewhere.workspaceId, workspaceTwo);

  await assert.rejects(
    service.createTransaction(owner, workspaceOne, {
      kind: "EXPENSE",
      accountId: account.id,
      categoryId: SYSTEM_GROCERIES_ID,
      amountMinor: "1",
      currency: "USD",
      occurredAt: "2026-02-01T10:00:00.000Z",
      paidByUserId: "22222222-2222-4222-8222-222222222222",
    }),
    AuthorizationError,
  );
});

test("transfers are grouped and refunds inherit the original expense attribution", async () => {
  const { service } = await createFixture();
  const checking = await service.createAccount(owner, workspaceOne, { name: "Checking", type: "CHECKING", currency: "USD" });
  const savings = await service.createAccount(owner, workspaceOne, { name: "Savings", type: "SAVINGS", currency: "USD" });
  const merchant = await service.createMerchant(owner, workspaceOne, { name: "Corner shop" });

  const expense = await service.createTransaction(owner, workspaceOne, {
    kind: "EXPENSE",
    accountId: checking.id,
    categoryId: SYSTEM_GROCERIES_ID,
    merchantId: merchant.id,
    amountMinor: "1000",
    currency: "USD",
    occurredAt: "2026-02-02T10:00:00.000Z",
  });
  const refund = await service.createTransaction(owner, workspaceOne, {
    kind: "REFUND",
    accountId: checking.id,
    refundedTransactionId: expense.id,
    amountMinor: "250",
    currency: "USD",
    occurredAt: "2026-02-03T10:00:00.000Z",
  });
  const transfer = await service.createTransaction(owner, workspaceOne, {
    kind: "TRANSFER",
    accountId: checking.id,
    transferAccountId: savings.id,
    amountMinor: "500",
    currency: "USD",
    occurredAt: "2026-02-04T10:00:00.000Z",
  });

  assert.equal(refund.categoryId, expense.categoryId);
  assert.equal(refund.merchantId, expense.merchantId);
  assert.equal(transfer.transferGroupId?.length, 36);
  assert.equal(transfer.categoryId, null);

  await assert.rejects(
    service.createTransaction(owner, workspaceOne, {
      kind: "REFUND",
      accountId: checking.id,
      refundedTransactionId: expense.id,
      amountMinor: "751",
      currency: "USD",
      occurredAt: "2026-02-04T10:00:00.000Z",
    }),
    ConflictError,
  );
});

test("ledger lookups reject cross-workspace entities and viewers cannot write", async () => {
  const { service } = await createFixture();
  const accountOne = await service.createAccount(owner, workspaceOne, { name: "One", type: "CHECKING", currency: "USD" });
  const accountTwo = await service.createAccount(owner, workspaceTwo, { name: "Two", type: "CHECKING", currency: "USD" });
  const categoryTwo = await service.createCategory(owner, workspaceTwo, {
    name: "Workspace two category",
    kind: "EXPENSE",
  });

  await assert.rejects(
    service.createTransaction(owner, workspaceOne, {
      kind: "EXPENSE",
      accountId: accountTwo.id,
      categoryId: SYSTEM_GROCERIES_ID,
      amountMinor: "100",
      currency: "USD",
      occurredAt: "2026-02-01T00:00:00.000Z",
    }),
    NotFoundError,
  );
  await assert.rejects(
    service.createTransaction(owner, workspaceOne, {
      kind: "EXPENSE",
      accountId: accountOne.id,
      categoryId: categoryTwo.id,
      amountMinor: "100",
      currency: "USD",
      occurredAt: "2026-02-01T00:00:00.000Z",
    }),
    NotFoundError,
  );
  await assert.rejects(
    service.createAccount(viewer, workspaceOne, { name: "Forbidden", type: "CHECKING", currency: "USD" }),
    AuthorizationError,
  );

  const listed = await service.listTransactions(owner, workspaceOne);
  assert.equal(listed.length, 0);
  assert.equal((await service.listCategories(owner, workspaceOne)).some((entry) => entry.id === SYSTEM_SALARY_ID), true);
});

test("OWNER, ADMIN, and MEMBER may create ledger records while VIEWER remains read-only", async () => {
  const { service } = await createFixture();
  const destination = await service.createAccount(owner, workspaceOne, {
    name: "Shared destination",
    type: "SAVINGS",
    currency: "USD",
  });

  for (const actor of [owner, admin, payer]) {
    const account = await service.createAccount(actor, workspaceOne, {
      name: `${actor.name} account`,
      type: "CHECKING",
      currency: "USD",
    });
    const base = {
      accountId: account.id,
      amountMinor: "100",
      currency: "USD",
      occurredAt: "2026-02-01T00:00:00.000Z",
    };
    await service.createTransaction(actor, workspaceOne, {
      ...base,
      kind: "EXPENSE",
      categoryId: SYSTEM_GROCERIES_ID,
    });
    await service.createTransaction(actor, workspaceOne, {
      ...base,
      kind: "INCOME",
      categoryId: SYSTEM_SALARY_ID,
    });
    await service.createTransaction(actor, workspaceOne, {
      ...base,
      kind: "TRANSFER",
      transferAccountId: destination.id,
    });
  }

  const viewerExpense = {
    kind: "EXPENSE" as const,
    accountId: destination.id,
    categoryId: SYSTEM_GROCERIES_ID,
    amountMinor: "100",
    currency: "USD",
    occurredAt: "2026-02-01T00:00:00.000Z",
  };
  await assert.rejects(
    service.createAccount(viewer, workspaceOne, { name: "Blocked", type: "CASH", currency: "USD" }),
    AuthorizationError,
  );
  await assert.rejects(service.createTransaction(viewer, workspaceOne, viewerExpense), AuthorizationError);
  await assert.rejects(
    service.createTransaction(viewer, workspaceOne, {
      ...viewerExpense,
      kind: "INCOME",
      categoryId: SYSTEM_SALARY_ID,
    }),
    AuthorizationError,
  );
  await assert.rejects(
    service.createTransaction(viewer, workspaceOne, {
      kind: "TRANSFER",
      accountId: destination.id,
      transferAccountId: (await service.listAccounts(owner, workspaceOne)).find((account) => account.id !== destination.id)!.id,
      amountMinor: "100",
      currency: "USD",
      occurredAt: "2026-02-01T00:00:00.000Z",
    }),
    AuthorizationError,
  );
});
