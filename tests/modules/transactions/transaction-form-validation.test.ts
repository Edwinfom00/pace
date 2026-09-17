import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { toCurrencyCode } from "@/money/currency";
import {
  getFirstInvalidTransactionFormField,
  getTransferDisabledAccountIds,
  validateTransactionForm,
  type TransactionFormDraft,
} from "@/modules/transactions/schemas/transaction-form.schema";
import {
  clearUnavailableTransactionAccountSelections,
  clearUnavailableTransactionCategorySelections,
  emptyTransactionFormErrors,
  validateTransactionDraft,
} from "@/modules/transactions/ui/components/transaction-create-control";
import { TransactionAmountField } from "@/modules/transactions/ui/components/transaction-amount-field";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";

const date = new Date("2026-09-17T12:00:00.000Z");

function expense(overrides: Record<string, unknown> = {}) {
  return {
    kind: "EXPENSE",
    amount: "20,000",
    currency: toCurrencyCode("XAF"),
    account: "cash",
    date,
    time: "",
    note: "",
    merchant: "",
    ...overrides,
  };
}

function income(overrides: Record<string, unknown> = {}) {
  return {
    kind: "INCOME",
    amount: "750",
    currency: "XAF",
    account: "main-account",
    date,
    time: "",
    note: "",
    source: "",
    ...overrides,
  };
}

function transfer(overrides: Record<string, unknown> = {}) {
  return {
    kind: "TRANSFER",
    amount: "250",
    currency: "XAF",
    fromAccount: "cash",
    fromAccountCurrency: "XAF",
    toAccount: "main-account",
    toAccountCurrency: "XAF",
    date,
    time: "",
    note: "",
    ...overrides,
  };
}

test("expense validation requires a positive monetary amount, account, and date while leaving merchant and category optional", () => {
  assert.equal(validateTransactionForm(expense({ amount: "" })).errors.amount, "transactions.validation.amountRequired");
  assert.equal(validateTransactionForm(expense({ amount: "0" })).errors.amount, "transactions.validation.amountPositive");
  assert.equal(validateTransactionForm(expense({ amount: "-20" })).errors.amount, "transactions.validation.amountPositive");
  assert.equal(validateTransactionForm(expense({ amount: "20..0" })).errors.amount, "transactions.validation.amountInvalid");
  assert.equal(validateTransactionForm(expense({ currency: "" })).errors.currency, "transactions.validation.currencyRequired");
  assert.equal(validateTransactionForm(expense({ currency: "ABC" })).errors.currency, "transactions.validation.currencyUnsupported");
  assert.equal(validateTransactionForm(expense({ account: "" })).errors.account, "transactions.validation.accountRequired");
  assert.equal(validateTransactionForm(expense({ date: undefined })).errors.date, "transactions.validation.dateRequired");
  assert.equal(validateTransactionForm(expense({ date: new Date("invalid") })).errors.date, "transactions.validation.invalidDate");
  assert.equal(validateTransactionForm(expense({ time: "24:00" })).errors.time, "transactions.validation.invalidTime");
  assert.equal(validateTransactionForm(expense()).isValid, true);
  assert.equal(validateTransactionForm(expense({ category: undefined, merchant: "" })).isValid, true);
  assert.equal(validateTransactionForm(expense({ merchant: "   " })).errors.merchant, "transactions.validation.optionalTextBlank");
  assert.equal(
    validateTransactionForm(expense({ note: "x".repeat(501) })).errors.note,
    "transactions.validation.noteTooLong",
  );
});

test("income validation shares the common rules and keeps source and category optional", () => {
  assert.equal(validateTransactionForm(income({ amount: "" })).errors.amount, "transactions.validation.amountRequired");
  assert.equal(validateTransactionForm(income({ account: "" })).errors.account, "transactions.validation.accountRequired");
  assert.equal(validateTransactionForm(income({ category: undefined, source: "" })).isValid, true);
  assert.equal(validateTransactionForm(income()).isValid, true);
});

test("transfer validation requires distinct accounts and reports unavailable FX paths", () => {
  assert.equal(validateTransactionForm(transfer({ fromAccount: "" })).errors.fromAccount, "transactions.validation.fromAccountRequired");
  assert.equal(validateTransactionForm(transfer({ toAccount: "" })).errors.toAccount, "transactions.validation.toAccountRequired");
  assert.equal(
    validateTransactionForm(transfer({ toAccount: "cash" })).errors.toAccount,
    "transactions.validation.sameTransferAccount",
  );
  assert.equal(
    validateTransactionForm(transfer({ toAccountCurrency: "EUR" })).errors.toAccount,
    "transactions.validation.crossCurrencyTransferUnsupported",
  );
  assert.equal(validateTransactionForm(transfer({ amount: "" })).errors.amount, "transactions.validation.amountRequired");
  assert.equal(validateTransactionForm(transfer()).isValid, true);
});

test("transfer account exclusions are supplied by the transfer parent, not embedded in AccountSelect", () => {
  assert.deepEqual(getTransferDisabledAccountIds("account-xaf"), ["account-xaf"]);
  assert.deepEqual(getTransferDisabledAccountIds(""), []);
  assert.deepEqual(getTransferDisabledAccountIds("account-eur"), ["account-eur"]);
});

test("validation state begins quiet, revalidates per kind, and identifies the first invalid field", () => {
  assert.deepEqual(emptyTransactionFormErrors(), { EXPENSE: {}, INCOME: {}, TRANSFER: {} });
  assert.equal(
    getFirstInvalidTransactionFormField("EXPENSE", {
      account: "transactions.validation.accountRequired",
      amount: "transactions.validation.amountRequired",
    }),
    "amount",
  );
  assert.equal(
    getFirstInvalidTransactionFormField("TRANSFER", {
      date: "transactions.validation.dateRequired",
      toAccount: "transactions.validation.toAccountRequired",
    }),
    "toAccount",
  );
});

test("field errors are inline and connected to their invalid control", () => {
  const markup = renderToStaticMarkup(createElement(TransactionAmountField, {
    currency: toCurrencyCode("XAF"),
    currencyEmptyLabel: "No currencies found.",
    currencyLabel: "Currency",
    currencySearchPlaceholder: "Search currencies…",
    error: "Amount must be greater than zero.",
    label: "Amount",
    language: "en",
    onCurrencyChange: () => undefined,
    onValueChange: () => undefined,
    value: "0",
  }));

  assert.match(markup, /aria-invalid="true"/);
  assert.match(markup, /aria-describedby="[^\"]+"/);
  assert.match(markup, /Amount must be greater than zero\./);
});

const workspaceAccounts = [
  { id: "account-xaf", name: "Everyday", currency: toCurrencyCode("XAF") },
  { id: "account-eur", name: "Travel", currency: toCurrencyCode("EUR") },
] as const;

const workspaceCategories = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Groceries", kind: "EXPENSE" as const, systemKey: "expense:groceries" },
  { id: "00000000-0000-4000-8000-000000000101", name: "Salary", kind: "INCOME" as const, systemKey: "income:salary" },
] as const;

test("Expense, Income, and Transfer validate only account ids from the real account option set", () => {
  const draft: TransactionFormDraft = {
    kind: "TRANSFER",
    expense: { amount: "20", currency: workspaceAccounts[0].currency, account: "account-xaf", category: "", merchant: "Market", date, time: "", note: "Lunch" },
    income: { amount: "750", currency: workspaceAccounts[0].currency, account: "account-xaf", category: "", source: "Salary", date, time: "", note: "September" },
    transfer: { amount: "250", currency: workspaceAccounts[0].currency, fromAccount: "account-xaf", toAccount: "account-eur", date, time: "", note: "Move funds" },
  };

  assert.equal(validateTransactionDraft({ ...draft, kind: "EXPENSE" }, workspaceAccounts, workspaceCategories).isValid, true);
  assert.equal(validateTransactionDraft({ ...draft, kind: "INCOME" }, workspaceAccounts, workspaceCategories).isValid, true);
  assert.equal(
    validateTransactionDraft({ ...draft, transfer: { ...draft.transfer, toAccount: "account-xaf" } }, workspaceAccounts, workspaceCategories).errors.toAccount,
    "transactions.validation.sameTransferAccount",
  );
  assert.equal(validateTransactionDraft(draft, workspaceAccounts, workspaceCategories).errors.toAccount, "transactions.validation.crossCurrencyTransferUnsupported");
  assert.equal(
    validateTransactionDraft({ ...draft, kind: "EXPENSE", expense: { ...draft.expense, account: "outside-workspace" } }, workspaceAccounts, workspaceCategories).errors.account,
    "transactions.validation.accountUnavailable",
  );
});

test("real category IDs stay optional, validate against their compatible kind, and never leak across drafts", () => {
  const draft: TransactionFormDraft = {
    kind: "EXPENSE",
    expense: { amount: "20", currency: workspaceAccounts[0].currency, account: "account-xaf", category: workspaceCategories[0].id, merchant: "Market", date, time: "", note: "Lunch" },
    income: { amount: "750", currency: workspaceAccounts[0].currency, account: "account-xaf", category: workspaceCategories[1].id, source: "Salary", date, time: "", note: "September" },
    transfer: { amount: "250", currency: workspaceAccounts[0].currency, fromAccount: "account-xaf", toAccount: "account-eur", date, time: "", note: "Move funds" },
  };

  assert.equal(validateTransactionDraft(draft, workspaceAccounts, workspaceCategories).isValid, true);
  assert.equal(validateTransactionDraft({ ...draft, kind: "INCOME" }, workspaceAccounts, workspaceCategories).isValid, true);
  assert.equal(
    validateTransactionDraft({ ...draft, kind: "INCOME", income: { ...draft.income, category: workspaceCategories[0].id } }, workspaceAccounts, workspaceCategories).errors.category,
    "transactions.validation.categoryUnavailable",
  );
  assert.equal(
    validateTransactionDraft({ ...draft, expense: { ...draft.expense, category: "" } }, workspaceAccounts, workspaceCategories).isValid,
    true,
  );
  assert.equal(draft.expense.category, workspaceCategories[0].id);
  assert.equal(draft.income.category, workspaceCategories[1].id);
});

test("workspace category changes clear invalid custom selections while retaining still-authorized system selections", () => {
  const draft: TransactionFormDraft = {
    kind: "EXPENSE",
    expense: { amount: "20", currency: workspaceAccounts[0].currency, account: "account-xaf", category: "custom-expense", merchant: "Market", date, time: "", note: "Lunch" },
    income: { amount: "750", currency: workspaceAccounts[0].currency, account: "account-xaf", category: workspaceCategories[1].id, source: "Salary", date, time: "", note: "September" },
    transfer: { amount: "250", currency: workspaceAccounts[0].currency, fromAccount: "account-xaf", toAccount: "account-eur", date, time: "", note: "Move funds" },
  };
  const updated = clearUnavailableTransactionCategorySelections(draft, workspaceCategories);

  assert.equal(updated.expense.category, "");
  assert.equal(updated.income.category, workspaceCategories[1].id);
  assert.equal(updated.expense.merchant, "Market");
  assert.equal(updated.income.source, "Salary");
});

test("workspace changes clear stale manual transaction selections", () => {
  const draft: TransactionFormDraft = {
    kind: "TRANSFER",
    expense: { amount: "20", currency: workspaceAccounts[0].currency, account: "account-xaf", category: "", merchant: "Market", date, time: "", note: "Lunch" },
    income: { amount: "750", currency: workspaceAccounts[0].currency, account: "account-xaf", category: "", source: "Salary", date, time: "", note: "September" },
    transfer: { amount: "250", currency: workspaceAccounts[0].currency, fromAccount: "account-xaf", toAccount: "account-eur", date, time: "", note: "Move funds" },
  };
  const updated = clearUnavailableTransactionAccountSelections(draft, [
    { id: "account-other-workspace", name: "Other", currency: toCurrencyCode("USD") },
  ]);

  assert.equal(updated.transfer.toAccount, "");
  assert.equal(updated.transfer.fromAccount, "");
  assert.equal(updated.expense.account, "");
  assert.equal(updated.income.account, "");
  assert.equal(updated.transfer.note, "Move funds");
});

test("transaction validation messages are translated for English, French, and German", () => {
  assert.equal(getTransactionUiLabels(getDashboardLabels("en")).validation["transactions.validation.amountRequired"], "Enter an amount.");
  assert.equal(getTransactionUiLabels(getDashboardLabels("fr")).validation["transactions.validation.sameTransferAccount"], "Choisissez un autre compte de destination.");
  assert.equal(getTransactionUiLabels(getDashboardLabels("de")).validation["transactions.validation.crossCurrencyTransferUnsupported"], "Überweisungen zwischen unterschiedlichen Währungen werden noch nicht unterstützt.");
});
