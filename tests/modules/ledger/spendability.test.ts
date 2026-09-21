import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { AuthenticatedActor } from "@/authorization/session";
import { toCurrencyCode } from "@/money/currency";
import { createExpenseForActor } from "@/modules/ledger/create-expense";
import { createTransferForActor } from "@/modules/ledger/create-transfer";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { getAccountSpendability } from "@/modules/ledger/spendability-policy";

import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const workspaceId = "workspace-one";
const occurredAt = new Date("2026-09-20T10:00:00.000Z");

async function fixture() {
  const records = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(records, workspaces);
  const now = new Date("2026-09-20T00:00:00.000Z");
  workspaces.workspaces.set(workspaceId, {
    id: workspaceId,
    name: "One",
    slug: "one",
    type: "CUSTOM",
    createdByUserId: owner.userId,
    createdAt: now,
    updatedAt: now,
  });
  workspaces.preferences.set(workspaceId, {
    workspaceId,
    currency: "XAF",
    locale: "en-US",
    timezone: "Africa/Douala",
    weekStartsOn: 1,
    createdAt: now,
    updatedAt: now,
  });
  workspaces.addMembership({ workspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now });
  return { ledger, records, workspaces };
}

async function account(
  ledger: LedgerService,
  input: { name: string; type?: "CASH" | "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "MOBILE_MONEY" | "OTHER"; opening?: bigint },
) {
  return ledger.createAccount(owner, workspaceId, {
    name: input.name,
    type: input.type ?? "CASH",
    currency: "XAF",
    openingBalanceMinor: input.opening ?? 0n,
  });
}

function expenseCommand(accountId: string, amount: string, idempotencyKey = randomUUID()) {
  return {
    workspaceId,
    idempotencyKey,
    accountId,
    categoryId: SYSTEM_GROCERIES_ID,
    merchant: "Market",
    amount,
    currency: "XAF",
    date: "2026-09-20",
  };
}

function transferCommand(fromAccountId: string, toAccountId: string, amount: string, idempotencyKey = randomUUID()) {
  return {
    workspaceId,
    idempotencyKey,
    fromAccountId,
    toAccountId,
    amount,
    currency: "XAF",
    date: "2026-09-20",
  };
}

async function historicalExpense(ledger: LedgerService, accountId: string, amountMinor: bigint) {
  return ledger.createTransaction(owner, workspaceId, {
    kind: "EXPENSE",
    status: "POSTED",
    accountId,
    categoryId: SYSTEM_GROCERIES_ID,
    amountMinor,
    currency: "XAF",
    occurredAt,
    source: { provider: "historical-test" },
  });
}

test("funded account types use a zero floor; credit and other remain explicitly unsupported", () => {
  for (const accountType of ["CASH", "CHECKING", "SAVINGS", "MOBILE_MONEY"] as const) {
    const result = getAccountSpendability({
      accountId: "account-1",
      accountType,
      currency: toCurrencyCode("XAF"),
      currentBalanceMinor: 1_500n,
      requestedDebitMinor: 1_500n,
    });
    assert.equal(result.mode, "ZERO_FLOOR");
    assert.equal(result.canDebit, true);
    assert.equal(result.projectedBalanceMinor, 0n);
  }
  for (const accountType of ["CREDIT_CARD", "OTHER"] as const) {
    const result = getAccountSpendability({
      accountId: "account-1",
      accountType,
      currency: toCurrencyCode("XAF"),
      currentBalanceMinor: 1_500n,
      requestedDebitMinor: 1n,
    });
    assert.equal(result.mode, "UNSUPPORTED");
    assert.equal(result.reason, "ACCOUNT_SPENDABILITY_UNSUPPORTED");
  }
});

test("expense permits equality, rejects overspend without a record, and exposes available balance", async () => {
  const { ledger, records, workspaces } = await fixture();
  const cash = await account(ledger, { name: "Cash", opening: 1_500n });
  const equality = await createExpenseForActor(owner, expenseCommand(cash.id, "1500"), { ledger, workspaces });
  assert.equal(equality.ok, true);
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId, accountId: cash.id })).currentBalanceMinor, 0n);

  const rejected = await createExpenseForActor(owner, expenseCommand(cash.id, "1"), { ledger, workspaces });
  assert.equal(rejected.ok, false);
  if (rejected.ok) return;
  assert.equal(rejected.code, "INSUFFICIENT_FUNDS");
  assert.deepEqual(rejected.details, {
    accountId: cash.id,
    currency: "XAF",
    availableBalanceMinor: "0",
    requiredAmountMinor: "1",
  });
  assert.equal(records.transactions.size, 1);
  const balance = await ledger.getAccountBalance(owner, { workspaceId, accountId: cash.id });
  assert.equal(balance.availableBalanceMinor, 0n);
  assert.equal(balance.spendabilityMode, "ZERO_FLOOR");
});

test("transfer debits only a spendable source and leaves both accounts untouched on rejection", async () => {
  const { ledger, records, workspaces } = await fixture();
  const from = await account(ledger, { name: "From", opening: 1_500n });
  const to = await account(ledger, { name: "To", opening: 500n });
  const rejected = await createTransferForActor(owner, transferCommand(from.id, to.id, "1600"), { ledger, workspaces });
  assert.equal(rejected.ok, false);
  if (rejected.ok) return;
  assert.equal(rejected.code, "INSUFFICIENT_FUNDS");
  assert.deepEqual(rejected.details, {
    accountId: from.id,
    currency: "XAF",
    availableBalanceMinor: "1500",
    requiredAmountMinor: "1600",
  });
  assert.equal(records.transactions.size, 0);
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId, accountId: from.id })).currentBalanceMinor, 1_500n);
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId, accountId: to.id })).currentBalanceMinor, 500n);
});

test("correction evaluates the replacement after its reversal and rolls back an unaffordable replacement", async () => {
  const { ledger } = await fixture();
  const cash = await account(ledger, { name: "Cash", opening: 1_500n });
  const original = await historicalExpense(ledger, cash.id, 100n);

  const permitted = await ledger.correctTransaction(owner, {
    workspaceId,
    transactionId: original.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: 1_300n },
    idempotencyKey: randomUUID(),
  });
  assert.equal(permitted.replacementTransaction.amountMinor, 1_300n);
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId, accountId: cash.id })).currentBalanceMinor, 200n);

  const next = await historicalExpense(ledger, cash.id, 100n);
  await assert.rejects(
    ledger.correctTransaction(owner, {
      workspaceId,
      transactionId: next.id,
      kind: "EXPENSE",
      financialChanges: { amountMinor: 1_600n },
      idempotencyKey: randomUUID(),
    }),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "INSUFFICIENT_FUNDS"),
  );
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId, accountId: cash.id })).currentBalanceMinor, 100n);
  const persistedOriginal = await ledger.getCurrentEffectiveTransaction(owner, workspaceId, next.id);
  assert.equal(persistedOriginal.id, next.id);
});

test("account and transfer corrections validate the replacement debit account", async () => {
  const { ledger } = await fixture();
  const a = await account(ledger, { name: "A", opening: 1_000n });
  const b = await account(ledger, { name: "B", opening: 0n });
  const c = await account(ledger, { name: "C", opening: 0n });
  const expense = await historicalExpense(ledger, a.id, 500n);
  await assert.rejects(
    ledger.correctTransaction(owner, {
      workspaceId,
      transactionId: expense.id,
      kind: "EXPENSE",
      financialChanges: { accountId: b.id },
      idempotencyKey: randomUUID(),
    }),
    /enough available funds/,
  );

  const transfer = await ledger.createTransaction(owner, workspaceId, {
    kind: "TRANSFER",
    status: "POSTED",
    accountId: a.id,
    transferAccountId: b.id,
    amountMinor: 500n,
    currency: "XAF",
    occurredAt,
    source: { provider: "historical-test" },
  });
  await assert.rejects(
    ledger.correctTransaction(owner, {
      workspaceId,
      transactionId: transfer.id,
      kind: "TRANSFER",
      financialChanges: { fromAccountId: c.id, amountMinor: 900n },
      idempotencyKey: randomUUID(),
    }),
    /enough available funds/,
  );
});

test("manual reversal preserves historical truth even when reversing income creates a negative balance", async () => {
  const { ledger } = await fixture();
  const cash = await account(ledger, { name: "Cash" });
  const income = await ledger.createTransaction(owner, workspaceId, {
    kind: "INCOME",
    status: "POSTED",
    accountId: cash.id,
    amountMinor: 100n,
    currency: "XAF",
    occurredAt,
    source: { provider: "historical-test" },
  });
  await ledger.createTransaction(owner, workspaceId, {
    kind: "EXPENSE",
    status: "POSTED",
    accountId: cash.id,
    categoryId: SYSTEM_GROCERIES_ID,
    amountMinor: 100n,
    currency: "XAF",
    occurredAt,
    source: { provider: "historical-test" },
  });
  await ledger.reverseTransaction(owner, { workspaceId, transactionId: income.id, idempotencyKey: randomUUID() });
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId, accountId: cash.id })).currentBalanceMinor, -100n);
});

test("concurrent expenses share one atomic debit guard and an idempotent retry spends once", async () => {
  const { ledger, records, workspaces } = await fixture();
  const cash = await account(ledger, { name: "Cash", opening: 1_500n });
  const [first, second] = await Promise.all([
    createExpenseForActor(owner, expenseCommand(cash.id, "1000"), { ledger, workspaces }),
    createExpenseForActor(owner, expenseCommand(cash.id, "1000"), { ledger, workspaces }),
  ]);
  assert.equal([first, second].filter((result) => result.ok).length, 1);
  assert.equal([first, second].filter((result) => !result.ok && result.code === "INSUFFICIENT_FUNDS").length, 1);
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId, accountId: cash.id })).currentBalanceMinor, 500n);

  const key = randomUUID();
  const retryCommand = expenseCommand(cash.id, "500", key);
  const accepted = await createExpenseForActor(owner, retryCommand, { ledger, workspaces });
  const replay = await createExpenseForActor(owner, retryCommand, { ledger, workspaces });
  assert.equal(accepted.ok, true);
  assert.equal(replay.ok, true);
  if (!accepted.ok || !replay.ok) return;
  assert.equal(accepted.expense.id, replay.expense.id);
  assert.equal(records.transactions.size, 2);
});

test("concurrent transfers cannot overspend their shared source account", async () => {
  const { ledger, records, workspaces } = await fixture();
  const from = await account(ledger, { name: "From", opening: 1_500n });
  const to = await account(ledger, { name: "To" });
  const [first, second] = await Promise.all([
    createTransferForActor(owner, transferCommand(from.id, to.id, "1000"), { ledger, workspaces }),
    createTransferForActor(owner, transferCommand(from.id, to.id, "1000"), { ledger, workspaces }),
  ]);
  assert.equal([first, second].filter((result) => result.ok).length, 1);
  assert.equal([first, second].filter((result) => !result.ok && result.code === "INSUFFICIENT_FUNDS").length, 1);
  assert.equal(records.transactions.size, 1);
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId, accountId: from.id })).currentBalanceMinor, 500n);
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId, accountId: to.id })).currentBalanceMinor, 1_000n);
});

test("a correction and a new expense cannot bypass the same debit guard", async () => {
  const { ledger, workspaces } = await fixture();
  const cash = await account(ledger, { name: "Cash", opening: 1_500n });
  const original = await historicalExpense(ledger, cash.id, 100n);
  const correction = ledger.correctTransaction(owner, {
    workspaceId,
    transactionId: original.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: 1_300n },
    idempotencyKey: randomUUID(),
  }).then(
    () => ({ ok: true }),
    (error: unknown) => ({ ok: false, code: error && typeof error === "object" && "code" in error ? error.code : null }),
  );
  const expense = createExpenseForActor(owner, expenseCommand(cash.id, "500"), { ledger, workspaces });
  const [correctionResult, expenseResult] = await Promise.all([correction, expense]);
  assert.equal(Number(correctionResult.ok) + Number(expenseResult.ok), 1);
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId, accountId: cash.id })).currentBalanceMinor >= 0n, true);
});

test("new debits on an already-negative funded account and unsupported credit semantics are rejected", async () => {
  const { ledger, workspaces } = await fixture();
  const legacy = await account(ledger, { name: "Legacy", opening: -500n });
  const legacyResult = await createExpenseForActor(owner, expenseCommand(legacy.id, "1"), { ledger, workspaces });
  assert.equal(legacyResult.ok, false);
  if (legacyResult.ok) return;
  assert.equal(legacyResult.code, "INSUFFICIENT_FUNDS");
  assert.equal(legacyResult.details?.availableBalanceMinor, "-500");
  const card = await account(ledger, { name: "Card", type: "CREDIT_CARD", opening: 0n });
  assert.deepEqual(
    await createExpenseForActor(owner, expenseCommand(card.id, "1"), { ledger, workspaces }),
    { ok: false, code: "ACCOUNT_SPENDABILITY_UNSUPPORTED" },
  );
});
