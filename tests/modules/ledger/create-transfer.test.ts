import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import type { AuthenticatedActor } from "@/authorization/session";
import { createExpenseForActor } from "@/modules/ledger/create-expense";
import { createIncomeForActor } from "@/modules/ledger/create-income";
import {
  createTransferForActor,
  parseTransferAmount,
  resolveTransferOccurredAt,
} from "@/modules/ledger/create-transfer";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { calculateIncomeAndSpendingTotals } from "@/modules/ledger/totals";
import { DEFAULT_TRANSACTION_FILTER_STATE } from "@/modules/transactions/domain/transaction-list-url";
import { getTransactionsPage } from "@/modules/transactions/queries/get-transactions-page";

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

  for (const [id, name, timezone] of [
    [workspaceOne, "One", "Africa/Douala"],
    [workspaceTwo, "Two", "America/New_York"],
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
      currency: "XAF",
      locale: "en-US",
      timezone,
      weekStartsOn: 1,
      createdAt: now,
      updatedAt: now,
    });
    workspaces.addMembership({ workspaceId: id, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now });
  }
  workspaces.addMembership({ workspaceId: workspaceOne, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: now });

  const fromAccount = await ledger.createAccount(owner, workspaceOne, {
    name: "Cash",
    type: "CASH",
    currency: "XAF",
    openingBalanceMinor: "50000",
  });
  const toAccount = await ledger.createAccount(owner, workspaceOne, {
    name: "Savings",
    type: "SAVINGS",
    currency: "XAF",
    openingBalanceMinor: "200",
  });
  const euroAccount = await ledger.createAccount(owner, workspaceOne, {
    name: "Euro reserve",
    type: "SAVINGS",
    currency: "EUR",
  });
  const foreignAccount = await ledger.createAccount(owner, workspaceTwo, {
    name: "Outside cash",
    type: "CASH",
    currency: "XAF",
  });

  const dependencies = { ledger, workspaces };
  const command = (overrides: Record<string, unknown> = {}) => ({
    workspaceId: workspaceOne,
    idempotencyKey: randomUUID(),
    fromAccountId: fromAccount.id,
    toAccountId: toAccount.id,
    amount: "24,850",
    currency: "XAF",
    date: "2024-02-01",
    time: "09:30",
    ...overrides,
  });

  return {
    command,
    dependencies,
    euroAccount,
    foreignAccount,
    fromAccount,
    records,
    toAccount,
    workspaces,
  };
}

test("the canonical Transfer command persists M2's single grouped transfer with exact minor units", async () => {
  const { command, dependencies, fromAccount, records, toAccount } = await fixture();

  const result = await createTransferForActor(owner, command({ note: "Move cash to savings" }), dependencies);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.transfer, {
    id: result.transfer.id,
    type: "TRANSFER",
    transferGroupId: result.transfer.transferGroupId,
    fromAccountId: fromAccount.id,
    toAccountId: toAccount.id,
    amountMinor: "24850",
    currency: "XAF",
    occurredAt: "2024-02-01T08:30:00.000Z",
    note: "Move cash to savings",
    status: "POSTED",
  });
  assert.match(result.transfer.transferGroupId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  const persisted = records.transactions.get(result.transfer.id);
  assert.equal(persisted?.kind, "TRANSFER");
  assert.equal(persisted?.workspaceId, workspaceOne);
  assert.equal(persisted?.createdByUserId, owner.userId);
  assert.ok(persisted?.createdAt instanceof Date);
  assert.equal(persisted?.accountId, fromAccount.id);
  assert.equal(persisted?.transferAccountId, toAccount.id);
  assert.equal(persisted?.transferGroupId, result.transfer.transferGroupId);
  assert.equal(persisted?.amountMinor, 24_850n);
  assert.equal(persisted?.status, "POSTED");
  assert.equal(persisted?.categoryId, null);
  assert.equal(persisted?.merchantId, null);
  // Provenance records a manual financial intent without inventing an Income
  // source or a dummy transfer entity.
  assert.equal(persisted?.source.provider, "manual");
  assert.equal(persisted?.source.origin, "MANUAL");
  assert.match(String(persisted?.source.commandFingerprint), /^[a-f0-9]{64}$/);
  assert.match(persisted?.deduplicationFingerprint ?? "", /^manual:[a-f0-9]{64}$/);
  assert.equal(records.transactions.size, 1);

  // Balance stays ledger-derived; the canonical write never mutates opening balance.
  assert.equal(records.accounts.get(fromAccount.id)?.openingBalanceMinor, 50_000n);
  assert.equal(records.accounts.get(toAccount.id)?.openingBalanceMinor, 200n);
  assert.deepEqual(calculateIncomeAndSpendingTotals([...records.transactions.values()], "XAF"), {
    incomeMinor: 0n,
    spendingMinor: 0n,
  });
});

test("Transfer requires an authenticated workspace member with ledger permission and local accounts", async () => {
  const { command, dependencies, foreignAccount } = await fixture();

  assert.deepEqual(await createTransferForActor(null, command(), dependencies), { ok: false, code: "UNAUTHENTICATED" });
  assert.deepEqual(await createTransferForActor(viewer, command(), dependencies), { ok: false, code: "WORKSPACE_FORBIDDEN" });
  assert.deepEqual(
    await createTransferForActor(owner, command({ workspaceId: "unknown-workspace" }), dependencies),
    { ok: false, code: "WORKSPACE_FORBIDDEN" },
  );
  assert.deepEqual(
    await createTransferForActor(owner, command({ fromAccountId: "00000000-0000-4000-8000-000000000099" }), dependencies),
    { ok: false, code: "FROM_ACCOUNT_NOT_FOUND" },
  );
  assert.deepEqual(
    await createTransferForActor(owner, command({ toAccountId: "00000000-0000-4000-8000-000000000098" }), dependencies),
    { ok: false, code: "TO_ACCOUNT_NOT_FOUND" },
  );
  assert.deepEqual(
    await createTransferForActor(owner, command({ fromAccountId: foreignAccount.id }), dependencies),
    { ok: false, code: "FROM_ACCOUNT_NOT_FOUND" },
  );
  assert.deepEqual(
    await createTransferForActor(owner, command({ toAccountId: foreignAccount.id }), dependencies),
    { ok: false, code: "TO_ACCOUNT_NOT_FOUND" },
  );
});

test("Transfer enforces different, available source and destination accounts", async () => {
  const { command, dependencies, records, toAccount } = await fixture();

  assert.deepEqual(
    await createTransferForActor(owner, command({ toAccountId: command().fromAccountId }), dependencies),
    { ok: false, code: "SAME_TRANSFER_ACCOUNT" },
  );

  records.accounts.set(toAccount.id, { ...toAccount, archivedAt: new Date("2026-09-01T00:00:00.000Z") });
  assert.deepEqual(
    await createTransferForActor(owner, command(), dependencies),
    { ok: false, code: "ACCOUNT_UNAVAILABLE" },
  );
});

test("Transfer money remains exact and all same-currency rules are server-authoritative", async () => {
  const { command, dependencies, euroAccount } = await fixture();

  assert.equal(parseTransferAmount("24.50", "USD")?.minor, 2_450n);
  assert.equal(parseTransferAmount("24,850", "XAF")?.minor, 24_850n);
  assert.equal(parseTransferAmount("0.1", "USD")?.minor, 10n);
  assert.equal(parseTransferAmount("24.5010", "USD"), null);

  for (const amount of ["0", "-1", "twelve", "24,85,0"]) {
    assert.deepEqual(
      await createTransferForActor(owner, command({ amount }), dependencies),
      { ok: false, code: "INVALID_AMOUNT" },
    );
  }
  assert.deepEqual(
    await createTransferForActor(owner, command({ currency: "ZZZ" }), dependencies),
    { ok: false, code: "INVALID_CURRENCY" },
  );
  assert.deepEqual(
    await createTransferForActor(owner, command({ currency: "USD" }), dependencies),
    { ok: false, code: "CURRENCY_MISMATCH" },
  );
  assert.deepEqual(
    await createTransferForActor(owner, command({ toAccountId: euroAccount.id }), dependencies),
    { ok: false, code: "CROSS_CURRENCY_TRANSFER_UNSUPPORTED" },
  );
});

test("Transfer uses the shared civil date-time policy and no floating-point financial conversion", async () => {
  const { command, dependencies } = await fixture();

  assert.equal(
    resolveTransferOccurredAt("2026-09-17", "08:30", "America/New_York").toISOString(),
    "2026-09-17T12:30:00.000Z",
  );
  assert.equal(
    resolveTransferOccurredAt("2026-09-17", null, "Africa/Douala").toISOString(),
    "2026-09-17T11:00:00.000Z",
  );
  assert.deepEqual(
    await createTransferForActor(owner, command({ date: "2024-02-30" }), dependencies),
    { ok: false, code: "INVALID_OCCURRED_AT" },
  );
  assert.deepEqual(
    await createTransferForActor(owner, command({ time: "25:00" }), dependencies),
    { ok: false, code: "INVALID_OCCURRED_AT" },
  );

  const source = await readFile(resolve("src/modules/ledger/create-transfer.ts"), "utf8");
  assert.equal(source.includes("parseFloat"), false);
  assert.equal(source.includes("Number("), false);
});

test("a failed M2 transfer insert leaves no partial transfer because source and destination share one row", async () => {
  const { command, dependencies, records } = await fixture();
  const transactionCount = records.transactions.size;
  records.createTransactionWithSpendability = async () => {
    throw new Error("database write failed");
  };

  assert.deepEqual(
    await createTransferForActor(owner, command(), dependencies),
    { ok: false, code: "TRANSFER_CREATE_FAILED" },
  );
  assert.equal(records.transactions.size, transactionCount);
  assert.equal(
    [...records.transactions.values()].some((transaction) => transaction.kind === "EXPENSE" || transaction.kind === "INCOME"),
    false,
  );
});

test("Transfer retries with one key return one verified atomic transfer", async () => {
  const { command, dependencies, records } = await fixture();
  const input = command({ idempotencyKey: "b0000000-0000-4000-8000-000000000004" });

  const [first, second] = await Promise.all([
    createTransferForActor(owner, input, dependencies),
    createTransferForActor(owner, input, dependencies),
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.transfer.id, second.transfer.id);
  assert.equal(first.transfer.transferGroupId, second.transfer.transferGroupId);
  assert.equal(records.transactions.size, 1);
  assert.equal([...records.transactions.values()][0]?.kind, "TRANSFER");
});

test("manual Expense, Income, and Transfer reconcile into authoritative transactions and KPIs", async () => {
  const { command, dependencies, fromAccount, records, toAccount, workspaces } = await fixture();
  const expense = await createExpenseForActor(owner, {
    workspaceId: workspaceOne,
    idempotencyKey: "b0000000-0000-4000-8000-000000000011",
    accountId: fromAccount.id,
    categoryId: SYSTEM_GROCERIES_ID,
    amount: "20",
    currency: "XAF",
    date: "2024-02-01",
  }, dependencies);
  const income = await createIncomeForActor(owner, {
    workspaceId: workspaceOne,
    idempotencyKey: "b0000000-0000-4000-8000-000000000012",
    accountId: toAccount.id,
    categoryId: SYSTEM_SALARY_ID,
    amount: "50",
    currency: "XAF",
    date: "2024-02-01",
  }, dependencies);
  const transfer = await createTransferForActor(owner, command({
    idempotencyKey: "b0000000-0000-4000-8000-000000000013",
    amount: "10",
  }), dependencies);
  assert.equal(expense.ok, true);
  assert.equal(income.ok, true);
  assert.equal(transfer.ok, true);
  if (!expense.ok || !income.ok || !transfer.ok) return;

  const page = await getTransactionsPage({
    actor: owner,
    workspaceId: workspaceOne,
    filters: { ...DEFAULT_TRANSACTION_FILTER_STATE, page: 1, pageSize: 20 },
    timeZone: "Africa/Douala",
    unknownMerchantName: "Transaction",
  }, { ledger: records, workspaces });
  assert.deepEqual(new Set(page.items.map((item) => item.id)), new Set([
    expense.expense.id,
    income.income.id,
    transfer.transfer.id,
  ]));
  assert.deepEqual(
    calculateIncomeAndSpendingTotals([...records.transactions.values()], "XAF"),
    { incomeMinor: 50n, spendingMinor: 20n },
  );
  const persistedTransfer = records.transactions.get(transfer.transfer.id);
  assert.equal(persistedTransfer?.accountId, fromAccount.id);
  assert.equal(persistedTransfer?.transferAccountId, toAccount.id);
});
