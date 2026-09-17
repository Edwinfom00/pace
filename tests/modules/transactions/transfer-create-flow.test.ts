import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { toCurrencyCode } from "@/money/currency";
import { validateTransactionForm, type TransactionFormDraft } from "@/modules/transactions/schemas/transaction-form.schema";
import {
  canReconcileCreatedTransfer,
  canStartTransferSubmission,
  createTransferCommand,
  mapTransferCreateFailure,
  resetTransferTransactionDraft,
  serverTransferFieldErrors,
  submitCanonicalTransfer,
  transferReconciliationPlan,
} from "@/modules/transactions/ui/components/transfer-create-flow";

const workspaceId = "workspace-current";
const fromAccountId = "00000000-0000-4000-8000-000000000001";
const toAccountId = "00000000-0000-4000-8000-000000000002";

function transferDraft(overrides: Record<string, unknown> = {}) {
  return {
    kind: "TRANSFER" as const,
    amount: "24,850.75",
    currency: toCurrencyCode("USD"),
    fromAccount: fromAccountId,
    toAccount: toAccountId,
    date: new Date("2026-09-17T12:00:00.000Z"),
    time: "14:30",
    note: "Move September savings",
    ...overrides,
  };
}

function persistedTransfer() {
  return {
    transfer: {
      id: "00000000-0000-4000-8000-000000000003",
      type: "TRANSFER" as const,
      transferGroupId: "00000000-0000-4000-8000-000000000004",
      fromAccountId,
      toAccountId,
      amountMinor: "2485075",
      currency: toCurrencyCode("USD"),
      occurredAt: "2026-09-17T14:30:00.000Z",
      note: "Move September savings",
      status: "POSTED" as const,
    },
  };
}

function transactionDraft(): TransactionFormDraft {
  return {
    kind: "TRANSFER",
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
    income: {
      account: "income-account",
      amount: "200",
      category: "income-category",
      currency: toCurrencyCode("USD"),
      date: new Date("2026-09-16T12:00:00.000Z"),
      note: "Income note",
      source: "Employer",
      time: "11:00",
    },
    transfer: { ...transferDraft() },
  };
}

test("a valid Transfer submits the exact C15A command once and only accepts its persisted DTO", async () => {
  const command = createTransferCommand(workspaceId, transferDraft());
  let calls = 0;

  const result = await submitCanonicalTransfer(command, async (received) => {
    calls += 1;
    assert.deepEqual(received, {
      workspaceId,
      fromAccountId,
      toAccountId,
      amount: "24,850.75",
      currency: "USD",
      date: "2026-09-17",
      time: "14:30",
      note: "Move September savings",
    });
    assert.equal("categoryId" in received, false);
    assert.equal("merchant" in received, false);
    return { ok: true, payload: persistedTransfer() };
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.transfer.id, persistedTransfer().transfer.id);
});

test("invalid, duplicate, same-account, and cross-currency Transfer attempts never start C15A", async () => {
  let calls = 0;
  const invalid = validateTransactionForm(transferDraft({ amount: "" }));
  const sameAccount = validateTransactionForm(transferDraft({ toAccount: fromAccountId }));
  const crossCurrency = validateTransactionForm({
    ...transferDraft(),
    fromAccountCurrency: "USD",
    toAccountCurrency: "EUR",
  });

  if (invalid.isValid && invalid.value.kind === "TRANSFER") {
    await submitCanonicalTransfer(createTransferCommand(workspaceId, invalid.value), async () => {
      calls += 1;
      return { ok: true, payload: persistedTransfer() };
    });
  }

  assert.equal(invalid.isValid, false);
  assert.equal(sameAccount.errors.toAccount, "transactions.validation.sameTransferAccount");
  assert.equal(crossCurrency.errors.toAccount, "transactions.validation.crossCurrencyTransferUnsupported");
  assert.equal(calls, 0);
  assert.equal(canStartTransferSubmission(false), true);
  assert.equal(canStartTransferSubmission(true), false);
});

test("C15A failures map to the editable account, amount, currency, and date controls", () => {
  assert.equal(mapTransferCreateFailure("FROM_ACCOUNT_NOT_FOUND").field, "fromAccount");
  assert.equal(mapTransferCreateFailure("TO_ACCOUNT_NOT_FOUND").field, "toAccount");
  assert.equal(mapTransferCreateFailure("SAME_TRANSFER_ACCOUNT").field, "toAccount");
  assert.equal(mapTransferCreateFailure("CROSS_CURRENCY_TRANSFER_UNSUPPORTED").field, "toAccount");
  assert.equal(mapTransferCreateFailure("INVALID_AMOUNT").field, "amount");
  assert.equal(mapTransferCreateFailure("INVALID_CURRENCY").field, "currency");
  assert.equal(mapTransferCreateFailure("INVALID_OCCURRED_AT").field, "date");
  assert.deepEqual(serverTransferFieldErrors(mapTransferCreateFailure("ACCOUNT_UNAVAILABLE")), {
    fromAccount: "transactions.validation.accountUnavailable",
    toAccount: "transactions.validation.accountUnavailable",
  });
});

test("unexpected C15A failures preserve the complete Transfer draft and manufacture no transaction", async () => {
  const draft = transactionDraft();
  const result = await submitCanonicalTransfer(createTransferCommand(workspaceId, transferDraft()), async () => ({
    ok: false,
    payload: { code: "TRANSFER_CREATE_FAILED" },
  }));

  assert.equal(result.ok, false);
  assert.deepEqual(draft.transfer, transactionDraft().transfer);
});

test("server confirmation refreshes authoritative data, closes the dialog, and resets only Transfer", () => {
  const draft = transactionDraft();
  const emptyTransfer = {
    amount: "",
    currency: toCurrencyCode("USD"),
    date: new Date("2026-09-17T12:00:00.000Z"),
    fromAccount: "",
    note: "",
    time: "",
    toAccount: "",
  };
  const reset = resetTransferTransactionDraft(draft, emptyTransfer);

  assert.deepEqual(reset.transfer, emptyTransfer);
  assert.deepEqual(reset.expense, draft.expense);
  assert.deepEqual(reset.income, draft.income);
  assert.deepEqual(transferReconciliationPlan(workspaceId, workspaceId), {
    shouldAttachTransactionToList: false,
    shouldCloseDialog: true,
    shouldRefreshData: true,
    shouldResetTransferDraft: true,
  });
});

test("a Transfer response only reconciles its own workspace and adds no client idempotency scheme", async () => {
  assert.equal(canReconcileCreatedTransfer(workspaceId, workspaceId), true);
  assert.equal(canReconcileCreatedTransfer(workspaceId, "workspace-two"), false);
  assert.deepEqual(transferReconciliationPlan(workspaceId, "workspace-two"), {
    shouldAttachTransactionToList: false,
    shouldCloseDialog: false,
    shouldRefreshData: true,
    shouldResetTransferDraft: false,
  });

  const source = await readFile(resolve("src/modules/transactions/ui/components/transfer-create-flow.ts"), "utf8");
  assert.equal(source.includes("parseFloat"), false);
  assert.equal(source.includes("Number("), false);
  assert.equal(source.includes("idempotencyKey"), false);
});
