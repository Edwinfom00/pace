import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import {
  failedTransactionCategoryOptions,
  getCompatibleTransactionCategoryOptions,
  loadTransactionCategoryOptions,
} from "@/modules/transactions/domain/transaction-category-options";
import { LedgerService } from "@/modules/ledger/ledger-service";
import {
  getTransactionCategoryOptions,
  mapTransactionCategoryOption,
} from "@/modules/transactions/queries/get-transaction-category-options";

import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_SALARY_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const stranger: AuthenticatedActor = { userId: "stranger-1", email: "stranger@pace.test", name: "Stranger" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";

async function fixture() {
  const ledger = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new LedgerService(ledger, workspaces);
  for (const workspaceId of [workspaceOne, workspaceTwo]) {
    workspaces.addMembership({
      workspaceId,
      userId: owner.userId,
      role: "OWNER",
      invitedByUserId: null,
      joinedAt: new Date(),
    });
  }

  const customExpense = await service.createCategory(owner, workspaceOne, {
    name: "Home repairs",
    kind: "EXPENSE",
  });
  const customIncome = await service.createCategory(owner, workspaceOne, {
    name: "Consulting",
    kind: "INCOME",
  });
  const outside = await service.createCategory(owner, workspaceTwo, {
    name: "Other workspace category",
    kind: "EXPENSE",
  });

  return { customExpense, customIncome, ledger, outside, workspaces };
}

test("manual transaction category DTO exposes only the selector fields and preserves system metadata", async () => {
  const { ledger } = await fixture();
  const groceries = ledger.categories.get(SYSTEM_GROCERIES_ID);
  assert.ok(groceries);

  assert.deepEqual(mapTransactionCategoryOption(groceries), {
    id: SYSTEM_GROCERIES_ID,
    name: "Groceries",
    kind: "EXPENSE",
    systemKey: "expense:groceries",
  });
});

test("category options inherit the canonical category lifecycle, which has no archive or delete state", async () => {
  const { customExpense, ledger } = await fixture();
  const category = ledger.categories.get(customExpense.id);
  assert.ok(category);

  assert.equal(Object.hasOwn(category, "archivedAt"), false);
  assert.equal(Object.hasOwn(category, "deletedAt"), false);
  assert.equal(Object.hasOwn(mapTransactionCategoryOption(category), "archivedAt"), false);
  assert.equal(Object.hasOwn(mapTransactionCategoryOption(category), "deletedAt"), false);
});

test("manual transaction categories are authorized and include global system plus active-workspace custom records", async () => {
  const { customExpense, customIncome, ledger, outside, workspaces } = await fixture();
  const categories = await getTransactionCategoryOptions(
    { actor: owner, workspaceId: workspaceOne },
    { ledger, workspaces },
  );

  assert.equal(categories.some((category) => category.id === SYSTEM_GROCERIES_ID), true);
  assert.equal(categories.some((category) => category.id === SYSTEM_SALARY_ID), true);
  assert.equal(categories.some((category) => category.id === customExpense.id), true);
  assert.equal(categories.some((category) => category.id === customIncome.id), true);
  assert.equal(categories.some((category) => category.id === outside.id), false);

  await assert.rejects(
    getTransactionCategoryOptions({ actor: stranger, workspaceId: workspaceOne }, { ledger, workspaces }),
    AuthorizationError,
  );
});

test("Expense and Income selectors receive only compatible real category records", async () => {
  const { customExpense, customIncome, ledger, workspaces } = await fixture();
  const categories = await getTransactionCategoryOptions(
    { actor: owner, workspaceId: workspaceOne },
    { ledger, workspaces },
  );
  const expenseCategories = getCompatibleTransactionCategoryOptions(categories, "EXPENSE");
  const incomeCategories = getCompatibleTransactionCategoryOptions(categories, "INCOME");

  assert.equal(expenseCategories.every((category) => category.kind === "EXPENSE"), true);
  assert.equal(incomeCategories.every((category) => category.kind === "INCOME"), true);
  assert.equal(expenseCategories.some((category) => category.id === customExpense.id), true);
  assert.equal(expenseCategories.some((category) => category.id === customIncome.id), false);
  assert.equal(incomeCategories.some((category) => category.id === customIncome.id), true);
  assert.equal(incomeCategories.some((category) => category.id === customExpense.id), false);
});

test("a failed category query produces an explicit empty error state without fixtures", async () => {
  const state = await loadTransactionCategoryOptions(async () => {
    throw new Error("database unavailable");
  });

  assert.deepEqual(state, failedTransactionCategoryOptions());
  assert.deepEqual(state.categories, []);
});
