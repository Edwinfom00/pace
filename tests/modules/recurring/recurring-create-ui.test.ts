import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { toCurrencyCode } from "@/money/currency";
import {
  compatibleRecurringCategories,
  createRecurringDraft,
  mapRecurringCreateFailure,
  recurringCreateDirections,
  validateRecurringDraft,
} from "@/modules/recurring/ui/components/recurring-create-flow";
import { RecurringTypeSelector } from "@/modules/recurring/ui/components/recurring-type-selector";
import { getRecurringUiLabels } from "@/modules/recurring/ui/recurring-ui-labels";

const accounts = [{
  id: "account-main",
  name: "Main account",
  currency: toCurrencyCode("XAF"),
  availableBalanceMinor: "150000",
}];

const categories = [
  { id: "expense-entertainment", name: "Entertainment", kind: "EXPENSE" as const, systemKey: "expense:entertainment" },
  { id: "income-salary", name: "Salary", kind: "INCOME" as const, systemKey: "income:salary" },
];

test("manual recurring validation creates exact minor-unit payloads for expenses and incomes", () => {
  const expense = {
    ...createRecurringDraft("2026-09-28"),
    amount: "6500",
    name: "Netflix",
    merchantOrSource: "Netflix",
    accountId: "account-main",
    categoryId: "expense-entertainment",
  };
  const expenseResult = validateRecurringDraft(expense, accounts, categories);
  assert.equal(expenseResult.isValid, true);
  if (expenseResult.isValid) {
    assert.equal(expenseResult.amountMinor, "6500");
    assert.equal(expenseResult.currency, toCurrencyCode("XAF"));
  }

  const income = { ...expense, direction: "INCOME" as const, name: "Salary", merchantOrSource: "Employer", categoryId: "income-salary" };
  assert.equal(validateRecurringDraft(income, accounts, categories).isValid, true);
});

test("recurring creation validates only safe form constraints and uses real compatible categories", () => {
  const invalid = validateRecurringDraft({
    ...createRecurringDraft("2026-02-30"),
    amount: "0",
    name: " ",
    accountId: "missing-account",
    categoryId: "income-salary",
  }, accounts, categories);
  assert.equal(invalid.isValid, false);
  if (!invalid.isValid) {
    assert.equal(invalid.errors.name, "nameRequired");
    assert.equal(invalid.errors.amount, "amountPositive");
    assert.equal(invalid.errors.account, "accountUnavailable");
    assert.equal(invalid.errors.category, "categoryUnavailable");
    assert.equal(invalid.errors.nextOccurrence, "nextOccurrence");
  }
  assert.deepEqual(compatibleRecurringCategories(categories, "EXPENSE").map((category) => category.id), ["expense-entertainment"]);
  assert.deepEqual(compatibleRecurringCategories(categories, "INCOME").map((category) => category.id), ["income-salary"]);
});

test("the recurring selector mirrors Pace interaction quality without inventing transfer support", () => {
  const markup = renderToStaticMarkup(createElement(RecurringTypeSelector, {
    labels: { ariaLabel: "Recurring type", expense: "Expense", income: "Income" },
    onValueChange: () => undefined,
    value: "EXPENSE",
  }));
  assert.deepEqual(recurringCreateDirections, ["EXPENSE", "INCOME"]);
  assert.match(markup, /role="radiogroup"/);
  assert.match(markup, /Expense/);
  assert.match(markup, /Income/);
  assert.doesNotMatch(markup, /Transfer/);
});

test("recurring creation labels and server failures are localized without exposing raw domain errors", () => {
  assert.equal(getRecurringUiLabels(getDashboardLabels("en")).create.title, "Add recurring");
  assert.equal(getRecurringUiLabels(getDashboardLabels("fr")).create.confirm, "Ajouter un récurrent");
  assert.equal(getRecurringUiLabels(getDashboardLabels("de")).create.frequencyMonthly, "Monatlich");
  assert.equal(mapRecurringCreateFailure("ACCOUNT_UNAVAILABLE"), "account");
  assert.equal(mapRecurringCreateFailure("INVALID_RECURRING_CATEGORY"), "category");
  assert.equal(mapRecurringCreateFailure("INTERNAL_DATABASE_ERROR"), null);
});
