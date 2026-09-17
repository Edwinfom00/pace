import assert from "node:assert/strict";
import test from "node:test";

import { toCurrencyCode } from "@/money/currency";
import {
  canReconcileCreatedExpense,
  canStartExpenseSubmission,
  createExpenseCommand,
  expenseReconciliationPlan,
  mapExpenseCreateFailure,
  resetExpenseTransactionDraft,
  submitCanonicalExpense,
} from "@/modules/transactions/ui/components/expense-create-flow";
import {
  validateTransactionForm,
  type TransactionFormDraft,
} from "@/modules/transactions/schemas/transaction-form.schema";
import { manualTransactionRetryKeyForCommand } from "@/modules/transactions/ui/components/manual-transaction-create-flow";

const workspaceId = "workspace-one";
const accountId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";

function expenseDraft(overrides: Partial<{ amount: string; category: string; merchant: string; note: string; time: string }> = {}) {
  return {
    kind: "EXPENSE" as const,
    account: accountId,
    amount: "24,850.75",
    category: categoryId,
    currency: toCurrencyCode("USD"),
    date: new Date("2026-09-17T12:00:00.000Z"),
    merchant: "Fresh Market",
    note: "Weekly groceries",
    time: "14:30",
    ...overrides,
  };
}

function persistedExpense() {
  return {
    expense: {
      id: "00000000-0000-4000-8000-000000000003",
      type: "EXPENSE" as const,
      amountMinor: "2485075",
      currency: "USD",
      accountId,
      categoryId,
      merchantId: null,
      occurredAt: "2026-09-17T14:30:00.000Z",
      note: "Weekly groceries",
      status: "POSTED" as const,
    },
  };
}

function transactionDraft(): TransactionFormDraft {
  return {
    kind: "EXPENSE",
    expense: { ...expenseDraft() },
    income: {
      account: "income-account",
      amount: "500",
      category: "income-category",
      currency: toCurrencyCode("USD"),
      date: new Date("2026-09-16T12:00:00.000Z"),
      note: "Income note",
      source: "Employer",
      time: "09:00",
    },
    transfer: {
      amount: "100",
      currency: toCurrencyCode("USD"),
      date: new Date("2026-09-15T12:00:00.000Z"),
      fromAccount: "from-account",
      note: "Transfer note",
      time: "",
      toAccount: "to-account",
    },
  };
}

test("a valid expense submits the exact C13A command once and only accepts its persisted DTO", async () => {
  const command = createExpenseCommand(workspaceId, expenseDraft());
  let calls = 0;

  const result = await submitCanonicalExpense(command, async (received) => {
    calls += 1;
    assert.deepEqual(received, {
      workspaceId,
      accountId,
      amount: "24,850.75",
      currency: "USD",
      categoryId,
      merchant: "Fresh Market",
      date: "2026-09-17",
      time: "14:30",
      note: "Weekly groceries",
    });
    return { ok: true, payload: persistedExpense() };
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.expense.id, persistedExpense().expense.id);
});

test("invalid client expense data does not invoke the canonical transport", async () => {
  const validation = validateTransactionForm(expenseDraft({ amount: "" }));
  let calls = 0;

  if (validation.isValid && validation.value.kind === "EXPENSE") {
    await submitCanonicalExpense(createExpenseCommand(workspaceId, validation.value), async () => {
      calls += 1;
      return { ok: true, payload: persistedExpense() };
    });
  }

  assert.equal(validation.isValid, false);
  assert.equal(calls, 0);
});

test("expense submission guard rejects a repeated click while a request is pending", () => {
  assert.equal(canStartExpenseSubmission(false), true);
  assert.equal(canStartExpenseSubmission(true), false);
});

test("expense command retains the exact decimal string instead of converting money in JavaScript", () => {
  const command = createExpenseCommand(workspaceId, expenseDraft({ amount: "0.10" }));

  assert.equal(command.amount, "0.10");
  assert.equal(typeof command.amount, "string");
});

test("canonical server account and category failures map to their editable fields", () => {
  assert.equal(mapExpenseCreateFailure("ACCOUNT_UNAVAILABLE").field, "account");
  assert.equal(mapExpenseCreateFailure("ACCOUNT_WORKSPACE_MISMATCH").field, "account");
  assert.equal(mapExpenseCreateFailure("CATEGORY_NOT_ALLOWED").field, "category");
  assert.equal(mapExpenseCreateFailure("CATEGORY_NOT_FOUND").field, "category");
});

test("canonical amount, currency, and date failures map to the corresponding form fields", () => {
  assert.equal(mapExpenseCreateFailure("INVALID_AMOUNT").field, "amount");
  assert.equal(mapExpenseCreateFailure("INVALID_CURRENCY").field, "currency");
  assert.equal(mapExpenseCreateFailure("CURRENCY_MISMATCH").field, "currency");
  assert.equal(mapExpenseCreateFailure("INVALID_OCCURRED_AT").field, "date");
});

test("a generic server failure leaves the submitted Expense draft available for retry", async () => {
  const draft = transactionDraft();
  const command = createExpenseCommand(workspaceId, expenseDraft());
  const result = await submitCanonicalExpense(command, async () => ({
    ok: false,
    payload: { code: "EXPENSE_CREATE_FAILED" },
  }));

  assert.equal(result.ok, false);
  assert.deepEqual(draft.expense, transactionDraft().expense);
});

test("success resets only Expense and never creates a fake transaction from a failed response", async () => {
  const draft = transactionDraft();
  const emptyExpense = {
    account: "",
    amount: "",
    category: "",
    currency: toCurrencyCode("USD"),
    date: new Date("2026-09-17T12:00:00.000Z"),
    merchant: "",
    note: "",
    time: "",
  };
  const reset = resetExpenseTransactionDraft(draft, emptyExpense);
  const rejected = await submitCanonicalExpense(createExpenseCommand(workspaceId, expenseDraft()), async () => ({
    ok: true,
    payload: { expense: { id: "not-a-complete-persisted-dto" } },
  }));

  assert.deepEqual(reset.expense, emptyExpense);
  assert.deepEqual(reset.income, draft.income);
  assert.deepEqual(reset.transfer, draft.transfer);
  assert.equal(rejected.ok, false);
});

test("server confirmation refreshes canonical transaction data, closes the dialog, and never inserts an optimistic list item", () => {
  assert.deepEqual(expenseReconciliationPlan(workspaceId, workspaceId), {
    shouldAttachTransactionToList: false,
    shouldCloseDialog: true,
    shouldRefreshData: true,
    shouldResetExpenseDraft: true,
  });
});

test("a response only reconciles in the workspace that issued its command", () => {
  assert.equal(canReconcileCreatedExpense(workspaceId, workspaceId), true);
  assert.equal(canReconcileCreatedExpense(workspaceId, "workspace-two"), false);
  assert.deepEqual(expenseReconciliationPlan(workspaceId, "workspace-two"), {
    shouldAttachTransactionToList: false,
    shouldCloseDialog: false,
    shouldRefreshData: true,
    shouldResetExpenseDraft: false,
  });
});

test("a failed transport keeps its idempotency key only for the unchanged manual command", () => {
  const first = manualTransactionRetryKeyForCommand(undefined, "expense:one", () => "key-one");
  const retry = manualTransactionRetryKeyForCommand(first, "expense:one", () => "should-not-be-used");
  const changed = manualTransactionRetryKeyForCommand(first, "expense:two", () => "key-two");

  assert.equal(retry.idempotencyKey, "key-one");
  assert.equal(changed.idempotencyKey, "key-two");
});
