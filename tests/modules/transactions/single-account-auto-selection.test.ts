import assert from "node:assert/strict";
import test from "node:test";

import { toCurrencyCode } from "@/money/currency";
import type { TransactionAccountOption } from "@/modules/transactions/domain/transaction-account-options";
import {
  autoSelectSoleEligibleTransactionAccount,
  changeTransactionFormKind,
  clearUnavailableTransactionAccountSelections,
  createTransactionFormDraft,
} from "@/modules/transactions/ui/components/transaction-create-control";

const zeroBalanceAccount: TransactionAccountOption = {
  id: "account-renamed",
  name: "Renamed everyday account",
  currency: toCurrencyCode("XAF"),
  type: "CHECKING",
  currentBalanceMinor: "0",
  availableBalanceMinor: "0",
  spendabilityMode: "ZERO_FLOOR",
};

const secondAccount: TransactionAccountOption = {
  id: "account-mobile-money",
  name: "Mobile money",
  currency: toCurrencyCode("XAF"),
  type: "MOBILE_MONEY",
  currentBalanceMinor: "150000",
  availableBalanceMinor: "150000",
  spendabilityMode: "ZERO_FLOOR",
};

function freshDraft() {
  return createTransactionFormDraft(toCurrencyCode("XAF"), "UTC");
}

test("a fresh Expense or Income draft selects exactly one canonical eligible account, including a zero-balance account", () => {
  const expense = autoSelectSoleEligibleTransactionAccount(freshDraft(), [zeroBalanceAccount]);
  const income = autoSelectSoleEligibleTransactionAccount({ ...freshDraft(), kind: "INCOME" }, [zeroBalanceAccount]);

  assert.equal(expense.expense.account, zeroBalanceAccount.id);
  assert.equal(expense.expense.currency, toCurrencyCode("XAF"));
  assert.equal(expense.transfer.fromAccount, "");
  assert.equal(income.income.account, zeroBalanceAccount.id);
  assert.equal(income.income.currency, toCurrencyCode("XAF"));
});

test("multiple canonical eligible accounts never produce a guessed Expense or Income selection", () => {
  const expense = autoSelectSoleEligibleTransactionAccount(freshDraft(), [zeroBalanceAccount, secondAccount]);
  const income = autoSelectSoleEligibleTransactionAccount({ ...freshDraft(), kind: "INCOME" }, [zeroBalanceAccount, secondAccount]);

  assert.equal(expense.expense.account, "");
  assert.equal(income.income.account, "");
});

test("an explicit account selection is preserved through unrelated draft changes and never replaced by the one-account helper", () => {
  const base = freshDraft();
  const draft = {
    ...base,
    expense: {
      ...base.expense,
      account: secondAccount.id,
      amount: "5000",
      category: "expense-category",
      merchant: "Market",
    },
  };

  const unchanged = autoSelectSoleEligibleTransactionAccount(draft, [zeroBalanceAccount, secondAccount]);
  assert.equal(unchanged.expense.account, secondAccount.id);
  assert.equal(unchanged.expense.amount, "5000");
  assert.equal(unchanged.expense.category, "expense-category");
  assert.equal(unchanged.expense.merchant, "Market");
});

test("archiving an account clears stale in-form selections; fresh drafts use the remaining account and stop doing so after restore", () => {
  const base = freshDraft();
  const selected = {
    ...base,
    expense: { ...base.expense, account: zeroBalanceAccount.id },
  };
  const afterArchive = clearUnavailableTransactionAccountSelections(selected, [secondAccount]);
  const freshAfterArchive = autoSelectSoleEligibleTransactionAccount(freshDraft(), [secondAccount]);
  const freshAfterRestore = autoSelectSoleEligibleTransactionAccount(freshDraft(), [zeroBalanceAccount, secondAccount]);

  assert.equal(afterArchive.expense.account, "");
  assert.equal(freshAfterArchive.expense.account, secondAccount.id);
  assert.equal(freshAfterRestore.expense.account, "");
});

test("a workspace switch starts a fresh account-selection context before applying the one-account rule", () => {
  const workspaceADraft = {
    ...freshDraft(),
    expense: { ...freshDraft().expense, account: zeroBalanceAccount.id },
  };
  const clearedForWorkspaceB = clearUnavailableTransactionAccountSelections(workspaceADraft, [secondAccount]);
  const freshWorkspaceB = autoSelectSoleEligibleTransactionAccount(freshDraft(), [secondAccount]);

  assert.equal(clearedForWorkspaceB.expense.account, "");
  assert.equal(freshWorkspaceB.expense.account, secondAccount.id);
  assert.notEqual(freshWorkspaceB.expense.account, zeroBalanceAccount.id);
});

test("kind changes preserve a compatible Expense or Income selection but never infer a Transfer direction", () => {
  const base = freshDraft();
  const expense = {
    ...base,
    expense: { ...base.expense, account: zeroBalanceAccount.id, currency: zeroBalanceAccount.currency },
  };
  const asIncome = changeTransactionFormKind(expense, "EXPENSE", "INCOME", [zeroBalanceAccount, secondAccount]);
  const asTransfer = changeTransactionFormKind(expense, "EXPENSE", "TRANSFER", [zeroBalanceAccount, secondAccount]);
  const transferToExpense = changeTransactionFormKind(
    { ...freshDraft(), kind: "TRANSFER" },
    "TRANSFER",
    "EXPENSE",
    [zeroBalanceAccount],
  );

  assert.equal(asIncome.income.account, zeroBalanceAccount.id);
  assert.equal(asTransfer.transfer.fromAccount, "");
  assert.equal(asTransfer.transfer.toAccount, "");
  assert.equal(transferToExpense.expense.account, zeroBalanceAccount.id);
});
