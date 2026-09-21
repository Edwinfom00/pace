import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { toCurrencyCode } from "@/money/currency";
import { TransactionTransferForm } from "@/modules/transactions/ui/components/transaction-transfer-form";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";

const labels = getTransactionUiLabels(getDashboardLabels("en"));

function transferFormMarkup(accountCount: 0 | 1 | 2) {
  const accounts = [
    { id: "account-one", name: "Everyday", currency: toCurrencyCode("XAF") },
    { id: "account-two", name: "Savings", currency: toCurrencyCode("XAF") },
  ].slice(0, accountCount);

  return renderToStaticMarkup(createElement(TransactionTransferForm, {
    accountAvailability: "ready",
    accountLoadError: labels.accountLoadError,
    accountLoadingLabel: labels.accountLoading,
    accountRetryLabel: labels.errorRetry,
    accounts,
    draft: {
      amount: "",
      currency: toCurrencyCode("XAF"),
      date: new Date("2026-09-17T12:00:00.000Z"),
      fromAccount: "",
      note: "",
      time: "",
      toAccount: "",
    },
    fromAccountTriggerRef: { current: null },
    labels,
    language: "en",
    locale: "en-US",
    onCreateAccount: () => undefined,
    onDraftChange: () => undefined,
    onRetryAccounts: () => undefined,
    toAccountTriggerRef: { current: null },
    timeZone: "UTC",
  }));
}

test("a transfer is blocked with an accessible canonical Create Account action until two eligible accounts are available", () => {
  const empty = transferFormMarkup(0);
  const oneAccount = transferFormMarkup(1);
  const twoAccounts = transferFormMarkup(2);

  assert.match(empty, /You need at least two accounts to make a transfer/);
  assert.match(oneAccount, /Add account/);
  assert.match(oneAccount, /role="status"/);
  assert.doesNotMatch(twoAccounts, /You need at least two accounts to make a transfer/);
  assert.match(twoAccounts, /From account/);
  assert.match(twoAccounts, /To account/);
});

test("the transfer blocked-state copy is available in English, French, and German", () => {
  assert.equal(getTransactionUiLabels(getDashboardLabels("en")).transferAddAnotherAccount, "Add account");
  assert.equal(getTransactionUiLabels(getDashboardLabels("fr")).transferAddAnotherAccount, "Ajouter un compte");
  assert.equal(getTransactionUiLabels(getDashboardLabels("de")).transferAddAnotherAccount, "Konto hinzufügen");
});
