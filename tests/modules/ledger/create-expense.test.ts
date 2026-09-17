import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { AuthenticatedActor } from "@/authorization/session";
import {
  createExpenseForActor,
  parseExpenseAmount,
  resolveOccurredAt,
} from "@/modules/ledger/create-expense";
import { LedgerService } from "@/modules/ledger/ledger-service";

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
  const foreignCategory = await ledger.createCategory(owner, workspaceTwo, {
    name: "Outside category",
    kind: "EXPENSE",
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

  return { account, command, dependencies, foreignAccount, foreignCategory, ledger, records, workspaces };
}

test("the canonical expense command writes a posted expense with exact minor units and no UI/agent lifecycle", async () => {
  const { account, command, dependencies, records } = await fixture();

  const result = await createExpenseForActor(owner, command({
    categoryId: SYSTEM_GROCERIES_ID,
    merchant: "  Fresh   Market ",
    note: "Weekly market run",
  }), dependencies);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.expense, {
    id: result.expense.id,
    type: "EXPENSE",
    amountMinor: "24850",
    currency: "XAF",
    accountId: account.id,
    categoryId: SYSTEM_GROCERIES_ID,
    merchantId: result.expense.merchantId,
    occurredAt: "2024-02-01T08:30:00.000Z",
    note: "Weekly market run",
    status: "POSTED",
  });
  assert.ok(result.expense.merchantId);

  const persisted = records.transactions.get(result.expense.id);
  assert.equal(persisted?.kind, "EXPENSE");
  assert.equal(persisted?.workspaceId, workspaceOne);
  assert.equal(persisted?.createdByUserId, owner.userId);
  assert.ok(persisted?.createdAt instanceof Date);
  assert.equal(persisted?.amountMinor, 24_850n);
  assert.match(persisted?.deduplicationFingerprint ?? "", /^manual:[a-f0-9]{64}$/);
  assert.equal(persisted?.source.provider, "manual");
  assert.equal(persisted?.source.origin, "MANUAL");
  assert.match(String(persisted?.source.commandFingerprint), /^[a-f0-9]{64}$/);
  assert.equal(records.merchants.get(result.expense.merchantId ?? "")?.normalizedName, "fresh market");
  // M2 balances are ledger-derived: opening balance is never mutated by this write.
  assert.equal(records.accounts.get(account.id)?.openingBalanceMinor, 70_000n);
});

test("the expense command authenticates and uses canonical workspace, account, and role authorization", async () => {
  const { command, dependencies, foreignAccount, records, workspaces } = await fixture();

  assert.deepEqual(await createExpenseForActor(null, command(), dependencies), { ok: false, code: "UNAUTHENTICATED" });
  assert.deepEqual(
    await createExpenseForActor(viewer, command(), dependencies),
    { ok: false, code: "WORKSPACE_FORBIDDEN" },
  );
  assert.deepEqual(
    await createExpenseForActor(owner, command({ workspaceId: "unknown-workspace" }), dependencies),
    { ok: false, code: "WORKSPACE_FORBIDDEN" },
  );
  assert.deepEqual(
    await createExpenseForActor(owner, command({ accountId: foreignAccount.id }), dependencies),
    { ok: false, code: "ACCOUNT_NOT_FOUND" },
  );
  assert.deepEqual(
    await createExpenseForActor(owner, command({ accountId: "00000000-0000-4000-8000-000000000099" }), dependencies),
    { ok: false, code: "ACCOUNT_NOT_FOUND" },
  );

  const account = records.accounts.values().next().value;
  assert.ok(account);
  records.accounts.set(account.id, { ...account, archivedAt: new Date("2026-09-01T00:00:00.000Z") });
  assert.deepEqual(
    await createExpenseForActor(owner, command(), dependencies),
    { ok: false, code: "ACCOUNT_UNAVAILABLE" },
  );
  assert.equal(workspaces.memberships.size, 3);
});

test("the expense command validates exact money and enforces the account currency without floating point", async () => {
  const { command, dependencies } = await fixture();

  assert.equal(parseExpenseAmount("24.50", "USD")?.minor, 2_450n);
  assert.equal(parseExpenseAmount("24,850", "XAF")?.minor, 24_850n);
  assert.equal(parseExpenseAmount("24,850.75", "USD")?.minor, 2_485_075n);
  assert.equal(parseExpenseAmount("24.5010", "USD"), null);

  for (const amount of ["0", "-1", "twelve", "24,85,0"]) {
    assert.deepEqual(
      await createExpenseForActor(owner, command({ amount }), dependencies),
      { ok: false, code: "INVALID_AMOUNT" },
    );
  }
  assert.deepEqual(
    await createExpenseForActor(owner, command({ currency: "ZZZ" }), dependencies),
    { ok: false, code: "INVALID_CURRENCY" },
  );
  assert.deepEqual(
    await createExpenseForActor(owner, command({ currency: "USD" }), dependencies),
    { ok: false, code: "CURRENCY_MISMATCH" },
  );
});

test("the expense command permits no category but rejects inaccessible or incompatible categories", async () => {
  const { command, dependencies, foreignCategory } = await fixture();

  const uncategorized = await createExpenseForActor(owner, command({ categoryId: undefined }), dependencies);
  assert.equal(uncategorized.ok, true);
  if (uncategorized.ok) assert.equal(uncategorized.expense.categoryId, null);

  const categorized = await createExpenseForActor(owner, command({ categoryId: SYSTEM_GROCERIES_ID }), dependencies);
  assert.equal(categorized.ok, true);
  assert.deepEqual(
    await createExpenseForActor(owner, command({ categoryId: SYSTEM_SALARY_ID }), dependencies),
    { ok: false, code: "CATEGORY_NOT_ALLOWED" },
  );
  assert.deepEqual(
    await createExpenseForActor(owner, command({ categoryId: foreignCategory.id }), dependencies),
    { ok: false, code: "CATEGORY_NOT_ALLOWED" },
  );
});

test("the expense command resolves civil timestamps in the workspace timezone and has an explicit date-only policy", async () => {
  const { command, dependencies } = await fixture();

  assert.equal(
    resolveOccurredAt("2026-09-17", "08:30", "America/New_York").toISOString(),
    "2026-09-17T12:30:00.000Z",
  );
  assert.equal(
    resolveOccurredAt("2026-09-17", null, "Africa/Douala").toISOString(),
    "2026-09-17T11:00:00.000Z",
  );
  assert.deepEqual(
    await createExpenseForActor(owner, command({ date: "2024-02-30" }), dependencies),
    { ok: false, code: "INVALID_OCCURRED_AT" },
  );
  assert.deepEqual(
    await createExpenseForActor(owner, command({ time: "25:00" }), dependencies),
    { ok: false, code: "INVALID_OCCURRED_AT" },
  );
});

test("a repository write failure leaves a new merchant and expense together or not at all", async () => {
  const { command, dependencies, records } = await fixture();
  const merchantCount = records.merchants.size;
  const transactionCount = records.transactions.size;
  records.createTransactionWithMerchant = async () => {
    throw new Error("database write failed");
  };

  assert.deepEqual(
    await createExpenseForActor(owner, command({ merchant: "Atomic Merchant" }), dependencies),
    { ok: false, code: "EXPENSE_CREATE_FAILED" },
  );
  assert.equal(records.merchants.size, merchantCount);
  assert.equal(records.transactions.size, transactionCount);
});

test("Expense retries are idempotent, concurrent, and reject a mismatched reused key", async () => {
  const { command, dependencies, records } = await fixture();
  const idempotencyKey = "b0000000-0000-4000-8000-000000000001";
  const firstCommand = command({ idempotencyKey, categoryId: SYSTEM_GROCERIES_ID });

  const [first, second] = await Promise.all([
    createExpenseForActor(owner, firstCommand, dependencies),
    createExpenseForActor(owner, firstCommand, dependencies),
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.expense.id, second.expense.id);
  assert.equal(records.transactions.size, 1);

  assert.deepEqual(
    await createExpenseForActor(owner, command({ idempotencyKey, merchant: "Different merchant" }), dependencies),
    { ok: false, code: "IDEMPOTENCY_KEY_REUSED" },
  );
  const newOperation = await createExpenseForActor(
    owner,
    command({ idempotencyKey: "b0000000-0000-4000-8000-000000000002", amount: "24,851" }),
    dependencies,
  );
  assert.equal(newOperation.ok, true);
  assert.equal(records.transactions.size, 2);
});
