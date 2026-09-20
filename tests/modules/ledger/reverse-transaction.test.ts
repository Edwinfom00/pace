import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { AuthenticatedActor } from "@/authorization/session";
import { correctTransactionForActor } from "@/modules/ledger/correct-transaction";
import { createRefundForActor } from "@/modules/ledger/create-refund";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { reverseTransactionForActor } from "@/modules/ledger/reverse-transaction";
import { calculateIncomeAndSpendingTotals } from "@/modules/ledger/totals";
import { currentMoneyTransactions } from "@/money/engine";

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
      id, name, slug: name.toLocaleLowerCase(), type: "CUSTOM", createdByUserId: owner.userId, createdAt: now, updatedAt: now,
    });
    workspaces.preferences.set(id, {
      workspaceId: id, currency: "XAF", locale: "en-US", timezone: "Africa/Douala", weekStartsOn: 1, createdAt: now, updatedAt: now,
    });
    workspaces.addMembership({ workspaceId: id, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now });
  }
  workspaces.addMembership({ workspaceId, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: now });

  const cash = await ledger.createAccount(owner, workspaceId, {
    name: "Cash", type: "CASH", currency: "XAF", openingBalanceMinor: "1000000",
  });
  const savings = await ledger.createAccount(owner, workspaceId, {
    name: "Savings", type: "SAVINGS", currency: "XAF", openingBalanceMinor: "200000",
  });
  const otherCash = await ledger.createAccount(owner, otherWorkspaceId, {
    name: "Other", type: "CASH", currency: "XAF",
  });
  const expense = await ledger.createTransaction(owner, workspaceId, {
    kind: "EXPENSE", status: "POSTED", accountId: cash.id, categoryId: SYSTEM_GROCERIES_ID,
    amountMinor: 100n, currency: "XAF", occurredAt: new Date("2026-09-02T09:00:00.000Z"), note: "Groceries",
  });
  const income = await ledger.createTransaction(owner, workspaceId, {
    kind: "INCOME", status: "POSTED", accountId: cash.id, categoryId: SYSTEM_SALARY_ID,
    amountMinor: 75n, currency: "XAF", occurredAt: new Date("2026-09-03T09:00:00.000Z"), note: "Salary",
  });
  const transfer = await ledger.createTransaction(owner, workspaceId, {
    kind: "TRANSFER", status: "POSTED", accountId: cash.id, transferAccountId: savings.id,
    amountMinor: 50n, currency: "XAF", occurredAt: new Date("2026-09-04T09:00:00.000Z"), note: "Savings transfer",
  });

  const reverse = (transactionId: string, options: {
    actor?: AuthenticatedActor | null;
    workspace?: string;
    idempotencyKey?: string;
    expectedUpdatedAt?: string;
    reason?: string;
  } = {}) => reverseTransactionForActor(options.actor === undefined ? owner : options.actor, {
    workspaceId: options.workspace ?? workspaceId,
    transactionId,
    idempotencyKey: options.idempotencyKey ?? randomUUID(),
    expectedUpdatedAt: options.expectedUpdatedAt,
    reason: options.reason,
  }, { ledger });
  const correct = (transactionId: string, amountMinor: string, idempotencyKey = randomUUID()) =>
    correctTransactionForActor(owner, {
      workspaceId, transactionId, kind: "EXPENSE", financialChanges: { amountMinor }, idempotencyKey,
    }, { ledger });
  const refund = () => createRefundForActor(owner, {
    workspaceId, expenseTransactionId: expense.id, amountMinor: "40", currency: "XAF",
    occurredAt: "2026-09-05T09:00:00.000Z", idempotencyKey: randomUUID(), reason: "Returned item",
  }, { ledger });

  return { cash, correct, expense, income, ledger, otherCash, records, refund, reverse, savings, transfer };
}

function accountBalance(records: InMemoryLedgerRepository, accountId: string): bigint {
  const account = records.accounts.get(accountId);
  assert.ok(account);
  return [...records.transactions.values()].reduce((balance, transaction) => {
    if (transaction.status !== "POSTED") return balance;
    if (transaction.kind === "EXPENSE") {
      return transaction.accountId === accountId
        ? balance + (transaction.reversalOfTransactionId === null ? -transaction.amountMinor : transaction.amountMinor)
        : balance;
    }
    if (transaction.kind === "INCOME" || transaction.kind === "REFUND") {
      return transaction.accountId === accountId
        ? balance + (transaction.reversalOfTransactionId === null ? transaction.amountMinor : -transaction.amountMinor)
        : balance;
    }
    if (transaction.kind === "TRANSFER") {
      if (transaction.accountId === accountId) return balance - transaction.amountMinor;
      if (transaction.transferAccountId === accountId) return balance + transaction.amountMinor;
    }
    return balance;
  }, account.openingBalanceMinor);
}

test("manual expense reversal appends one linked inverse with no replacement and neutral reporting", async () => {
  const { cash, expense, income, records, reverse, transfer } = await fixture();
  const result = await reverse(expense.id, { reason: "Duplicate transaction" });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.reversal.effectiveState, "REVERSED");
  assert.equal(result.reversal.originalTransaction.id, expense.id);
  assert.equal(result.reversal.reversalTransaction.kind, "EXPENSE");
  assert.equal(result.reversal.reversalTransaction.amountMinor, "100");
  assert.equal(result.reversal.reversalTransaction.reversalOfTransactionId, expense.id);
  assert.equal(records.transactions.size, 4);
  assert.equal(records.transactionCorrections.size, 0);
  assert.equal(accountBalance(records, cash.id), 1_000_025n);
  assert.deepEqual(calculateIncomeAndSpendingTotals([...records.transactions.values()], "XAF"), {
    incomeMinor: 75n,
    spendingMinor: 0n,
  });
  assert.deepEqual(
    currentMoneyTransactions([...records.transactions.values()]).map((transaction) => transaction.id).sort(),
    [income.id, transfer.id].sort(),
  );
  const defaultList = await records.listTransactionListPage(workspaceId, {
    offset: 0,
    limit: 20,
    sort: "NEWEST",
  });
  assert.deepEqual(
    defaultList.map((row) => row.transaction.id).sort(),
    [income.id, transfer.id].sort(),
  );
  const originalAudit = await records.listTransactionAudit(workspaceId, expense.id);
  const reversalAudit = await records.listTransactionAudit(workspaceId, result.reversal.reversalTransaction.id);
  assert.equal(originalAudit.at(-1)?.action, "MANUAL_REVERSAL");
  assert.equal(originalAudit.at(-1)?.metadata.reason, "Duplicate transaction");
  assert.equal(reversalAudit.at(-1)?.action, "MANUAL_REVERSAL_ENTRY");
});

test("manual income and transfer reversals use the same canonical opposite-entry semantics", async () => {
  const { cash, income, records, reverse, savings, transfer } = await fixture();
  const incomeResult = await reverse(income.id);
  const transferResult = await reverse(transfer.id);

  assert.equal(incomeResult.ok, true);
  assert.equal(transferResult.ok, true);
  if (!incomeResult.ok || !transferResult.ok) return;
  assert.equal(incomeResult.reversal.reversalTransaction.kind, "INCOME");
  assert.equal(incomeResult.reversal.reversalTransaction.accountId, cash.id);
  assert.equal(transferResult.reversal.reversalTransaction.kind, "TRANSFER");
  assert.equal(transferResult.reversal.reversalTransaction.accountId, savings.id);
  assert.equal(transferResult.reversal.reversalTransaction.transferAccountId, cash.id);
  assert.equal(accountBalance(records, cash.id), 999_900n);
  assert.equal(accountBalance(records, savings.id), 200_000n);
  assert.deepEqual(calculateIncomeAndSpendingTotals([...records.transactions.values()], "XAF"), {
    incomeMinor: 0n,
    spendingMinor: 100n,
  });
});

test("only the current correction replacement may be reversed", async () => {
  const { correct, expense, ledger, records, reverse } = await fixture();
  const correction = await correct(expense.id, "90");
  assert.equal(correction.ok, true);
  if (!correction.ok) return;

  assert.deepEqual(await reverse(expense.id), { ok: false, code: "TRANSACTION_NOT_CURRENT" });
  const reversed = await reverse(correction.correction.replacementTransaction.id);
  assert.equal(reversed.ok, true);
  assert.deepEqual(calculateIncomeAndSpendingTotals([...records.transactions.values()], "XAF"), {
    incomeMinor: 75n,
    spendingMinor: 0n,
  });
  await assert.rejects(
    () => ledger.getCurrentEffectiveTransaction(owner, workspaceId, expense.id),
    /manually reversed/,
  );
});

test("manual reversal is idempotent, conflict-safe, and rejects active refunds", async () => {
  const first = await fixture();
  const key = "b0000000-0000-4000-8000-000000000951";
  const [left, right] = await Promise.all([
    first.reverse(first.expense.id, { idempotencyKey: key, reason: "Duplicate" }),
    first.reverse(first.expense.id, { idempotencyKey: key, reason: "Duplicate" }),
  ]);
  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  if (!left.ok || !right.ok) return;
  assert.equal(left.reversal.reversalTransaction.id, right.reversal.reversalTransaction.id);
  assert.equal([...first.records.transactions.values()].filter((entry) => entry.reversalOfTransactionId === first.expense.id).length, 1);
  assert.deepEqual(await first.reverse(left.reversal.reversalTransaction.id), {
    ok: false,
    code: "TRANSACTION_NOT_CURRENT",
  });
  assert.deepEqual(
    await first.reverse(first.expense.id, { idempotencyKey: key, reason: "Different intent" }),
    { ok: false, code: "REVERSAL_ALREADY_PROCESSED" },
  );

  const refunded = await fixture();
  assert.equal((await refunded.refund()).ok, true);
  assert.deepEqual(await refunded.reverse(refunded.expense.id), {
    ok: false,
    code: "TRANSACTION_HAS_ACTIVE_REFUNDS",
  });
});

test("manual reversal and correction cannot both win; authorization and atomicity are enforced", async () => {
  const concurrent = await fixture();
  const [reversal, correction] = await Promise.all([
    concurrent.reverse(concurrent.expense.id),
    concurrent.correct(concurrent.expense.id, "90"),
  ]);
  assert.equal([reversal, correction].filter((result) => result.ok).length, 1);
  assert.equal(
    [reversal, correction].find((result) => !result.ok)?.code,
    "TRANSACTION_ALREADY_REVERSED",
  );

  const secure = await fixture();
  assert.deepEqual(await secure.reverse(secure.expense.id, { actor: viewer }), { ok: false, code: "WORKSPACE_FORBIDDEN" });
  assert.deepEqual(await secure.reverse(secure.expense.id, { workspace: otherWorkspaceId }), { ok: false, code: "TRANSACTION_NOT_FOUND" });
  const before = secure.records.transactions.size;
  secure.records.failManualReversalStage = "audit";
  assert.deepEqual(await secure.reverse(secure.income.id), { ok: false, code: "TRANSACTION_REVERSAL_FAILED" });
  assert.equal(secure.records.transactions.size, before);
});
