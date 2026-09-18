import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";
import type { TransactionCategoryOption } from "@/modules/transactions/domain/transaction-category-options";
import { EditTransactionForm } from "@/modules/transactions/ui/components/edit-transaction-form";
import {
  createTransactionEditCommand,
  createTransactionEditDraft,
  isTransactionEditDirty,
  mapTransactionEditFailure,
  validateTransactionEditDraft,
} from "@/modules/transactions/ui/components/transaction-edit-flow";
import { getTransactionEditLabels } from "@/modules/transactions/ui/transaction-edit-labels";

const categories: readonly TransactionCategoryOption[] = [
  { id: "expense-groceries", name: "Groceries", kind: "EXPENSE", systemKey: "expense:groceries" },
  { id: "income-salary", name: "Salary", kind: "INCOME", systemKey: "income:salary" },
];

function transaction(overrides: Partial<TransactionDetailData> = {}): TransactionDetailData {
  return {
    id: "00000000-0000-4000-8000-000000000011",
    kind: "EXPENSE",
    status: "POSTED",
    amount: { currency: "XAF", minor: "24850" },
    occurredAt: "2026-09-18T09:30:00.000Z",
    createdAt: "2026-09-18T09:30:00.000Z",
    updatedAt: "2026-09-18T09:30:00.000Z",
    note: "Original note",
    merchant: { id: "merchant-1", name: "Santa Lucia", iconKey: null, merchantLogoKey: null },
    category: { id: "expense-groceries", name: "Groceries", systemKey: "expense:groceries" },
    account: { id: "account-1", name: "Main account", currency: "XAF" },
    transferAccount: null,
    source: { origin: "MANUAL", channel: "WEB" },
    capabilities: {
      canEdit: true,
      canRefund: true,
      canReverse: false,
      canDelete: false,
      canViewTechnicalDetails: true,
      reasons: { reverse: "REVERSAL_NOT_SUPPORTED", delete: "DELETE_NOT_SUPPORTED" },
    },
    context: { accountImpacts: [], monthlyCategory: null },
    ...overrides,
  };
}

const labels = getTransactionEditLabels(getDashboardLabels("en"));
const timeZone = "Africa/Douala";

test("expense edit drafts prefill authoritative detail values and only submit changed safe fields", () => {
  const expense = transaction();
  const draft = createTransactionEditDraft(expense, timeZone);

  assert.equal(draft.counterparty, "Santa Lucia");
  assert.equal(draft.categoryId, "expense-groceries");
  assert.equal(draft.date.toISOString(), "2026-09-18T12:00:00.000Z");
  assert.equal(draft.time, "10:30");
  assert.equal(draft.note, "Original note");
  assert.equal(isTransactionEditDirty(expense, timeZone, draft), false);

  const command = createTransactionEditCommand("workspace-1", expense, timeZone, {
    ...draft,
    counterparty: "  New merchant  ",
    categoryId: "",
    note: "",
  });
  assert.deepEqual(command, {
    workspaceId: "workspace-1",
    transactionId: expense.id,
    expectedUpdatedAt: expense.updatedAt,
    patch: { merchant: "New merchant", categoryId: null, note: null },
  });
  assert.doesNotMatch(JSON.stringify(command.patch), /amount|currency|account|kind|status|workspace/i);
});

test("income maps its editable counterparty to source and rejects expense-only categories in client validation", () => {
  const income = transaction({
    kind: "INCOME",
    category: { id: "income-salary", name: "Salary", systemKey: "income:salary" },
    merchant: { id: "merchant-2", name: "Client North", iconKey: null, merchantLogoKey: null },
  });
  const draft = createTransactionEditDraft(income, timeZone);
  const command = createTransactionEditCommand("workspace-1", income, timeZone, { ...draft, counterparty: "Client South" });

  assert.deepEqual(command.patch, { source: "Client South" });
  assert.deepEqual(
    validateTransactionEditDraft(income, { ...draft, categoryId: "expense-groceries" }, categories, labels),
    { category: labels.invalidCategory },
  );
});

test("transfer exposes and submits only its safe date, time, and note details", () => {
  const transfer = transaction({
    kind: "TRANSFER",
    merchant: null,
    category: null,
    transferAccount: { id: "account-2", name: "Savings", currency: "XAF" },
    capabilities: {
      canEdit: true,
      canRefund: false,
      canReverse: false,
      canDelete: false,
      canViewTechnicalDetails: true,
      reasons: { refund: "REFUND_NOT_APPLICABLE", reverse: "REVERSAL_NOT_SUPPORTED", delete: "DELETE_NOT_SUPPORTED" },
    },
  });
  const draft = createTransactionEditDraft(transfer, timeZone);
  const command = createTransactionEditCommand("workspace-1", transfer, timeZone, {
    ...draft,
    date: new Date("2026-09-20T12:00:00.000Z"),
    time: "08:15",
    note: "Move funds",
    counterparty: "Must never be sent",
    categoryId: "expense-groceries",
  });

  assert.deepEqual(command.patch, {
    occurredAt: { date: "2026-09-20", time: "08:15" },
    note: "Move funds",
  });
});

test("type-aware form renders no financial controls and keeps Transfer free of category or counterparty fields", () => {
  const expense = transaction();
  const expenseDraft = createTransactionEditDraft(expense, timeZone);
  const expenseMarkup = renderToStaticMarkup(createElement(EditTransactionForm, {
    categories,
    draft: expenseDraft,
    errors: {},
    formError: null,
    isDirty: false,
    isSaving: false,
    labels,
    locale: "en-US",
    onCancel: () => undefined,
    onDraftChange: () => undefined,
    onReload: () => undefined,
    onSubmit: () => undefined,
    timeZone,
    transaction: expense,
  }));
  assert.match(expenseMarkup, /Merchant/);
  assert.match(expenseMarkup, /Category/);
  assert.match(expenseMarkup, /Read only/);
  assert.match(expenseMarkup, /Make a change to save/);
  assert.doesNotMatch(expenseMarkup, /name="(?:amount|currency|account|kind|status)"/);

  const transfer = transaction({ kind: "TRANSFER", merchant: null, category: null, transferAccount: { id: "account-2", name: "Savings", currency: "XAF" } });
  const transferMarkup = renderToStaticMarkup(createElement(EditTransactionForm, {
    categories,
    draft: createTransactionEditDraft(transfer, timeZone),
    errors: {},
    formError: null,
    isDirty: true,
    isSaving: false,
    labels,
    locale: "en-US",
    onCancel: () => undefined,
    onDraftChange: () => undefined,
    onReload: () => undefined,
    onSubmit: () => undefined,
    timeZone,
    transaction: transfer,
  }));
  assert.match(transferMarkup, /From account/);
  assert.match(transferMarkup, /To account/);
  assert.doesNotMatch(transferMarkup, /Merchant|Category|Source/);
});

test("server failures map to safe fields or a non-overwriting conflict state", () => {
  assert.deepEqual(mapTransactionEditFailure("CATEGORY_NOT_ALLOWED"), { fieldErrors: { category: "category" }, formError: null });
  assert.deepEqual(mapTransactionEditFailure("INVALID_COUNTERPARTY"), { fieldErrors: { counterparty: "counterparty" }, formError: null });
  assert.deepEqual(mapTransactionEditFailure("CONCURRENT_MODIFICATION"), { fieldErrors: {}, formError: "concurrent" });
  assert.deepEqual(mapTransactionEditFailure("TRANSACTION_EDIT_NOT_ALLOWED"), { fieldErrors: {}, formError: "notAllowed" });
  assert.deepEqual(mapTransactionEditFailure("UNEXPECTED"), { fieldErrors: {}, formError: "failed" });
});

test("Edit dialog labels are complete in English, French, and German", () => {
  for (const language of ["en", "fr", "de"] as const) {
    const translated = getTransactionEditLabels(getDashboardLabels(language));
    assert.ok(translated.title.length > 0, language);
    assert.ok(translated.concurrentModification.length > 0, language);
    assert.ok(translated.save.length > 0, language);
  }
});
