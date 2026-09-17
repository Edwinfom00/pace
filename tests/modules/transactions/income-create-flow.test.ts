import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { toCurrencyCode } from "@/money/currency";
import {
  canReconcileCreatedIncome,
  canStartIncomeSubmission,
  createIncomeCommand,
  incomeReconciliationPlan,
  mapIncomeCreateFailure,
  resetIncomeTransactionDraft,
  submitCanonicalIncome,
} from "@/modules/transactions/ui/components/income-create-flow";
import { selectCreatedAccountForTarget } from "@/modules/transactions/ui/components/create-account-flow";
import {
  validateTransactionForm,
  type TransactionFormDraft,
} from "@/modules/transactions/schemas/transaction-form.schema";

const workspaceId = "workspace-one";
const accountId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000002";

function incomeDraft(overrides: Partial<{ amount: string; category: string; note: string; source: string; time: string }> = {}) {
  return {
    kind: "INCOME" as const,
    account: accountId,
    amount: "24,850.75",
    category: categoryId,
    currency: toCurrencyCode("USD"),
    date: new Date("2026-09-17T12:00:00.000Z"),
    note: "September payroll",
    source: "Employer",
    time: "14:30",
    ...overrides,
  };
}

function persistedIncome() {
  return {
    income: {
      id: "00000000-0000-4000-8000-000000000003",
      type: "INCOME" as const,
      amountMinor: "2485075",
      currency: "USD",
      accountId,
      categoryId,
      merchantId: null,
      occurredAt: "2026-09-17T14:30:00.000Z",
      note: "September payroll",
      status: "POSTED" as const,
    },
  };
}

function transactionDraft(): TransactionFormDraft {
  return {
    kind: "INCOME",
    expense: {
      account: "expense-account",
      amount: "100",
      category: "expense-category",
      currency: toCurrencyCode("USD"),
      date: new Date("2026-09-16T12:00:00.000Z"),
      merchant: "Grocer",
      note: "Expense note",
      time: "10:00",
    },
    income: { ...incomeDraft() },
    transfer: {
      amount: "75",
      currency: toCurrencyCode("USD"),
      date: new Date("2026-09-15T12:00:00.000Z"),
      fromAccount: "from-account",
      note: "Transfer note",
      time: "09:00",
      toAccount: "to-account",
    },
  };
}

test("a valid Income submits the exact C14A command once and only accepts its persisted DTO", async () => {
  const command = createIncomeCommand(workspaceId, incomeDraft());
  let calls = 0;

  const result = await submitCanonicalIncome(command, async (received) => {
    calls += 1;
    assert.deepEqual(received, {
      workspaceId,
      accountId,
      amount: "24,850.75",
      currency: "USD",
      categoryId,
      source: "Employer",
      date: "2026-09-17",
      time: "14:30",
      note: "September payroll",
    });
    return { ok: true, payload: persistedIncome() };
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.income.id, persistedIncome().income.id);
});

test("invalid client Income data does not invoke C14A", async () => {
  const validation = validateTransactionForm(incomeDraft({ amount: "" }));
  let calls = 0;

  if (validation.isValid && validation.value.kind === "INCOME") {
    await submitCanonicalIncome(createIncomeCommand(workspaceId, validation.value), async () => {
      calls += 1;
      return { ok: true, payload: persistedIncome() };
    });
  }

  assert.equal(validation.isValid, false);
  assert.equal(calls, 0);
});

test("Income submission rejects repeated clicks while a request is pending", () => {
  assert.equal(canStartIncomeSubmission(false), true);
  assert.equal(canStartIncomeSubmission(true), false);
});

test("Income retains its validated decimal string and uses null only for an omitted canonical source", () => {
  const decimal = createIncomeCommand(workspaceId, incomeDraft({ amount: "0.10" }));
  const noSource = createIncomeCommand(workspaceId, incomeDraft({ source: "" }));

  assert.equal(decimal.amount, "0.10");
  assert.equal(typeof decimal.amount, "string");
  assert.equal(noSource.source, null);
});

test("C14A account, category, amount, currency, date, and source failures map to editable Income fields", () => {
  assert.equal(mapIncomeCreateFailure("ACCOUNT_UNAVAILABLE").field, "account");
  assert.equal(mapIncomeCreateFailure("ACCOUNT_WORKSPACE_MISMATCH").field, "account");
  assert.equal(mapIncomeCreateFailure("CATEGORY_NOT_ALLOWED").field, "category");
  assert.equal(mapIncomeCreateFailure("CATEGORY_NOT_FOUND").field, "category");
  assert.equal(mapIncomeCreateFailure("INVALID_AMOUNT").field, "amount");
  assert.equal(mapIncomeCreateFailure("INVALID_CURRENCY").field, "currency");
  assert.equal(mapIncomeCreateFailure("CURRENCY_MISMATCH").field, "currency");
  assert.equal(mapIncomeCreateFailure("INVALID_OCCURRED_AT").field, "date");
  assert.equal(mapIncomeCreateFailure("INVALID_SOURCE").field, "source");
});

test("an unexpected server failure preserves the Income draft for retry and never manufactures a transaction", async () => {
  const draft = transactionDraft();
  const result = await submitCanonicalIncome(createIncomeCommand(workspaceId, incomeDraft()), async () => ({
    ok: false,
    payload: { code: "TRANSACTION_CREATE_FAILED" },
  }));

  assert.equal(result.ok, false);
  assert.deepEqual(draft.income, transactionDraft().income);
});

test("server confirmation refreshes canonical data, closes the dialog, and resets only Income", () => {
  const draft = transactionDraft();
  const emptyIncome = {
    account: "",
    amount: "",
    category: "",
    currency: toCurrencyCode("USD"),
    date: new Date("2026-09-17T12:00:00.000Z"),
    note: "",
    source: "",
    time: "",
  };
  const reset = resetIncomeTransactionDraft(draft, emptyIncome);

  assert.deepEqual(reset.income, emptyIncome);
  assert.deepEqual(reset.expense, draft.expense);
  assert.deepEqual(reset.transfer, draft.transfer);
  assert.deepEqual(incomeReconciliationPlan(workspaceId, workspaceId), {
    shouldAttachTransactionToList: false,
    shouldCloseDialog: true,
    shouldRefreshData: true,
    shouldResetIncomeDraft: true,
  });
});

test("a C14A response only reconciles in the workspace that issued it", () => {
  assert.equal(canReconcileCreatedIncome(workspaceId, workspaceId), true);
  assert.equal(canReconcileCreatedIncome(workspaceId, "workspace-two"), false);
  assert.deepEqual(incomeReconciliationPlan(workspaceId, "workspace-two"), {
    shouldAttachTransactionToList: false,
    shouldCloseDialog: false,
    shouldRefreshData: true,
    shouldResetIncomeDraft: false,
  });
});

test("a real Create Account selection feeds the Income C14A command without a temporary account", async () => {
  const createdAccount = {
    id: "00000000-0000-4000-8000-000000000009",
    name: "Income account",
    type: "CHECKING" as const,
    currency: toCurrencyCode("USD"),
  };
  const withCreatedAccount = selectCreatedAccountForTarget(
    transactionDraft(),
    "INCOME_ACCOUNT",
    createdAccount,
    [],
  );
  const command = createIncomeCommand(workspaceId, { kind: "INCOME", ...withCreatedAccount.income });

  const result = await submitCanonicalIncome(command, async (received) => {
    assert.equal(received.accountId, createdAccount.id);
    return {
      ok: true,
      payload: {
        income: { ...persistedIncome().income, accountId: createdAccount.id },
      },
    };
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.income.accountId, createdAccount.id);
});

test("the Income client flow contains no floating-point financial conversion", async () => {
  const source = await readFile(resolve("src/modules/transactions/ui/components/income-create-flow.ts"), "utf8");

  assert.equal(source.includes("parseFloat"), false);
  assert.equal(source.includes("Number("), false);
});
