import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { toCurrencyCode } from "@/money/currency";
import type { CreatedAccountDTO } from "@/modules/ledger/create-account-contract";
import { validateTransactionDraft } from "@/modules/transactions/ui/components/transaction-create-control";
import {
  canAttachCreatedAccountToWorkspace,
  canStartCreateAccountSubmission,
  mapCreateAccountFailure,
  parseCreatedAccountDTO,
  reconcileTransactionAccountOptions,
  selectCreatedAccountForTarget,
  validateCreateAccountForm,
} from "@/modules/transactions/ui/components/create-account-flow";
import { createEmptyCreateAccountFormDraft } from "@/modules/transactions/ui/components/create-account-form";
import { createTransactionFormDraft } from "@/modules/transactions/ui/components/transaction-create-control";

const workspaceId = "workspace-current";
const createdAccount: CreatedAccountDTO = {
  id: "db-account-9f2c",
  name: "MTN MoMo",
  type: "MOBILE_MONEY",
  currency: toCurrencyCode("XAF"),
};

function transactionDraft() {
  const draft = createTransactionFormDraft(toCurrencyCode("USD"), "UTC");
  return {
    ...draft,
    expense: {
      ...draft.expense,
      amount: "42.00",
      category: "expense-category",
      merchant: "Market",
      note: "Keep this expense draft",
      time: "10:15",
    },
    income: {
      ...draft.income,
      amount: "500",
      category: "income-category",
      note: "Keep this income draft",
      source: "Employer",
      time: "09:00",
    },
    transfer: {
      ...draft.transfer,
      amount: "25",
      note: "Keep this transfer draft",
      time: "11:30",
    },
  };
}

test("Expense and Income account creation select the returned real ID without losing their drafts", () => {
  const draft = transactionDraft();
  const expense = selectCreatedAccountForTarget(draft, "EXPENSE_ACCOUNT", createdAccount, []);
  const income = selectCreatedAccountForTarget(draft, "INCOME_ACCOUNT", createdAccount, []);

  assert.equal(expense.expense.account, "db-account-9f2c");
  assert.equal(expense.expense.currency, toCurrencyCode("XAF"));
  assert.equal(expense.expense.amount, "42.00");
  assert.equal(expense.expense.merchant, "Market");
  assert.equal(expense.expense.note, "Keep this expense draft");
  assert.equal(income.income.account, "db-account-9f2c");
  assert.equal(income.income.currency, toCurrencyCode("XAF"));
  assert.equal(income.income.amount, "500");
  assert.equal(income.income.source, "Employer");
  assert.equal(income.income.note, "Keep this income draft");
});

test("Transfer From and To account creation preserve the transfer and use real account IDs", () => {
  const draft = transactionDraft();
  const existingFrom = { id: "db-account-from", name: "Everyday", currency: toCurrencyCode("USD") };
  const from = selectCreatedAccountForTarget(draft, "TRANSFER_FROM", createdAccount, [existingFrom]);
  const to = selectCreatedAccountForTarget({ ...draft, transfer: { ...draft.transfer, fromAccount: existingFrom.id } }, "TRANSFER_TO", createdAccount, [existingFrom]);

  assert.equal(from.transfer.fromAccount, "db-account-9f2c");
  assert.equal(from.transfer.currency, toCurrencyCode("XAF"));
  assert.equal(from.transfer.amount, "25");
  assert.equal(from.transfer.note, "Keep this transfer draft");
  assert.equal(to.transfer.toAccount, "db-account-9f2c");
  assert.equal(to.transfer.fromAccount, "db-account-from");
  assert.equal(to.transfer.currency, toCurrencyCode("USD"));
  assert.equal(to.transfer.time, "11:30");
});

test("the created persisted DTO bridges the selector only until the authoritative account query catches up", () => {
  const initial = [{ id: "db-account-from", name: "Everyday", currency: toCurrencyCode("USD") }];
  const bridged = reconcileTransactionAccountOptions(initial, createdAccount);
  const refreshed = reconcileTransactionAccountOptions([...initial, { id: createdAccount.id, name: createdAccount.name, currency: createdAccount.currency }], createdAccount);

  assert.deepEqual(bridged.map((account) => account.id), ["db-account-from", "db-account-9f2c"]);
  assert.deepEqual(refreshed.map((account) => account.id), ["db-account-from", "db-account-9f2c"]);
  assert.equal(bridged[1]?.id, createdAccount.id);
});

test("Create Account uses the C12A schema and exact opening-balance parser in the browser", () => {
  const invalid = validateCreateAccountForm(workspaceId, {
    ...createEmptyCreateAccountFormDraft(toCurrencyCode("EUR")),
    name: "   ",
    openingBalance: "12.345",
  });
  const valid = validateCreateAccountForm(workspaceId, {
    ...createEmptyCreateAccountFormDraft(toCurrencyCode("EUR")),
    name: "Savings",
    type: "SAVINGS",
    openingBalance: "12.34",
  });

  assert.deepEqual(invalid, { name: true, type: true, openingBalance: true });
  assert.deepEqual(valid, {});
});

test("typed server failures stay in the account view and map to a safe field or form error", () => {
  assert.deepEqual(mapCreateAccountFailure("INVALID_ACCOUNT_NAME"), { code: "INVALID_ACCOUNT_NAME", field: "name" });
  assert.deepEqual(mapCreateAccountFailure("INVALID_ACCOUNT_TYPE"), { code: "INVALID_ACCOUNT_TYPE", field: "type" });
  assert.deepEqual(mapCreateAccountFailure("INVALID_CURRENCY"), { code: "INVALID_CURRENCY", field: "currency" });
  assert.deepEqual(mapCreateAccountFailure("INVALID_OPENING_BALANCE"), { code: "INVALID_OPENING_BALANCE", field: "openingBalance" });
  assert.deepEqual(mapCreateAccountFailure("WORKSPACE_FORBIDDEN"), { code: "WORKSPACE_FORBIDDEN" });
  assert.deepEqual(mapCreateAccountFailure("database constraint text"), { code: "ACCOUNT_CREATE_FAILED" });
});

test("pending and workspace-switch guards prevent duplicate or cross-workspace UI attachment", () => {
  assert.equal(canStartCreateAccountSubmission(false), true);
  assert.equal(canStartCreateAccountSubmission(true), false);
  assert.equal(canAttachCreatedAccountToWorkspace(workspaceId, workspaceId), true);
  assert.equal(canAttachCreatedAccountToWorkspace(workspaceId, "workspace-new"), false);
});

test("Transfer validation still rejects cross-currency and same-account real selections", () => {
  const draft = transactionDraft();
  const from = { id: "db-account-from", name: "Everyday", currency: toCurrencyCode("USD") };
  const crossCurrency = selectCreatedAccountForTarget(
    { ...draft, kind: "TRANSFER", transfer: { ...draft.transfer, fromAccount: from.id } },
    "TRANSFER_TO",
    createdAccount,
    [from],
  );
  const sameAccount = selectCreatedAccountForTarget(
    { ...draft, kind: "TRANSFER", transfer: { ...draft.transfer, fromAccount: from.id } },
    "TRANSFER_TO",
    { ...createdAccount, id: from.id },
    [from],
  );

  assert.equal(
    validateTransactionDraft(crossCurrency, [from, { id: createdAccount.id, name: createdAccount.name, currency: createdAccount.currency }], []).errors.toAccount,
    "transactions.validation.crossCurrencyTransferUnsupported",
  );
  assert.equal(validateTransactionDraft(sameAccount, [from], []).errors.toAccount, "transactions.validation.sameTransferAccount");
});

test("only a canonical persisted account response is accepted; no local pretend account paths remain", async () => {
  assert.deepEqual(parseCreatedAccountDTO({ account: createdAccount }), createdAccount);
  assert.equal(parseCreatedAccountDTO({ account: { ...createdAccount, id: 42 } }), null);

  const sources = await Promise.all([
    readFile(resolve("src/modules/transactions/ui/components/transaction-create-control.tsx"), "utf8"),
    readFile(resolve("src/modules/transactions/ui/components/create-account-form.tsx"), "utf8"),
  ]);
  const forbiddenTemporaryNames = [
    "Account" + "DraftOption",
    "temporary" + "Account",
    "local" + "CreatedAccount",
    "draft" + "Account",
    "mock" + "CreatedAccount",
  ];
  for (const source of sources) {
    for (const name of forbiddenTemporaryNames) assert.equal(source.includes(name), false);
  }
});
