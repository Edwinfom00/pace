import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { DomainConflictError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { correctTransactionForActor } from "@/modules/ledger/correct-transaction";
import { createRefundForActor } from "@/modules/ledger/create-refund";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { calculateIncomeAndSpendingTotals } from "@/modules/ledger/totals";

import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_SALARY_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceId = "workspace-one";
const otherWorkspaceId = "workspace-two";

async function fixture() {
  const records = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(records, workspaces);
  const now = new Date("2026-09-01T00:00:00.000Z");

  for (const [id, name] of [[workspaceId, "One"], [otherWorkspaceId, "Two"]] as const) {
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
  workspaces.addMembership({ workspaceId, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: now });

  const cash = await ledger.createAccount(owner, workspaceId, { name: "Cash", type: "CASH", currency: "XAF" });
  const wallet = await ledger.createAccount(owner, workspaceId, { name: "Wallet", type: "MOBILE_MONEY", currency: "XAF" });
  const euro = await ledger.createAccount(owner, workspaceId, { name: "Euro", type: "SAVINGS", currency: "EUR" });
  const foreign = await ledger.createAccount(owner, otherWorkspaceId, { name: "Foreign", type: "CASH", currency: "XAF" });
  const merchant = await ledger.createMerchant(owner, workspaceId, { name: "Market" });
  const expense = await ledger.createTransaction(owner, workspaceId, {
    kind: "EXPENSE",
    status: "POSTED",
    accountId: cash.id,
    categoryId: SYSTEM_GROCERIES_ID,
    merchantId: merchant.id,
    amountMinor: 100n,
    currency: "XAF",
    occurredAt: new Date("2026-09-02T09:00:00.000Z"),
    note: "Original expense",
  });
  const income = await ledger.createTransaction(owner, workspaceId, {
    kind: "INCOME",
    accountId: cash.id,
    categoryId: SYSTEM_SALARY_ID,
    amountMinor: 100n,
    currency: "XAF",
    occurredAt: new Date("2026-09-02T10:00:00.000Z"),
  });
  const transfer = await ledger.createTransaction(owner, workspaceId, {
    kind: "TRANSFER",
    accountId: cash.id,
    transferAccountId: wallet.id,
    amountMinor: 10n,
    currency: "XAF",
    occurredAt: new Date("2026-09-02T11:00:00.000Z"),
  });

  const refund = (
    overrides: Record<string, unknown> = {},
    actor: AuthenticatedActor | null = owner,
  ) => createRefundForActor(actor, {
    workspaceId,
    expenseTransactionId: expense.id,
    amountMinor: "40",
    currency: "XAF",
    occurredAt: "2026-09-04T12:00:00.000Z",
    idempotencyKey: randomUUID(),
    ...overrides,
  }, { ledger });

  return { cash, euro, expense, foreign, income, ledger, merchant, records, refund, transfer, wallet, workspaces };
}

test("canonical refunds create full and partial real-world events with exact derived totals", async () => {
  const full = await fixture();
  const fullResult = await full.refund({ amountMinor: "100", note: "Card reversal", reason: "Returned at till" });
  assert.equal(fullResult.ok, true);
  if (!fullResult.ok) return;
  assert.equal(fullResult.refund.refundStatus, "FULL");
  assert.equal(fullResult.refund.totalRefundedMinor, "100");
  assert.equal(fullResult.refund.remainingRefundableMinor, "0");
  assert.equal(fullResult.refund.refundTransaction.kind, "REFUND");
  assert.equal(fullResult.refund.refundTransaction.accountId, full.cash.id);
  assert.equal(fullResult.refund.refundTransaction.note, "Card reversal");
  assert.equal(fullResult.refund.refundTransaction.reason, "Returned at till");

  const partial = await fixture();
  const first = await partial.refund({ amountMinor: "40" });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.refund.refundStatus, "PARTIAL");
  assert.deepEqual(calculateIncomeAndSpendingTotals([...partial.records.transactions.values()], "XAF"), {
    incomeMinor: 100n,
    spendingMinor: 60n,
  });
  const second = await partial.refund({ amountMinor: "20", accountId: partial.wallet.id });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.refund.totalRefundedMinor, "60");
  assert.equal(second.refund.remainingRefundableMinor, "40");
  assert.equal(second.refund.refundTransaction.accountId, partial.wallet.id);
  assert.equal(second.refund.refundTransaction.sourceExpenseId, partial.expense.id);
  assert.equal(partial.records.transactions.get(second.refund.refundTransaction.id)?.categoryId, partial.expense.categoryId);
  assert.equal(partial.records.transactions.get(second.refund.refundTransaction.id)?.merchantId, partial.merchant.id);
  assert.deepEqual(calculateIncomeAndSpendingTotals([...partial.records.transactions.values()], "XAF"), {
    incomeMinor: 100n,
    spendingMinor: 40n,
  });
});

test("a correction before a refund retains the corrected net spending", async () => {
  const { expense, ledger, records, refund } = await fixture();
  const correction = await ledger.correctTransaction(owner, {
    workspaceId,
    transactionId: expense.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: 90n },
    idempotencyKey: randomUUID(),
  });

  const issued = await refund({
    expenseTransactionId: correction.replacementTransaction.id,
    amountMinor: "20",
  });
  assert.equal(issued.ok, true);
  if (!issued.ok) return;

  assert.equal(issued.refund.effectiveExpenseAmountMinor, "90");
  assert.equal(issued.refund.totalRefundedMinor, "20");
  assert.equal(issued.refund.remainingRefundableMinor, "70");
  assert.deepEqual(calculateIncomeAndSpendingTotals([...records.transactions.values()], "XAF"), {
    incomeMinor: 100n,
    spendingMinor: 70n,
  });
});

test("refunds reject over-refunds, invalid money, wrong currency, ineligible sources, and foreign accounts", async () => {
  const { euro, expense, foreign, income, ledger, refund, transfer } = await fixture();
  assert.equal((await refund({ amountMinor: "80" })).ok, true);
  assert.deepEqual(await refund({ amountMinor: "30" }), { ok: false, code: "REFUND_EXCEEDS_REMAINING_AMOUNT" });
  assert.deepEqual(await refund({ amountMinor: "0" }), { ok: false, code: "INVALID_REFUND_AMOUNT" });
  assert.deepEqual(await refund({ amountMinor: "-1" }), { ok: false, code: "INVALID_REFUND_AMOUNT" });
  assert.deepEqual(await refund({ amountMinor: "40.5" }), { ok: false, code: "INVALID_REFUND_AMOUNT" });
  assert.deepEqual(await refund({ currency: "EUR" }), { ok: false, code: "INVALID_CURRENCY" });
  assert.deepEqual(await refund({ accountId: euro.id }), { ok: false, code: "INVALID_CURRENCY" });
  assert.deepEqual(await refund({ accountId: foreign.id }), { ok: false, code: "ACCOUNT_WORKSPACE_MISMATCH" });
  assert.deepEqual(await refund({ expenseTransactionId: income.id }), { ok: false, code: "SOURCE_NOT_EXPENSE" });
  assert.deepEqual(await refund({ expenseTransactionId: transfer.id }), { ok: false, code: "SOURCE_NOT_EXPENSE" });
  const pendingExpense = await ledger.createTransaction(owner, workspaceId, {
    kind: "EXPENSE",
    status: "PENDING",
    accountId: expense.accountId!,
    categoryId: SYSTEM_GROCERIES_ID,
    amountMinor: 20n,
    currency: "XAF",
    occurredAt: new Date("2026-09-04T11:00:00.000Z"),
  });
  assert.deepEqual(await refund({ expenseTransactionId: pendingExpense.id }), { ok: false, code: "REFUND_NOT_ALLOWED" });
  const foreignExpense = await ledger.createTransaction(owner, otherWorkspaceId, {
    kind: "EXPENSE",
    accountId: foreign.id,
    categoryId: SYSTEM_GROCERIES_ID,
    amountMinor: 20n,
    currency: "XAF",
    occurredAt: new Date("2026-09-04T11:00:00.000Z"),
  });
  assert.deepEqual(await refund({ expenseTransactionId: foreignExpense.id }), { ok: false, code: "TRANSACTION_NOT_FOUND" });

  await assert.rejects(
    ledger.createTransaction(owner, workspaceId, {
      kind: "REFUND",
      accountId: expense.accountId!,
      refundedTransactionId: expense.id,
      amountMinor: "1",
      currency: "XAF",
      occurredAt: "2026-09-04T12:00:00.000Z",
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "REFUND_CANONICAL_OPERATION_REQUIRED",
  );
});

test("refunds follow the current effective expense and include prior-version refunds in their cap", async () => {
  const { expense, ledger, records, refund } = await fixture();
  const initial = await refund({ amountMinor: "40" });
  assert.equal(initial.ok, true);

  const transactionCountBeforeRejectedCorrection = records.transactions.size;
  assert.deepEqual(await correctTransactionForActor(owner, {
    workspaceId,
    transactionId: expense.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: "39" },
    idempotencyKey: randomUUID(),
  }, { ledger }), { ok: false, code: "CORRECTED_AMOUNT_BELOW_REFUNDED_TOTAL" });
  assert.equal(records.transactions.size, transactionCountBeforeRejectedCorrection);

  const correction = await ledger.correctTransaction(owner, {
    workspaceId,
    transactionId: expense.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: 90n },
    idempotencyKey: randomUUID(),
  });
  const replacement = correction.replacementTransaction;
  assert.deepEqual(await refund({ expenseTransactionId: expense.id }), { ok: false, code: "TRANSACTION_NOT_CURRENT" });
  assert.deepEqual(await refund({ expenseTransactionId: correction.reversalTransaction.id }), {
    ok: false,
    code: "TRANSACTION_NOT_CURRENT",
  });
  assert.deepEqual(await refund({ expenseTransactionId: replacement.id, amountMinor: "51" }), {
    ok: false,
    code: "REFUND_EXCEEDS_REMAINING_AMOUNT",
  });
  const current = await refund({ expenseTransactionId: replacement.id, amountMinor: "50" });
  assert.equal(current.ok, true);
  if (!current.ok) return;
  assert.equal(current.refund.sourceExpenseId, replacement.id);
  assert.equal(current.refund.effectiveExpenseAmountMinor, "90");
  assert.equal(current.refund.totalRefundedMinor, "90");
  assert.equal(current.refund.refundStatus, "FULL");
  assert.equal(records.transactions.get(expense.id)?.amountMinor, 100n);
});

test("refund retries are idempotent, concurrent partial attempts cannot over-refund, and audit writes are atomic", async () => {
  const { expense, records, refund } = await fixture();
  const retryKey = randomUUID();
  const command = { amountMinor: "40", idempotencyKey: retryKey };
  const [first, replay] = await Promise.all([refund(command), refund(command)]);
  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  if (!first.ok || !replay.ok) return;
  assert.equal(first.refund.refundTransaction.id, replay.refund.refundTransaction.id);
  assert.equal((await records.listRefundsForTransaction(workspaceId, expense.id)).length, 1);

  const firstAudit = await records.listTransactionAudit(workspaceId, expense.id);
  const refundAudit = await records.listTransactionAudit(workspaceId, first.refund.refundTransaction.id);
  assert.equal(firstAudit.some((audit) => audit.action === "REFUND_ISSUED"), true);
  assert.equal(refundAudit.some((audit) => audit.action === "REFUND_CREATED"), true);
  assert.equal(
    firstAudit.find((audit) => audit.action === "REFUND_ISSUED")?.metadata.refundTransactionId,
    first.refund.refundTransaction.id,
  );

  const concurrent = await fixture();
  const [left, right] = await Promise.all([
    concurrent.refund({ amountMinor: "60" }),
    concurrent.refund({ amountMinor: "60" }),
  ]);
  assert.equal([left, right].filter((result) => result.ok).length, 1);
  assert.equal([left, right].some((result) => !result.ok && result.code === "REFUND_EXCEEDS_REMAINING_AMOUNT"), true);
  assert.equal((await concurrent.records.listRefundsForTransaction(workspaceId, concurrent.expense.id))[0]?.amountMinor, 60n);

  const atomic = await fixture();
  atomic.records.failRefundStage = "audit";
  const beforeTransactions = atomic.records.transactions.size;
  const failed = await atomic.refund({ amountMinor: "40" });
  assert.deepEqual(failed, { ok: false, code: "REFUND_CREATE_FAILED" });
  assert.equal(atomic.records.transactions.size, beforeTransactions);
  assert.equal((await atomic.records.listRefundsForTransaction(workspaceId, atomic.expense.id)).length, 0);
});

test("refund authorization and full-refund enforcement remain server authoritative", async () => {
  const { refund } = await fixture();
  assert.deepEqual(await refund({}, null), { ok: false, code: "UNAUTHENTICATED" });
  assert.deepEqual(await refund({}, viewer), { ok: false, code: "WORKSPACE_FORBIDDEN" });
  assert.equal((await refund({ amountMinor: "100" })).ok, true);
  assert.deepEqual(await refund({ amountMinor: "1" }), { ok: false, code: "EXPENSE_ALREADY_FULLY_REFUNDED" });
});
