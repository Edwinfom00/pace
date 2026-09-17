import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { AuthenticatedActor } from "@/authorization/session";
import { createExpenseForActor } from "@/modules/ledger/create-expense";
import {
  createIncomeForActor,
  parseIncomeAmount,
  resolveIncomeOccurredAt,
} from "@/modules/ledger/create-income";
import { LedgerService } from "@/modules/ledger/ledger-service";

import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_OTHER_INCOME_ID,
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

  const account = await ledger.createAccount(owner, workspaceOne, {
    name: "Daily cash",
    type: "CASH",
    currency: "XAF",
    openingBalanceMinor: "70000",
  });
  const foreignAccount = await ledger.createAccount(owner, workspaceTwo, {
    name: "Outside cash",
    type: "CASH",
    currency: "XAF",
  });
  const foreignIncomeCategory = await ledger.createCategory(owner, workspaceTwo, {
    name: "Outside income",
    kind: "INCOME",
  });

  const dependencies = { ledger, workspaces };
  const command = (overrides: Record<string, unknown> = {}) => ({
    workspaceId: workspaceOne,
    idempotencyKey: randomUUID(),
    accountId: account.id,
    amount: "24,850",
    currency: "XAF",
    date: "2024-02-01",
    time: "09:30",
    ...overrides,
  });

  return { account, command, dependencies, foreignAccount, foreignIncomeCategory, ledger, records, workspaces };
}

test("the canonical Income command writes a posted INCOME with exact minor units", async () => {
  const { account, command, dependencies, records } = await fixture();

  const result = await createIncomeForActor(owner, command({
    categoryId: SYSTEM_SALARY_ID,
    source: "  Acme   GmbH ",
    note: "September payroll",
  }), dependencies);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.income, {
    id: result.income.id,
    type: "INCOME",
    amountMinor: "24850",
    currency: "XAF",
    accountId: account.id,
    categoryId: SYSTEM_SALARY_ID,
    merchantId: result.income.merchantId,
    occurredAt: "2024-02-01T08:30:00.000Z",
    note: "September payroll",
    status: "POSTED",
  });
  assert.ok(result.income.merchantId);

  const persisted = records.transactions.get(result.income.id);
  assert.equal(persisted?.kind, "INCOME");
  assert.equal(persisted?.workspaceId, workspaceOne);
  assert.equal(persisted?.createdByUserId, owner.userId);
  assert.ok(persisted?.createdAt instanceof Date);
  assert.equal(persisted?.amountMinor, 24_850n);
  assert.match(persisted?.deduplicationFingerprint ?? "", /^manual:[a-f0-9]{64}$/);
  assert.equal(persisted?.source.provider, "manual");
  assert.equal(persisted?.source.origin, "MANUAL");
  assert.match(String(persisted?.source.commandFingerprint), /^[a-f0-9]{64}$/);
  // The UI's source text uses the existing normalized merchant/counterparty relation.
  assert.equal(records.merchants.get(result.income.merchantId ?? "")?.normalizedName, "acme gmbh");
  // M2 balances are ledger-derived; this command does not mutate an account balance.
  assert.equal(records.accounts.get(account.id)?.openingBalanceMinor, 70_000n);
});

test("the Income command authenticates, authorizes the workspace, and rejects foreign or unavailable accounts", async () => {
  const { account, command, dependencies, foreignAccount, records } = await fixture();

  assert.deepEqual(await createIncomeForActor(null, command(), dependencies), { ok: false, code: "UNAUTHENTICATED" });
  assert.deepEqual(await createIncomeForActor(viewer, command(), dependencies), { ok: false, code: "WORKSPACE_FORBIDDEN" });
  assert.deepEqual(
    await createIncomeForActor(owner, command({ workspaceId: "unknown-workspace" }), dependencies),
    { ok: false, code: "WORKSPACE_FORBIDDEN" },
  );
  assert.deepEqual(
    await createIncomeForActor(owner, command({ accountId: foreignAccount.id }), dependencies),
    { ok: false, code: "ACCOUNT_NOT_FOUND" },
  );
  assert.deepEqual(
    await createIncomeForActor(owner, command({ accountId: "00000000-0000-4000-8000-000000000099" }), dependencies),
    { ok: false, code: "ACCOUNT_NOT_FOUND" },
  );

  records.accounts.set(account.id, { ...account, archivedAt: new Date("2026-09-01T00:00:00.000Z") });
  assert.deepEqual(
    await createIncomeForActor(owner, command(), dependencies),
    { ok: false, code: "ACCOUNT_UNAVAILABLE" },
  );
});

test("Income money stays exact, positive, canonical, and in the receiving account currency", async () => {
  const { command, dependencies } = await fixture();

  assert.equal(parseIncomeAmount("24.50", "USD")?.minor, 2_450n);
  assert.equal(parseIncomeAmount("24,850", "XAF")?.minor, 24_850n);
  assert.equal(parseIncomeAmount("0.1", "USD")?.minor, 10n);
  assert.equal(parseIncomeAmount("24.5010", "USD"), null);

  for (const amount of ["0", "-1", "twelve", "24,85,0"]) {
    assert.deepEqual(
      await createIncomeForActor(owner, command({ amount }), dependencies),
      { ok: false, code: "INVALID_AMOUNT" },
    );
  }
  assert.deepEqual(
    await createIncomeForActor(owner, command({ currency: "ZZZ" }), dependencies),
    { ok: false, code: "INVALID_CURRENCY" },
  );
  assert.deepEqual(
    await createIncomeForActor(owner, command({ currency: "USD" }), dependencies),
    { ok: false, code: "CURRENCY_MISMATCH" },
  );
});

test("Income categories remain optional but, when supplied, must be allowed INCOME categories", async () => {
  const { command, dependencies, foreignIncomeCategory, ledger } = await fixture();

  const uncategorized = await createIncomeForActor(owner, command({ categoryId: undefined }), dependencies);
  assert.equal(uncategorized.ok, true);
  if (uncategorized.ok) assert.equal(uncategorized.income.categoryId, null);

  const categorized = await createIncomeForActor(owner, command({ categoryId: SYSTEM_OTHER_INCOME_ID }), dependencies);
  assert.equal(categorized.ok, true);
  assert.deepEqual(
    await createIncomeForActor(owner, command({ categoryId: SYSTEM_GROCERIES_ID }), dependencies),
    { ok: false, code: "CATEGORY_NOT_ALLOWED" },
  );
  assert.deepEqual(
    await createIncomeForActor(owner, command({ categoryId: foreignIncomeCategory.id }), dependencies),
    { ok: false, code: "CATEGORY_NOT_ALLOWED" },
  );

  const customIncome = await ledger.createCategory(owner, workspaceOne, { name: "Freelance", kind: "INCOME" });
  const customCategoryResult = await createIncomeForActor(owner, command({ categoryId: customIncome.id }), dependencies);
  assert.equal(customCategoryResult.ok, true);
});

test("Income source and civil timestamps use the shared counterparty and date-time conventions", async () => {
  const { command, dependencies, records } = await fixture();

  const withoutSource = await createIncomeForActor(owner, command({ source: undefined }), dependencies);
  assert.equal(withoutSource.ok, true);
  if (withoutSource.ok) assert.equal(withoutSource.income.merchantId, null);

  const sourced = await createIncomeForActor(owner, command({ source: "Client A" }), dependencies);
  assert.equal(sourced.ok, true);
  if (sourced.ok) assert.equal(records.merchants.get(sourced.income.merchantId ?? "")?.normalizedName, "client a");

  assert.equal(
    resolveIncomeOccurredAt("2026-09-17", "08:30", "America/New_York").toISOString(),
    "2026-09-17T12:30:00.000Z",
  );
  assert.equal(
    resolveIncomeOccurredAt("2026-09-17", null, "Africa/Douala").toISOString(),
    "2026-09-17T11:00:00.000Z",
  );
  assert.deepEqual(
    await createIncomeForActor(owner, command({ date: "2024-02-30" }), dependencies),
    { ok: false, code: "INVALID_OCCURRED_AT" },
  );
  assert.deepEqual(
    await createIncomeForActor(owner, command({ time: "25:00" }), dependencies),
    { ok: false, code: "INVALID_OCCURRED_AT" },
  );
});

test("Income writes are atomic and do not alter the established Expense command", async () => {
  const { command, dependencies, records } = await fixture();
  const merchantCount = records.merchants.size;
  const transactionCount = records.transactions.size;
  records.createTransactionWithMerchant = async () => {
    throw new Error("database write failed");
  };

  assert.deepEqual(
    await createIncomeForActor(owner, command({ source: "Atomic income source" }), dependencies),
    { ok: false, code: "TRANSACTION_CREATE_FAILED" },
  );
  assert.equal(records.merchants.size, merchantCount);
  assert.equal(records.transactions.size, transactionCount);

  // Reset only the failing repository method before asserting Expense behavior.
  records.createTransactionWithMerchant = InMemoryLedgerRepository.prototype.createTransactionWithMerchant;
  const expense = await createExpenseForActor(owner, command({ merchant: "Corner shop" }), dependencies);
  assert.equal(expense.ok, true);
  if (expense.ok) assert.equal(records.transactions.get(expense.expense.id)?.kind, "EXPENSE");
});

test("Income retries with one key return one persisted operation", async () => {
  const { command, dependencies, records } = await fixture();
  const input = command({
    idempotencyKey: "b0000000-0000-4000-8000-000000000003",
    categoryId: SYSTEM_SALARY_ID,
  });

  const [first, second] = await Promise.all([
    createIncomeForActor(owner, input, dependencies),
    createIncomeForActor(owner, input, dependencies),
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.income.id, second.income.id);
  assert.equal(records.transactions.size, 1);
});
