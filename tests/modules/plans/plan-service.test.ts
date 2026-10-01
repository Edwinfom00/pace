import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { toCurrencyCode } from "@/money/currency";
import { CurrencyMismatchError } from "@/money/money";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { PlansService } from "@/modules/plans/plan-service";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryLedgerRepository, SYSTEM_GROCERIES_ID } from "../../support/in-memory-ledger-repository";
import { InMemoryPlansRepository } from "../../support/in-memory-plans-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";

async function createFixture() {
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const plansRecords = new InMemoryPlansRepository();
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const plans = new PlansService(plansRecords, ledgerRecords, workspaces);
  const now = new Date("2026-06-01T00:00:00.000Z");
  for (const id of [workspaceOne, workspaceTwo]) {
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
      preferences: { currency: "XAF", locale: "fr-CM", timezone: "UTC", weekStartsOn: 1 },
      owner: { workspaceId: id, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now },
      initialAccount: { id: `${id}-main`, workspaceId: id, name: "Main account", type: "CHECKING", currency: "XAF", createdByUserId: owner.userId },
    });
  }
  workspaces.addMembership({
    workspaceId: workspaceOne,
    userId: viewer.userId,
    role: "VIEWER",
    invitedByUserId: null,
    joinedAt: now,
  });
  const cash = await ledger.createAccount(owner, workspaceOne, { name: "Cash", type: "CASH", currency: "XAF" });
  const savings = await ledger.createAccount(owner, workspaceOne, { name: "Savings", type: "SAVINGS", currency: "XAF" });
  return { cash, ledger, ledgerRecords, plans, plansRecords, savings, workspaces };
}

test("budget summaries use only posted ledger transactions, exclude transfers, and reduce spend with refunds", async () => {
  const { cash, ledger, plans, savings } = await createFixture();
  const budget = await plans.createBudget(owner, workspaceOne, {
    scope: "CATEGORY",
    categoryId: SYSTEM_GROCERIES_ID,
    amountMinor: 1_000n,
    startsOn: new Date("2026-06-01T00:00:00.000Z"),
    endsOn: null,
  });
  const expense = await ledger.createTransaction(owner, workspaceOne, {
    kind: "EXPENSE",
    amountMinor: "600",
    currency: "XAF",
    occurredAt: "2026-06-10T12:00:00.000Z",
    accountId: cash.id,
    categoryId: SYSTEM_GROCERIES_ID,
  });
  await ledger.createRefund(owner, {
    workspaceId: workspaceOne,
    expenseTransactionId: expense.id,
    amountMinor: 100n,
    currency: toCurrencyCode("XAF"),
    occurredAt: new Date("2026-06-12T12:00:00.000Z"),
    accountId: cash.id,
    idempotencyKey: "10000000-0000-4000-8000-000000000001",
  });
  await ledger.createTransaction(owner, workspaceOne, {
    kind: "TRANSFER",
    amountMinor: "900",
    currency: "XAF",
    occurredAt: "2026-06-13T12:00:00.000Z",
    accountId: cash.id,
    transferAccountId: savings.id,
  });
  await ledger.createTransaction(owner, workspaceOne, {
    kind: "EXPENSE",
    status: "PENDING",
    amountMinor: "300",
    currency: "XAF",
    occurredAt: "2026-06-14T12:00:00.000Z",
    accountId: cash.id,
    categoryId: SYSTEM_GROCERIES_ID,
  });

  const [summary] = await plans.listBudgetSummaries(owner, workspaceOne, new Date("2026-06-15T12:00:00.000Z"));
  assert.equal(summary?.budget.id, budget.id);
  assert.equal(summary?.currentSpendMinor, 500n);
  assert.equal(summary?.remainingMinor, 500n);
  assert.equal(summary?.percentageUsedBps, 5_000n);
  assert.equal(summary?.expectedUsageBps, 5_000n);
  assert.equal(summary?.overBudget, false);
});

test("budget amount aggregation fails safely without an explicit FX strategy", async () => {
  const { ledger, plans } = await createFixture();
  const usd = await ledger.createAccount(owner, workspaceOne, { name: "USD cash", type: "CASH", currency: "USD" });
  await plans.createBudget(owner, workspaceOne, {
    scope: "OVERALL",
    categoryId: null,
    amountMinor: 10_000n,
    startsOn: new Date("2026-06-01T00:00:00.000Z"),
    endsOn: null,
  });
  await ledger.createTransaction(owner, workspaceOne, {
    kind: "EXPENSE",
    amountMinor: "10",
    currency: "USD",
    occurredAt: "2026-06-10T12:00:00.000Z",
    accountId: usd.id,
    categoryId: SYSTEM_GROCERIES_ID,
  });
  await assert.rejects(
    plans.listBudgetSummaries(owner, workspaceOne, new Date("2026-06-15T12:00:00.000Z")),
    CurrencyMismatchError,
  );
});

test("savings progress is explicit and required pace is deterministic", async () => {
  const { plans } = await createFixture();
  const goal = await plans.createSavingsGoal(owner, workspaceOne, {
    name: "Emergency fund",
    targetAmountMinor: 1_000n,
    currentSavedMinor: 300n,
    targetDate: new Date("2026-06-20T00:00:00.000Z"),
  });
  const [summary] = await plans.listSavingsGoalSummaries(owner, workspaceOne, new Date("2026-06-15T12:00:00.000Z"));
  assert.equal(summary?.goal.id, goal.id);
  assert.equal(summary?.remainingMinor, 700n);
  assert.equal(summary?.progressBps, 3_000n);
  assert.equal(summary?.requiredDailyMinor, 117n);
  assert.equal(summary?.completed, false);

  const completed = await plans.updateSavingsGoal(owner, workspaceOne, goal.id, { currentSavedMinor: 1_000n });
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.currentSavedMinor, 1_000n);
});

test("goal creation is idempotent, exact, authorized, and has no ledger side effects", async () => {
  const { ledgerRecords, plans, plansRecords } = await createFixture();
  const beforeTransactions = ledgerRecords.transactions.size;
  const command = {
    name: "Home deposit",
    targetAmountMinor: 9_007_199_254_740_993n,
    currentSavedMinor: 0n,
    targetDate: new Date("2026-12-31T00:00:00.000Z"),
    agentActionId: "8fc9d737-2fa7-4f6b-a16a-62ea57d81b7d",
  };
  const created = await plans.createSavingsGoal(owner, workspaceOne, command);
  const replay = await plans.createSavingsGoal(owner, workspaceOne, command);
  assert.equal(created.id, replay.id);
  assert.equal(created.targetAmountMinor, command.targetAmountMinor);
  assert.equal(plansRecords.goals.size, 1);
  assert.equal(ledgerRecords.transactions.size, beforeTransactions);
  await assert.rejects(plans.createSavingsGoal(viewer, workspaceOne, command), AuthorizationError);
});

test("savings-goal detail summary is workspace-scoped and never infers account balances", async () => {
  const { cash, ledger, plans } = await createFixture();
  const goal = await plans.createSavingsGoal(owner, workspaceOne, {
    name: "Trip",
    targetAmountMinor: 1_000n,
    currentSavedMinor: 250n,
    targetDate: new Date("2026-06-20T00:00:00.000Z"),
  });
  await ledger.createTransaction(owner, workspaceOne, {
    kind: "INCOME", amountMinor: "900", currency: "XAF", occurredAt: "2026-06-10T00:00:00.000Z", accountId: cash.id,
  });
  const detail = await plans.getSavingsGoalSummary(owner, workspaceOne, goal.id, new Date("2026-06-15T00:00:00.000Z"));
  assert.equal(detail?.remainingMinor, 750n);
  assert.equal(detail?.progressBps, 2_500n);
  assert.equal(detail?.targetDateDaysRemaining, 6n);
  assert.equal(detail?.requiredDailyMinor, 125n);
  assert.equal(await plans.getSavingsGoalSummary(owner, workspaceTwo, goal.id), null);
});

test("plan mutations and records stay isolated to authorized workspace members", async () => {
  const { plans } = await createFixture();
  await assert.rejects(
    plans.createBudget(viewer, workspaceOne, {
      scope: "OVERALL",
      categoryId: null,
      amountMinor: 500n,
      startsOn: new Date("2026-06-01T00:00:00.000Z"),
      endsOn: null,
    }),
    AuthorizationError,
  );
  const budget = await plans.createBudget(owner, workspaceOne, {
    scope: "OVERALL",
    categoryId: null,
    amountMinor: 500n,
    startsOn: new Date("2026-06-01T00:00:00.000Z"),
    endsOn: null,
  });
  assert.deepEqual(await plans.listBudgetSummaries(owner, workspaceTwo), []);
  await assert.rejects(plans.updateBudget(owner, workspaceTwo, budget.id, { amountMinor: 600n }), NotFoundError);
});

test("budget management edits only planning fields, honors scope hierarchy, and never mutates ledger records", async () => {
  const { cash, ledger, ledgerRecords, plans } = await createFixture();
  const budget = await plans.createBudget(owner, workspaceOne, { scope: "CATEGORY", categoryId: SYSTEM_GROCERIES_ID, amountMinor: 1_000n, startsOn: new Date("2027-06-01T00:00:00.000Z"), endsOn: null });
  await ledger.createTransaction(owner, workspaceOne, { kind: "EXPENSE", amountMinor: "300", currency: "XAF", occurredAt: "2026-06-10T12:00:00.000Z", accountId: cash.id, categoryId: SYSTEM_GROCERIES_ID });
  const beforeTransactions = JSON.stringify([...ledgerRecords.transactions.values()], (_, value) => typeof value === "bigint" ? value.toString() : value);
  const edited = await plans.editBudget(owner, workspaceOne, budget.id, { amountMinor: 1_200n, expectedUpdatedAt: budget.updatedAt, idempotencyKey: "budget-edit-1" });
  assert.equal(edited.amountMinor, 1_200n);
  assert.equal(JSON.stringify([...ledgerRecords.transactions.values()], (_, value) => typeof value === "bigint" ? value.toString() : value), beforeTransactions);
  await assert.rejects(plans.editBudget(owner, workspaceOne, budget.id, { categoryId: "not-a-category", expectedUpdatedAt: edited.updatedAt, idempotencyKey: "budget-edit-invalid" }), NotFoundError);
});

test("budget archive is idempotent, version-checked, authorized, and retains its history", async () => {
  const { plans, plansRecords } = await createFixture();
  const budget = await plans.createBudget(owner, workspaceOne, { scope: "OVERALL", categoryId: null, amountMinor: 500n, startsOn: new Date("2026-06-01T00:00:00.000Z"), endsOn: null });
  await assert.rejects(plans.archiveBudget(viewer, workspaceOne, budget.id, { expectedUpdatedAt: budget.updatedAt, idempotencyKey: "budget-archive-viewer" }), AuthorizationError);
  await assert.rejects(plans.archiveBudget(owner, workspaceOne, budget.id, { expectedUpdatedAt: new Date(0), idempotencyKey: "budget-archive-stale" }), ConflictError);
  const archived = await plans.archiveBudget(owner, workspaceOne, budget.id, { expectedUpdatedAt: budget.updatedAt, idempotencyKey: "budget-archive-1" });
  const replay = await plans.archiveBudget(owner, workspaceOne, budget.id, { expectedUpdatedAt: budget.updatedAt, idempotencyKey: "budget-archive-1" });
  assert.equal(archived.status, "ARCHIVED");
  assert.equal(replay.id, budget.id);
  assert.equal(plansRecords.budgets.get(budget.id)?.startsOn.getTime(), budget.startsOn.getTime());
  const summary = await plans.getBudgetSummary(owner, workspaceOne, budget.id, new Date("2026-06-15T00:00:00.000Z"));
  assert.equal(summary?.capabilities.canArchive, false);
  assert.equal(summary?.capabilities.canPause, false);
});
