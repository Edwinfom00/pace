import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { AuthenticatedActor } from "@/authorization/session";
import { correctTransactionForActor } from "@/modules/ledger/correct-transaction";
import { LedgerService } from "@/modules/ledger/ledger-service";
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
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";

async function fixture() {
  const records = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(records, workspaces);
  const now = new Date("2026-09-01T00:00:00.000Z");

  for (const [id, name, currency] of [
    [workspaceOne, "One", "XAF"],
    [workspaceTwo, "Two", "XAF"],
  ] as const) {
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
      currency,
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
    name: "Cash", type: "CASH", currency: "XAF", openingBalanceMinor: "1000000",
  });
  const savings = await ledger.createAccount(owner, workspaceOne, {
    name: "Savings", type: "SAVINGS", currency: "XAF", openingBalanceMinor: "200000",
  });
  const mobile = await ledger.createAccount(owner, workspaceOne, {
    name: "Mobile", type: "MOBILE_MONEY", currency: "XAF", openingBalanceMinor: "50000",
  });
  const euro = await ledger.createAccount(owner, workspaceOne, {
    name: "Euro", type: "SAVINGS", currency: "EUR",
  });
  const foreignCash = await ledger.createAccount(owner, workspaceTwo, {
    name: "Foreign", type: "CASH", currency: "XAF",
  });
  const household = await ledger.createCategory(owner, workspaceOne, {
    name: "Household", kind: "EXPENSE",
  });

  const expense = await ledger.createTransaction(owner, workspaceOne, {
    kind: "EXPENSE", status: "POSTED", accountId: cash.id, amountMinor: 100_000n, currency: "XAF",
    occurredAt: new Date("2026-09-02T08:30:00.000Z"), categoryId: SYSTEM_GROCERIES_ID,
    merchantName: "Fresh Market", source: { provider: "manual", origin: "MANUAL" }, note: "Weekly food",
  });
  const income = await ledger.createTransaction(owner, workspaceOne, {
    kind: "INCOME", status: "POSTED", accountId: cash.id, amountMinor: 50_000n, currency: "XAF",
    occurredAt: new Date("2026-09-03T08:30:00.000Z"), categoryId: SYSTEM_SALARY_ID,
    merchantName: "Acme", source: { provider: "manual", origin: "MANUAL" }, note: "Invoice",
  });
  const transfer = await ledger.createTransaction(owner, workspaceOne, {
    kind: "TRANSFER", status: "POSTED", accountId: cash.id, transferAccountId: savings.id,
    amountMinor: 25_000n, currency: "XAF", occurredAt: new Date("2026-09-04T08:30:00.000Z"),
    source: { provider: "manual", origin: "MANUAL" }, note: "Set aside",
  });

  const correct = (transactionId: string, kind: "EXPENSE" | "INCOME" | "TRANSFER", financialChanges: object, options: {
    actor?: AuthenticatedActor | null;
    idempotencyKey?: string;
    expectedUpdatedAt?: string;
    workspaceId?: string;
    reason?: string;
    details?: object;
  } = {}) => correctTransactionForActor(options.actor === undefined ? owner : options.actor, {
    workspaceId: options.workspaceId ?? workspaceOne,
    transactionId,
    kind,
    financialChanges,
    idempotencyKey: options.idempotencyKey ?? randomUUID(),
    expectedUpdatedAt: options.expectedUpdatedAt,
    reason: options.reason,
    details: options.details,
  }, { ledger });

  return { cash, correct, euro, expense, foreignCash, household, income, ledger, mobile, records, savings, transfer, workspaces };
}

function accountBalance(records: InMemoryLedgerRepository, accountId: string): bigint {
  const account = records.accounts.get(accountId);
  assert.ok(account);
  return [...records.transactions.values()].reduce((balance, transaction) => {
    if (transaction.status !== "POSTED") return balance;
    if (transaction.kind === "EXPENSE") {
      const effect = transaction.reversalOfTransactionId == null ? -transaction.amountMinor : transaction.amountMinor;
      return transaction.accountId === accountId ? balance + effect : balance;
    }
    if (transaction.kind === "INCOME" || transaction.kind === "REFUND") {
      const effect = transaction.reversalOfTransactionId == null ? transaction.amountMinor : -transaction.amountMinor;
      return transaction.accountId === accountId ? balance + effect : balance;
    }
    if (transaction.kind === "TRANSFER") {
      if (transaction.accountId === accountId) return balance - transaction.amountMinor;
      if (transaction.transferAccountId === accountId) return balance + transaction.amountMinor;
    }
    return balance;
  }, account.openingBalanceMinor);
}

test("expense correction preserves the original, appends its inverse, carries metadata, and reports only replacement truth", async () => {
  const { cash, correct, expense, income, records, transfer } = await fixture();
  const originalFinancial = { ...records.transactions.get(expense.id)! };

  const result = await correct(expense.id, "EXPENSE", { amountMinor: "10000" }, { reason: "Incorrect amount" });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const { originalTransaction, replacementTransaction, reversalTransaction } = result.correction;
  assert.equal(originalTransaction.id, expense.id);
  assert.equal(reversalTransaction.reversalOfTransactionId, expense.id);
  assert.equal(reversalTransaction.amountMinor, "100000");
  assert.equal(replacementTransaction.amountMinor, "10000");
  assert.equal(replacementTransaction.accountId, cash.id);
  assert.equal(replacementTransaction.categoryId, expense.categoryId);
  assert.equal(replacementTransaction.merchantId, expense.merchantId);
  assert.equal(replacementTransaction.occurredAt, expense.occurredAt.toISOString());
  assert.equal(replacementTransaction.note, "Weekly food");
  assert.equal(records.transactions.get(expense.id)?.amountMinor, originalFinancial.amountMinor);
  assert.equal(records.transactions.get(expense.id)?.accountId, originalFinancial.accountId);
  assert.equal(records.transactions.size, 5);
  assert.equal(accountBalance(records, cash.id), 1_015_000n);
  assert.deepEqual(calculateIncomeAndSpendingTotals([...records.transactions.values()], "XAF"), {
    incomeMinor: 50_000n,
    spendingMinor: 10_000n,
  });
  const originalDateRecords = [...records.transactions.values()].filter(
    (transaction) => transaction.occurredAt.getTime() === expense.occurredAt.getTime(),
  );
  assert.deepEqual(calculateIncomeAndSpendingTotals(originalDateRecords, "XAF"), {
    incomeMinor: 0n,
    spendingMinor: 10_000n,
  });
  assert.deepEqual(
    currentMoneyTransactions([...records.transactions.values()]).map((transaction) => transaction.id).sort(),
    [income.id, transfer.id, replacementTransaction.id].sort(),
  );
  const audits = await records.listTransactionAudit(workspaceOne, expense.id);
  assert.equal(audits.at(-1)?.action, "CORRECT");
  assert.equal(audits.at(-1)?.metadata.reason, "Incorrect amount");
});

test("expense and income account/amount correction move only the corrected current impact", async () => {
  const { cash, correct, expense, income, mobile, records } = await fixture();

  const expenseResult = await correct(expense.id, "EXPENSE", { amountMinor: "10000", accountId: mobile.id });
  const incomeResult = await correct(income.id, "INCOME", { amountMinor: "70000", accountId: mobile.id });
  assert.equal(expenseResult.ok, true);
  assert.equal(incomeResult.ok, true);
  if (!expenseResult.ok || !incomeResult.ok) return;

  assert.equal(accountBalance(records, cash.id), 1_000_000n - 25_000n);
  assert.equal(accountBalance(records, mobile.id), 50_000n - 10_000n + 70_000n);
  assert.deepEqual(calculateIncomeAndSpendingTotals([...records.transactions.values()], "XAF"), {
    incomeMinor: 70_000n,
    spendingMinor: 10_000n,
  });
  assert.equal(expenseResult.correction.replacementTransaction.accountId, mobile.id);
  assert.equal(incomeResult.correction.replacementTransaction.accountId, mobile.id);
});

test("mixed financial and final metadata changes create one authoritative replacement", async () => {
  const { correct, expense, household, income, mobile, records } = await fixture();

  const expenseResult = await correct(expense.id, "EXPENSE", {
    amountMinor: "10000",
    accountId: mobile.id,
  }, {
    details: {
      merchant: "Corrected purchase",
      categoryId: household.id,
      occurredAt: { date: "2026-09-05", time: "10:15" },
      note: "Corrected note",
    },
    reason: "Receipt OCR issue",
  });
  assert.equal(expenseResult.ok, true);
  if (!expenseResult.ok) return;

  const expenseReplacement = expenseResult.correction.replacementTransaction;
  assert.equal(expenseReplacement.amountMinor, "10000");
  assert.equal(expenseReplacement.accountId, mobile.id);
  assert.equal(expenseReplacement.categoryId, household.id);
  assert.equal(expenseReplacement.occurredAt, "2026-09-05T09:15:00.000Z");
  assert.equal(expenseReplacement.note, "Corrected note");
  assert.notEqual(expenseReplacement.merchantId, expense.merchantId);
  assert.equal(records.merchants.get(expenseReplacement.merchantId!)?.name, "Corrected purchase");
  assert.equal(records.transactions.get(expense.id)?.note, "Weekly food");
  assert.equal(records.transactions.size, 5);

  const incomeResult = await correct(income.id, "INCOME", { accountId: mobile.id }, {
    details: { source: "Corrected client", note: "Corrected invoice" },
  });
  assert.equal(incomeResult.ok, true);
  if (!incomeResult.ok) return;

  const incomeReplacement = incomeResult.correction.replacementTransaction;
  assert.equal(incomeReplacement.accountId, mobile.id);
  assert.equal(incomeReplacement.categoryId, income.categoryId);
  assert.equal(incomeReplacement.note, "Corrected invoice");
  assert.equal(records.merchants.get(incomeReplacement.merchantId!)?.name, "Corrected client");

  const audit = await records.listTransactionAudit(workspaceOne, expense.id);
  assert.equal(audit.at(-1)?.metadata.reason, "Receipt OCR issue");
  assert.ok("categoryId" in ((audit.at(-1)?.metadata.changes ?? {}) as object));
  assert.ok("note" in ((audit.at(-1)?.metadata.changes ?? {}) as object));
});

test("transfer correction reverses both one-row legs and replacement remains a transfer outside spend/income KPIs", async () => {
  const { cash, correct, mobile, records, savings, transfer } = await fixture();
  const result = await correct(transfer.id, "TRANSFER", {
    amountMinor: "5000",
    fromAccountId: mobile.id,
    toAccountId: savings.id,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.correction.reversalTransaction.accountId, savings.id);
  assert.equal(result.correction.reversalTransaction.transferAccountId, cash.id);
  assert.equal(result.correction.replacementTransaction.accountId, mobile.id);
  assert.equal(result.correction.replacementTransaction.transferAccountId, savings.id);
  assert.notEqual(
    result.correction.reversalTransaction.accountId,
    result.correction.reversalTransaction.transferAccountId,
  );
  assert.equal(accountBalance(records, cash.id), 950_000n);
  assert.equal(accountBalance(records, savings.id), 205_000n);
  assert.equal(accountBalance(records, mobile.id), 45_000n);
  assert.deepEqual(calculateIncomeAndSpendingTotals([...records.transactions.values()], "XAF"), {
    incomeMinor: 50_000n,
    spendingMinor: 100_000n,
  });
});

test("correction validates current type-aware invariants, workspace ownership, versions, and authorization", async () => {
  const { correct, euro, expense, foreignCash, ledger, records, savings, transfer } = await fixture();
  const expected = records.transactions.get(expense.id)!.updatedAt.toISOString();

  assert.deepEqual(await correct(expense.id, "EXPENSE", { amountMinor: "0" }), { ok: false, code: "INVALID_AMOUNT" });
  assert.deepEqual(await correct(expense.id, "INCOME", { amountMinor: "10" }), {
    ok: false, code: "TRANSACTION_CORRECTION_NOT_ALLOWED",
  });
  assert.deepEqual(await correctTransactionForActor(owner, {
    workspaceId: workspaceOne,
    transactionId: expense.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: "10" },
    idempotencyKey: randomUUID(),
    // Currency/type are not correction fields; strict parsing locks them in V1.
    currency: "USD",
  }, { ledger }), { ok: false, code: "INVALID_CORRECTION" });
  assert.deepEqual(await correct(expense.id, "EXPENSE", { accountId: foreignCash.id }), {
    ok: false, code: "ACCOUNT_WORKSPACE_MISMATCH",
  });
  assert.deepEqual(await correct(transfer.id, "TRANSFER", { fromAccountId: savings.id, toAccountId: savings.id }), {
    ok: false, code: "SAME_TRANSFER_ACCOUNT",
  });
  assert.deepEqual(await correct(transfer.id, "TRANSFER", { toAccountId: euro.id }), {
    ok: false, code: "CROSS_CURRENCY_TRANSFER_UNSUPPORTED",
  });
  assert.deepEqual(await correct(transfer.id, "TRANSFER", { amountMinor: "1" }, {
    details: { merchant: "Not allowed on transfers" },
  }), { ok: false, code: "INVALID_CORRECTION" });
  assert.deepEqual(await correct(expense.id, "EXPENSE", { amountMinor: "1" }, {
    actor: viewer,
  }), { ok: false, code: "WORKSPACE_FORBIDDEN" });
  records.transactions.set(expense.id, { ...records.transactions.get(expense.id)!, updatedAt: new Date("2026-09-09T00:00:00.000Z") });
  assert.deepEqual(await correct(expense.id, "EXPENSE", { amountMinor: "1" }, {
    expectedUpdatedAt: expected,
  }), { ok: false, code: "CONCURRENT_MODIFICATION" });
});

test("idempotency returns one correction, and chains make only the terminal replacement current", async () => {
  const { correct, expense, ledger, records } = await fixture();
  const idempotencyKey = "b0000000-0000-4000-8000-000000000901";
  const [first, retry] = await Promise.all([
    correct(expense.id, "EXPENSE", { amountMinor: "9000" }, { idempotencyKey }),
    correct(expense.id, "EXPENSE", { amountMinor: "9000" }, { idempotencyKey }),
  ]);
  assert.equal(first.ok, true);
  assert.equal(retry.ok, true);
  if (!first.ok || !retry.ok) return;
  assert.equal(first.correction.id, retry.correction.id);
  assert.equal(records.transactionCorrections.size, 1);
  assert.deepEqual(await correct(expense.id, "EXPENSE", { amountMinor: "9000" }, {
    idempotencyKey,
    details: { note: "A different correction intent" },
  }), { ok: false, code: "CORRECTION_ALREADY_PROCESSED" });
  assert.deepEqual(await correct(expense.id, "EXPENSE", { amountMinor: "8000" }), {
    ok: false,
    code: "TRANSACTION_NOT_CURRENT",
  });

  const second = await correct(first.correction.replacementTransaction.id, "EXPENSE", { amountMinor: "7000" });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(records.transactionCorrections.size, 2);
  const current = await ledger.getCurrentEffectiveTransaction(owner, workspaceOne, expense.id);
  assert.equal(current.id, second.correction.replacementTransaction.id);
  const currentFromReversal = await ledger.getCurrentEffectiveTransaction(
    owner,
    workspaceOne,
    first.correction.reversalTransaction.id,
  );
  assert.equal(currentFromReversal.id, second.correction.replacementTransaction.id);
  assert.deepEqual(calculateIncomeAndSpendingTotals([...records.transactions.values()], "XAF"), {
    incomeMinor: 50_000n,
    spendingMinor: 7_000n,
  });
});

test("staged persistence failures never leave a reversal, replacement, link, or audit behind", async () => {
  for (const stage of ["reversal", "replacement", "linkage"] as const) {
    const { correct, expense, records } = await fixture();
    const transactionCount = records.transactions.size;
    records.failCorrectionStage = stage;
    assert.deepEqual(await correct(expense.id, "EXPENSE", { amountMinor: "10000" }), {
      ok: false,
      code: "TRANSACTION_CORRECTION_FAILED",
    }, stage);
    assert.equal(records.transactions.size, transactionCount, stage);
    assert.equal(records.transactionCorrections.size, 0, stage);
    assert.equal(records.transactionAudits.size, 0, stage);
  }
});
