import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { getCurrencySelectOptions } from "@/components/pace/forms/currency-select";
import {
  CURRENCY_CATALOG,
  getCurrencyExponent,
  listSupportedCurrencies,
  toCurrencyCode,
} from "@/money/currency";
import { createEmptyCreateAccountFormDraft } from "@/modules/transactions/ui/components/create-account-form";
import {
  createTransactionFormDraft,
} from "@/modules/transactions/ui/components/transaction-create-control";
import { getTransactionCurrencyOptions } from "@/modules/transactions/ui/components/transaction-currency-selector";
import { workspacePreferencesSchema } from "@/modules/workspaces/validation";

test("transaction and account pickers read the single canonical Pace currency catalogue", () => {
  const catalogueCodes = CURRENCY_CATALOG.map((currency) => currency.code);
  const xaf = CURRENCY_CATALOG.find((currency) => currency.code === toCurrencyCode("XAF"));
  const eur = CURRENCY_CATALOG.find((currency) => currency.code === toCurrencyCode("EUR"));
  const usd = CURRENCY_CATALOG.find((currency) => currency.code === toCurrencyCode("USD"));

  assert.deepEqual(listSupportedCurrencies(), catalogueCodes);
  assert.ok(xaf);
  assert.ok(eur);
  assert.ok(usd);
  assert.equal(xaf.minorUnits, 0);
  assert.equal(eur.minorUnits, 2);
  assert.equal(usd.minorUnits, 2);
  assert.equal(getCurrencyExponent(xaf.code), xaf.minorUnits);
  assert.equal(getCurrencyExponent(eur.code), eur.minorUnits);
  assert.equal(getCurrencyExponent(usd.code), usd.minorUnits);
  assert.equal(typeof xaf.symbol, "string");
  assert.equal(typeof eur.englishName, "string");

  assert.deepEqual(getTransactionCurrencyOptions("en").map((currency) => currency.code), catalogueCodes);
  assert.deepEqual(getCurrencySelectOptions("en").map((option) => option.value), catalogueCodes);
});

test("the active workspace currency initializes each transaction kind and Create Account draft", () => {
  const workspaceCurrency = toCurrencyCode("EUR");
  const transaction = createTransactionFormDraft(workspaceCurrency, "Europe/Paris");
  const account = createEmptyCreateAccountFormDraft(workspaceCurrency);

  assert.equal(transaction.expense.currency, workspaceCurrency);
  assert.equal(transaction.income.currency, workspaceCurrency);
  assert.equal(transaction.transfer.currency, workspaceCurrency);
  assert.equal(account.currency, workspaceCurrency);
  assert.notEqual(transaction.expense.currency, toCurrencyCode("XAF"));

  assert.equal(workspacePreferencesSchema.safeParse({ currency: workspaceCurrency }).success, true);
  assert.equal(workspacePreferencesSchema.safeParse({ currency: "ABC" }).success, false);
});

test("production transaction entry files do not import financial fixture modules", async () => {
  const productionFiles = [
    "src/app/w/[workspaceSlug]/transactions/page.tsx",
    "src/modules/transactions/ui/components/transaction-create-control.tsx",
    "src/modules/transactions/ui/components/create-account-form.tsx",
  ];
  const sources = await Promise.all(productionFiles.map((file) => readFile(resolve(file), "utf8")));

  for (const source of sources) {
    assert.doesNotMatch(source, /(?:from|import)[^\n]*(?:fixtures?|mocks?|demos?)/i);
  }
});
