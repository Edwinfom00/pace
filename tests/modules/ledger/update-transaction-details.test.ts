import assert from "node:assert/strict";
import test from "node:test";

import type { AuthenticatedActor } from "@/authorization/session";
import type { LedgerTransactionRecord } from "@/modules/ledger/domain";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { updateTransactionDetailsForActor } from "@/modules/ledger/update-transaction-details";

import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_SALARY_ID,
  SYSTEM_TRANSPORT_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";

async function fixture() {
  const records = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(records, workspaces);
  const now = new Date("2026-09-01T00:00:00.000Z");

  for (const [id, name] of [[workspaceOne, "One"], [workspaceTwo, "Two"]] as const) {
    workspaces.workspaces.set(id, {
      id,
      name,
      slug: name.toLocaleLowerCase(),
      type: "CUSTOM",
      createdByUserId: owner.userId,
      createdAt: now,
      updatedAt: now,
    });
    workspaces.preferences.set(id, {
      workspaceId: id,
      currency: "XAF",
      locale: "en-US",
      timezone: "Africa/Douala",
      weekStartsOn: 1,
      createdAt: now,
      updatedAt: now,
    });
    workspaces.addMembership({ workspaceId: id, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now });
  }
  workspaces.addMembership({ workspaceId: workspaceOne, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: now });

  const cash = await ledger.createAccount(owner, workspaceOne, {
    name: "Cash",
    type: "CASH",
    currency: "XAF",
    openingBalanceMinor: "100000",
  });
  const savings = await ledger.createAccount(owner, workspaceOne, {
    name: "Savings",
    type: "SAVINGS",
    currency: "XAF",
  });
  const foreignCash = await ledger.createAccount(owner, workspaceTwo, {
    name: "Foreign cash",
    type: "CASH",
    currency: "XAF",
  });

  const expense = await ledger.createTransaction(owner, workspaceOne, {
    kind: "EXPENSE",
    status: "POSTED",
    accountId: cash.id,
    amountMinor: 24_850n,
    currency: "XAF",
    occurredAt: new Date("2026-09-01T08:30:00.000Z"),
    categoryId: SYSTEM_GROCERIES_ID,
    merchantName: "Fresh Market",
    source: { provider: "manual", origin: "MANUAL" },
    note: "Original expense note",
  });
  const income = await ledger.createTransaction(owner, workspaceOne, {
    kind: "INCOME",
    status: "POSTED",
    accountId: cash.id,
    amountMinor: 90_000n,
    currency: "XAF",
    occurredAt: new Date("2026-09-02T08:30:00.000Z"),
    categoryId: SYSTEM_SALARY_ID,
    merchantName: "Old Client",
    source: { provider: "manual", origin: "MANUAL" },
    note: "Original income note",
  });
  const transfer = await ledger.createTransaction(owner, workspaceOne, {
    kind: "TRANSFER",
    status: "POSTED",
    accountId: cash.id,
    transferAccountId: savings.id,
    transferGroupId: "00000000-0000-4000-8000-000000000021",
    amountMinor: 10_000n,
    currency: "XAF",
    occurredAt: new Date("2026-09-03T08:30:00.000Z"),
    source: { provider: "manual", origin: "MANUAL" },
    note: "Original transfer note",
  });

  const dependencies = { ledger, ledgerRecords: records, workspaces };
  const update = async (
    transactionId: string,
    patch: unknown,
    options: { actor?: AuthenticatedActor | null; workspaceId?: string; expectedUpdatedAt?: Date } = {},
  ) => {
    const current = records.transactions.get(transactionId);
    assert.ok(current, "fixture transaction exists");
    return updateTransactionDetailsForActor(options.actor === undefined ? owner : options.actor, {
      workspaceId: options.workspaceId ?? workspaceOne,
      transactionId,
      expectedUpdatedAt: (options.expectedUpdatedAt ?? current.updatedAt).toISOString(),
      patch,
    }, dependencies);
  };

  return { cash, dependencies, expense, foreignCash, income, records, savings, transfer, update, workspaces };
}

function financialShape(transaction: LedgerTransactionRecord) {
  return {
    id: transaction.id,
    workspaceId: transaction.workspaceId,
    kind: transaction.kind,
    status: transaction.status,
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
    accountId: transaction.accountId,
    transferAccountId: transaction.transferAccountId,
    transferGroupId: transaction.transferGroupId,
    refundedTransactionId: transaction.refundedTransactionId,
    source: transaction.source,
    deduplicationFingerprint: transaction.deduplicationFingerprint,
    createdByUserId: transaction.createdByUserId,
    paidByUserId: transaction.paidByUserId,
  };
}

function accountBalance(records: InMemoryLedgerRepository, accountId: string): bigint {
  const account = records.accounts.get(accountId);
  assert.ok(account);
  return [...records.transactions.values()].reduce((balance, transaction) => {
    if (transaction.status !== "POSTED") return balance;
    if (transaction.kind === "EXPENSE") return transaction.accountId === accountId ? balance - transaction.amountMinor : balance;
    if (transaction.kind === "INCOME" || transaction.kind === "REFUND") {
      return transaction.accountId === accountId ? balance + transaction.amountMinor : balance;
    }
    if (transaction.kind === "TRANSFER") {
      if (transaction.accountId === accountId) return balance - transaction.amountMinor;
      if (transaction.transferAccountId === accountId) return balance + transaction.amountMinor;
    }
    return balance;
  }, account.openingBalanceMinor);
}

test("expense safe edits change only counterparty, category, note, and occurredAt with explicit clearing", async () => {
  const { expense, records, update } = await fixture();

  let result = await update(expense.id, { merchant: "  New   Market  " });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.transaction.merchant?.name, "New   Market");
  assert.equal(records.merchants.get(records.transactions.get(expense.id)?.merchantId ?? "")?.normalizedName, "new market");

  result = await update(expense.id, { merchant: null });
  assert.equal(result.ok, true);
  assert.equal(records.transactions.get(expense.id)?.merchantId, null);

  result = await update(expense.id, { categoryId: SYSTEM_TRANSPORT_ID });
  assert.equal(result.ok, true);
  assert.equal(records.transactions.get(expense.id)?.categoryId, SYSTEM_TRANSPORT_ID);

  result = await update(expense.id, { categoryId: null });
  assert.equal(result.ok, true);
  assert.equal(records.transactions.get(expense.id)?.categoryId, null);

  assert.deepEqual(await update(expense.id, { categoryId: SYSTEM_SALARY_ID }), {
    ok: false,
    code: "CATEGORY_NOT_ALLOWED",
  });

  result = await update(expense.id, { note: "  Reconciled note  " });
  assert.equal(result.ok, true);
  assert.equal(records.transactions.get(expense.id)?.note, "Reconciled note");
  result = await update(expense.id, { note: null });
  assert.equal(result.ok, true);
  assert.equal(records.transactions.get(expense.id)?.note, null);

  result = await update(expense.id, { occurredAt: { date: "2026-09-05", time: "16:15" } });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.transaction.occurredAt, "2026-09-05T15:15:00.000Z");
  assert.equal(records.transactions.get(expense.id)?.occurredAt.toISOString(), "2026-09-05T15:15:00.000Z");
});

test("income uses the canonical counterparty relation with source labeling and category compatibility", async () => {
  const { income, records, update } = await fixture();

  let result = await update(income.id, { source: "  Client   B  " });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.transaction.merchant?.name, "Client   B");

  result = await update(income.id, { categoryId: SYSTEM_SALARY_ID, note: "Paid", occurredAt: { date: "2026-09-06" } });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.transaction.note, "Paid");
    assert.equal(result.transaction.occurredAt, "2026-09-06T11:00:00.000Z");
  }
  assert.equal(records.transactions.get(income.id)?.categoryId, SYSTEM_SALARY_ID);
  assert.deepEqual(await update(income.id, { categoryId: SYSTEM_GROCERIES_ID }), {
    ok: false,
    code: "CATEGORY_NOT_ALLOWED",
  });
});

test("transfer permits only note and occurredAt safe edits", async () => {
  const { records, transfer, update } = await fixture();

  let result = await update(transfer.id, { note: "Move cash to savings" });
  assert.equal(result.ok, true);
  assert.equal(records.transactions.get(transfer.id)?.note, "Move cash to savings");

  result = await update(transfer.id, { occurredAt: { date: "2026-09-07", time: "07:00" } });
  assert.equal(result.ok, true);
  assert.equal(records.transactions.get(transfer.id)?.occurredAt.toISOString(), "2026-09-07T06:00:00.000Z");

  assert.deepEqual(await update(transfer.id, { categoryId: SYSTEM_TRANSPORT_ID }), {
    ok: false,
    code: "INVALID_CATEGORY",
  });
  assert.deepEqual(await update(transfer.id, { merchant: "Not allowed" }), {
    ok: false,
    code: "INVALID_COUNTERPARTY",
  });
  assert.deepEqual(await update(transfer.id, { source: "Not allowed" }), {
    ok: false,
    code: "INVALID_COUNTERPARTY",
  });
});

test("strict patching preserves all financial fields, balances, and transaction cardinality", async () => {
  const { cash, expense, records, savings, update } = await fixture();
  const before = records.transactions.get(expense.id);
  assert.ok(before);
  const beforeFinancial = financialShape(before);
  const beforeCashBalance = accountBalance(records, cash.id);
  const beforeSavingsBalance = accountBalance(records, savings.id);
  const transactionCount = records.transactions.size;

  for (const patch of [
    { amountMinor: "1" },
    { currency: "USD" },
    { accountId: "00000000-0000-4000-8000-000000000099" },
    { fromAccountId: "00000000-0000-4000-8000-000000000099" },
    { toAccountId: "00000000-0000-4000-8000-000000000099" },
    { kind: "INCOME" },
    { workspaceId: workspaceTwo },
    { status: "PENDING" },
  ]) {
    assert.deepEqual(await update(expense.id, patch), { ok: false, code: "TRANSACTION_UPDATE_FAILED" });
  }

  const result = await update(expense.id, { note: "Only details changed" });
  assert.equal(result.ok, true);
  const after = records.transactions.get(expense.id);
  assert.ok(after);
  assert.deepEqual(financialShape(after), beforeFinancial);
  assert.equal(accountBalance(records, cash.id), beforeCashBalance);
  assert.equal(accountBalance(records, savings.id), beforeSavingsBalance);
  assert.equal(records.transactions.size, transactionCount);
});

test("safe updates enforce workspace authorization, policy, audit, verification, and optimistic concurrency", async () => {
  const { expense, records, update, workspaces } = await fixture();
  const initial = records.transactions.get(expense.id);
  assert.ok(initial);

  assert.deepEqual(await update(expense.id, { note: "No session" }, { actor: null }), {
    ok: false,
    code: "UNAUTHENTICATED",
  });
  assert.deepEqual(await update(expense.id, { note: "Viewer" }, { actor: viewer }), {
    ok: false,
    code: "WORKSPACE_FORBIDDEN",
  });
  assert.deepEqual(await update(expense.id, { note: "Foreign" }, { workspaceId: workspaceTwo }), {
    ok: false,
    code: "TRANSACTION_NOT_FOUND",
  });

  const auditsBefore = await records.listTransactionAudit(workspaceOne, expense.id);
  const changed = await update(expense.id, { note: "Audited update" });
  assert.equal(changed.ok, true);
  if (changed.ok) {
    assert.equal(changed.transaction.note, "Audited update");
    assert.equal(changed.transaction.amount.minor, "24850");
    assert.ok(changed.transaction.updatedAt > initial.updatedAt.toISOString());
  }
  const auditsAfter = await records.listTransactionAudit(workspaceOne, expense.id);
  assert.equal(auditsAfter.length, auditsBefore.length + 1);
  assert.equal(auditsAfter.at(-1)?.actorUserId, owner.userId);
  assert.equal(auditsAfter.at(-1)?.action, "UPDATE");
  assert.deepEqual(auditsAfter.at(-1)?.metadata, {
    changes: { note: { before: "[present]", after: "[present]" } },
  });

  const afterFirstUpdate = records.transactions.get(expense.id);
  assert.ok(afterFirstUpdate);
  assert.deepEqual(
    await update(expense.id, { note: "Stale overwrite" }, { expectedUpdatedAt: initial.updatedAt }),
    { ok: false, code: "CONCURRENT_MODIFICATION" },
  );
  assert.equal(records.transactions.get(expense.id)?.note, "Audited update");

  // A reconciled identical command is a no-op: it does not create a second audit event.
  const idempotent = await update(expense.id, { note: "Audited update" });
  assert.equal(idempotent.ok, true);
  assert.equal((await records.listTransactionAudit(workspaceOne, expense.id)).length, auditsAfter.length);

  records.transactions.set(expense.id, {
    ...afterFirstUpdate,
    source: { provider: "pace-import" },
  });
  assert.deepEqual(await update(expense.id, { note: "Imported rows stay locked" }), {
    ok: false,
    code: "TRANSACTION_EDIT_NOT_ALLOWED",
  });
  assert.ok(workspaces.memberships.size > 0);
});
