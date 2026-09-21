import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { toCurrencyCode } from "@/money/currency";
import type { TransactionAccountOption } from "@/modules/transactions/domain/transaction-account-options";
import { validateTransactionDraft } from "@/modules/transactions/ui/components/transaction-create-control";
import { mapExpenseCreateFailure } from "@/modules/transactions/ui/components/expense-create-flow";
import { TransactionAccountField } from "@/modules/transactions/ui/components/transaction-account-field";
import {
  parseInsufficientFundsDetails,
  validateOutgoingBalance,
} from "@/modules/transactions/ui/components/transaction-balance";
import { TransactionBalanceHint } from "@/modules/transactions/ui/components/transaction-balance-hint";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";

const labels = getTransactionUiLabels(getDashboardLabels("en"));
const account: TransactionAccountOption = {
  id: "account-main",
  name: "Main account",
  currency: toCurrencyCode("XAF"),
  type: "CHECKING",
  currentBalanceMinor: "1500",
  availableBalanceMinor: "1500",
  spendabilityMode: "ZERO_FLOOR",
};

const richAccount: TransactionAccountOption = {
  ...account,
  id: "account-rich",
  name: "MTN MoMo",
  currentBalanceMinor: "5000",
  availableBalanceMinor: "5000",
};

const date = new Date("2026-09-21T12:00:00.000Z");

function draft(overrides: Partial<{
  amount: string;
  account: string;
  currency: ReturnType<typeof toCurrencyCode>;
  fromAccount: string;
  toAccount: string;
}> = {}) {
  const currency = overrides.currency ?? toCurrencyCode("XAF");
  return {
    kind: "EXPENSE" as const,
    expense: {
      amount: overrides.amount ?? "1500",
      account: overrides.account ?? account.id,
      category: "",
      currency,
      date,
      merchant: "",
      note: "",
      time: "",
    },
    income: { amount: "", account: "", category: "", currency, date, note: "", source: "", time: "" },
    transfer: {
      amount: overrides.amount ?? "1500",
      currency,
      date,
      fromAccount: overrides.fromAccount ?? account.id,
      note: "",
      time: "",
      toAccount: overrides.toAccount ?? richAccount.id,
    },
  };
}

test("same-currency preflight permits exact available balance and rejects only overspend", () => {
  assert.equal(validateOutgoingBalance({ account, accountAvailability: "ready", amount: "1500", currency: "XAF" }).status, "valid");
  assert.equal(validateOutgoingBalance({ account, accountAvailability: "ready", amount: "1501", currency: "XAF" }).status, "insufficient");
  assert.equal(validateOutgoingBalance({ account, accountAvailability: "ready", amount: "1400", currency: "XAF" }).status, "valid");

  assert.equal(
    validateTransactionDraft(draft(), [account, richAccount], [], { accountAvailability: "ready" }).isValid,
    true,
  );
  assert.equal(
    validateTransactionDraft(draft({ amount: "1501" }), [account, richAccount], [], { accountAvailability: "ready" }).errors.amount,
    "transactions.validation.insufficientFunds",
  );
  assert.equal(
    validateTransactionDraft(draft({ account: richAccount.id, amount: "1501" }), [account, richAccount], [], { accountAvailability: "ready" }).isValid,
    true,
  );
});

test("transfer checks only its source and never compares different currencies", () => {
  const transfer = { ...draft({ amount: "1501" }), kind: "TRANSFER" as const };
  assert.equal(
    validateTransactionDraft(transfer, [account, richAccount], [], { accountAvailability: "ready" }).errors.amount,
    "transactions.validation.insufficientFunds",
  );

  const euroDraft = draft({ currency: toCurrencyCode("EUR"), amount: "1501" });
  assert.notEqual(
    validateTransactionDraft(euroDraft, [account], [], { accountAvailability: "ready" }).errors.amount,
    "transactions.validation.insufficientFunds",
  );
});

test("the selector and selected hint expose exact authoritative balances without a loading zero", () => {
  const field = renderToStaticMarkup(createElement(TransactionAccountField, {
    accounts: [account],
    availability: "ready" as const,
    balanceKind: "available" as const,
    balanceLabels: labels.balance,
    createAccountLabel: "Create account",
    createFirstAccountLabel: "Create first account",
    emptyDescription: "",
    emptyTitle: "",
    label: "Account",
    locale: "en-US",
    noResultsLabel: "No accounts",
    onValueChange: () => undefined,
    placeholder: "Choose an account",
    searchPlaceholder: "Search accounts",
    value: account.id,
  }));
  const hint = renderToStaticMarkup(createElement(TransactionBalanceHint, {
    account,
    amount: "1000",
    balanceKind: "available" as const,
    direction: "debit" as const,
    labels: labels.balance,
    locale: "en-US",
  }));

  assert.match(field, /Main account/);
  assert.match(hint, /Available.*1,500/);
  assert.match(hint, /After transaction.*500/);
  assert.doesNotMatch(field, /0 XAF/);
});

test("structured insufficient-funds conflicts retain canonical details for stale-balance feedback", () => {
  const payload = {
    code: "INSUFFICIENT_FUNDS",
    details: {
      accountId: account.id,
      availableBalanceMinor: "500",
      currency: "XAF",
      requiredAmountMinor: "1000",
    },
  };
  assert.deepEqual(parseInsufficientFundsDetails(payload), payload.details);
  assert.deepEqual(mapExpenseCreateFailure("INSUFFICIENT_FUNDS", payload), {
    code: "INSUFFICIENT_FUNDS",
    field: "amount",
    insufficientFunds: payload.details,
  });
});

test("balance copy is serializable and complete in English, French, and German", () => {
  for (const language of ["en", "fr", "de"] as const) {
    const translated = getTransactionUiLabels(getDashboardLabels(language));
    assert.equal(typeof translated.balance.availableInAccount, "string");
    assert.equal(typeof translated.balance.balanceChanged, "string");
    assert.ok(translated.balance.unableToVerify.length > 0);
  }
});
