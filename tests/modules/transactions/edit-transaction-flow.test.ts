import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { toCurrencyCode } from "@/money/currency";
import type { TransactionAccountOption } from "@/modules/transactions/domain/transaction-account-options";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";
import type { TransactionCategoryOption } from "@/modules/transactions/domain/transaction-category-options";
import { EditTransactionForm } from "@/modules/transactions/ui/components/edit-transaction-form";
import { TransactionCorrectionReview } from "@/modules/transactions/ui/components/transaction-correction-review";
import {
  classifyTransactionChanges,
  correctionReplacementTransactionId,
  createTransactionCorrectionCommand,
  createTransactionEditCommand,
  createTransactionEditDraft,
  getTransactionEditSubmissionIntent,
  isTransactionEditDirty,
  mapTransactionCorrectionFailure,
  mapTransactionCorrectionFailureForKind,
  mapTransactionEditFailure,
  validateTransactionEditDraft,
} from "@/modules/transactions/ui/components/transaction-edit-flow";
import { getTransactionEditLabels } from "@/modules/transactions/ui/transaction-edit-labels";

const categories: readonly TransactionCategoryOption[] = [
  { id: "expense-groceries", name: "Groceries", kind: "EXPENSE", systemKey: "expense:groceries" },
  { id: "expense-household", name: "Household", kind: "EXPENSE", systemKey: "expense:household" },
  { id: "income-salary", name: "Salary", kind: "INCOME", systemKey: "income:salary" },
];

const accounts: readonly TransactionAccountOption[] = [
  { id: "account-1", name: "Main account", currency: toCurrencyCode("XAF"), type: "CHECKING" },
  { id: "account-2", name: "Savings", currency: toCurrencyCode("XAF"), type: "SAVINGS" },
  { id: "account-3", name: "MTN MoMo", currency: toCurrencyCode("XAF"), type: "MOBILE_MONEY" },
  { id: "account-eur", name: "Euro account", currency: toCurrencyCode("EUR"), type: "CHECKING" },
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
    account: { id: "account-1", name: "Main account", currency: "XAF", type: "CHECKING" },
    transferAccount: null,
    source: { origin: "MANUAL", channel: "WEB" },
    capabilities: {
      canEdit: true,
      canCorrectFinancials: true,
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
const accountOptions = { status: "ready" as const, accounts };

test("expense edit drafts prefill authoritative detail values and only submit changed safe fields", () => {
  const expense = transaction();
  const draft = createTransactionEditDraft(expense, timeZone);

  assert.equal(draft.amount, "24850");
  assert.equal(draft.account, "account-1");
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
    transferAccount: { id: "account-2", name: "Savings", currency: "XAF", type: "SAVINGS" },
    capabilities: {
      canEdit: true,
      canCorrectFinancials: true,
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

test("financial correction commands send canonical financial IDs plus final replacement details", () => {
  const expense = transaction();
  const expenseBaseline = createTransactionEditDraft(expense, timeZone);
  const expenseDraft = {
    ...expenseBaseline,
    amount: "10000",
    account: "account-3",
    categoryId: "expense-household",
    counterparty: "Corrected purchase",
    note: "Corrected note",
  };
  assert.deepEqual(
    createTransactionCorrectionCommand(
      "workspace-1",
      expense,
      expenseBaseline,
      expenseDraft,
      "00000000-0000-4000-8000-000000000031",
      "  Receipt issue  ",
    ),
    {
      workspaceId: "workspace-1",
      transactionId: expense.id,
      expectedUpdatedAt: expense.updatedAt,
      idempotencyKey: "00000000-0000-4000-8000-000000000031",
      kind: "EXPENSE",
      financialChanges: { amountMinor: "10000", accountId: "account-3" },
      details: {
        note: "Corrected note",
        categoryId: "expense-household",
        merchant: "Corrected purchase",
      },
      reason: "Receipt issue",
    },
  );

  const income = transaction({
    kind: "INCOME",
    category: { id: "income-salary", name: "Salary", systemKey: "income:salary" },
    merchant: { id: "merchant-2", name: "Client North", iconKey: null, merchantLogoKey: null },
  });
  const incomeBaseline = createTransactionEditDraft(income, timeZone);
  const incomeCommand = createTransactionCorrectionCommand(
    "workspace-1",
    income,
    incomeBaseline,
    { ...incomeBaseline, account: "account-3", counterparty: "Client South" },
    "00000000-0000-4000-8000-000000000032",
    "",
  );
  assert.deepEqual(incomeCommand?.financialChanges, { accountId: "account-3" });
  assert.deepEqual(incomeCommand?.details, { source: "Client South" });

  const transfer = transaction({
    kind: "TRANSFER",
    merchant: null,
    category: null,
    transferAccount: { id: "account-2", name: "Savings", currency: "XAF", type: "SAVINGS" },
  });
  const transferBaseline = createTransactionEditDraft(transfer, timeZone);
  const transferCommand = createTransactionCorrectionCommand(
    "workspace-1",
    transfer,
    transferBaseline,
    { ...transferBaseline, amount: "5000", fromAccount: "account-3", note: "Corrected transfer" },
    "00000000-0000-4000-8000-000000000033",
    "",
  );
  assert.deepEqual(transferCommand?.financialChanges, { amountMinor: "5000", fromAccountId: "account-3" });
  assert.deepEqual(transferCommand?.details, { note: "Corrected transfer" });
  assert.doesNotMatch(JSON.stringify(transferCommand), /category|merchant|source/);
  assert.equal(
    createTransactionCorrectionCommand(
      "workspace-1",
      expense,
      expenseBaseline,
      { ...expenseBaseline, note: "Only metadata" },
      "00000000-0000-4000-8000-000000000034",
      "",
    ),
    null,
  );
});

test("the change classifier separates metadata and financial fields using normalized canonical money", () => {
  const expense = transaction();
  const original = createTransactionEditDraft(expense, timeZone);
  const classify = (change: Partial<typeof original>) => classifyTransactionChanges(original, { ...original, ...change }, expense);

  assert.deepEqual(classify({}), { hasChanges: false, hasMetadataChanges: false, hasFinancialChanges: false, metadataFields: [], financialFields: [] });
  assert.deepEqual(classify({ amount: "24,850" }), { hasChanges: false, hasMetadataChanges: false, hasFinancialChanges: false, metadataFields: [], financialFields: [] });
  assert.deepEqual(classify({ counterparty: "Market" }).metadataFields, ["counterparty"]);
  assert.deepEqual(classify({ categoryId: "expense-household" }).metadataFields, ["category"]);
  assert.deepEqual(classify({ note: "Changed" }).metadataFields, ["note"]);
  assert.deepEqual(classify({ date: new Date("2026-09-20T12:00:00.000Z") }).metadataFields, ["date"]);
  assert.deepEqual(classify({ amount: "10000" }).financialFields, ["amount"]);
  assert.deepEqual(classify({ account: "account-3" }).financialFields, ["account"]);
  assert.deepEqual(classify({ amount: "10000", categoryId: "expense-household" }), {
    hasChanges: true,
    hasMetadataChanges: true,
    hasFinancialChanges: true,
    metadataFields: ["category"],
    financialFields: ["amount"],
  });

  const transfer = transaction({ kind: "TRANSFER", merchant: null, category: null, transferAccount: { id: "account-2", name: "Savings", currency: "XAF" } });
  const transferOriginal = createTransactionEditDraft(transfer, timeZone);
  assert.deepEqual(classifyTransactionChanges(transferOriginal, { ...transferOriginal, fromAccount: "account-3" }, transfer).financialFields, ["fromAccount"]);
  assert.deepEqual(classifyTransactionChanges(transferOriginal, { ...transferOriginal, toAccount: "account-3" }, transfer).financialFields, ["toAccount"]);
});

test("financial edit controls are present, currency remains locked, and transfer controls stay directional", () => {
  const expense = transaction();
  const expenseDraft = { ...createTransactionEditDraft(expense, timeZone), amount: "10000", account: "account-3" };
  const expenseMarkup = renderToStaticMarkup(createElement(EditTransactionForm, {
    accountOptions,
    categories,
    classification: classifyTransactionChanges(createTransactionEditDraft(expense, timeZone), expenseDraft, expense),
    draft: expenseDraft,
    errors: {},
    formError: null,
    isSaving: false,
    labels,
    language: "en",
    locale: "en-US",
    onCancel: () => undefined,
    onDraftChange: () => undefined,
    onReload: () => undefined,
    onSubmit: () => undefined,
    timeZone,
    transaction: expense,
  }));
  assert.match(expenseMarkup, /Amount/);
  assert.match(expenseMarkup, /Account/);
  assert.match(expenseMarkup, /Merchant/);
  assert.match(expenseMarkup, /Category/);
  assert.match(expenseMarkup, /Review correction/);
  assert.match(expenseMarkup, /Currency is locked/);
  assert.match(expenseMarkup, /disabled/);

  const transfer = transaction({ kind: "TRANSFER", merchant: null, category: null, transferAccount: { id: "account-2", name: "Savings", currency: "XAF", type: "SAVINGS" } });
  const transferDraft = { ...createTransactionEditDraft(transfer, timeZone), fromAccount: "account-2" };
  const transferMarkup = renderToStaticMarkup(createElement(EditTransactionForm, {
    accountOptions,
    categories,
    classification: classifyTransactionChanges(createTransactionEditDraft(transfer, timeZone), transferDraft, transfer),
    draft: transferDraft,
    errors: {},
    formError: null,
    isSaving: false,
    labels,
    language: "en",
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

test("financial validation keeps transfers distinct and excludes incompatible currency accounts", () => {
  const transfer = transaction({ kind: "TRANSFER", merchant: null, category: null, transferAccount: { id: "account-2", name: "Savings", currency: "XAF" } });
  const draft = createTransactionEditDraft(transfer, timeZone);

  assert.deepEqual(
    validateTransactionEditDraft(transfer, { ...draft, fromAccount: "account-2", toAccount: "account-2" }, categories, labels, accounts),
    { toAccount: labels.sameTransferAccount },
  );
  assert.deepEqual(
    validateTransactionEditDraft(transfer, { ...draft, toAccount: "account-eur" }, categories, labels, accounts),
    { toAccount: labels.accountValidationUnavailable },
  );
});

test("review displays only changed values, preserves mixed changes, and does not treat reason as a note", async () => {
  const expense = transaction();
  const baseline = createTransactionEditDraft(expense, timeZone);
  const draft = { ...baseline, amount: "10000", account: "account-3", categoryId: "expense-household", note: "Corrected note" };
  const markup = renderToStaticMarkup(createElement(TransactionCorrectionReview, {
    accounts,
    baseline,
    categories,
    classification: classifyTransactionChanges(baseline, draft, expense),
    draft,
    labels,
    locale: "en-US",
    correctionError: null,
    isApplying: false,
    onApply: () => undefined,
    onBack: () => undefined,
    onReloadLatest: () => undefined,
    onReasonChange: () => undefined,
    onReasonDetailsChange: () => undefined,
    reason: "OTHER",
    reasonDetails: "Receipt was entered twice",
    transaction: expense,
  }));

  assert.match(markup, /Amount/);
  assert.match(markup, /Account/);
  assert.match(markup, /Category/);
  assert.match(markup, /Note/);
  assert.match(markup, /24,850/);
  assert.match(markup, /10,000/);
  assert.match(markup, /Main account.*Checking/);
  assert.match(markup, /MTN MoMo.*Mobile Money/);
  assert.match(markup, /The original transaction will remain in your history/);
  assert.match(markup, /Receipt was entered twice/);
  assert.match(markup, /Apply correction/);
  assert.doesNotMatch(markup, /Applying corrections will be available soon/);
  assert.doesNotMatch(markup, /Merchant/);
  const review = await readFile("src/modules/transactions/ui/components/transaction-correction-review.tsx", "utf8");
  assert.doesNotMatch(review, /fetch\(/);
});

test("policy gates financial correction controls and financial drafts never reach the safe-edit request", async () => {
  const prohibited = transaction({ capabilities: { ...transaction().capabilities, canCorrectFinancials: false } });
  const baseline = createTransactionEditDraft(prohibited, timeZone);
  const markup = renderToStaticMarkup(createElement(EditTransactionForm, {
    accountOptions,
    categories,
    classification: classifyTransactionChanges(baseline, baseline, prohibited),
    draft: baseline,
    errors: {},
    formError: null,
    isSaving: false,
    labels,
    language: "en",
    locale: "en-US",
    onCancel: () => undefined,
    onDraftChange: () => undefined,
    onReload: () => undefined,
    onSubmit: () => undefined,
    timeZone,
    transaction: prohibited,
  }));
  assert.match(markup, /Financial corrections are not available/);
  assert.match(markup, /disabled/);

  const financialDraft = { ...baseline, amount: "10000" };
  const classification = classifyTransactionChanges(baseline, financialDraft, prohibited);
  assert.equal(getTransactionEditSubmissionIntent(classification, true), "review-correction");
  assert.equal(getTransactionEditSubmissionIntent(classification, false), "financial-not-allowed");
  const command = createTransactionEditCommand("workspace-1", prohibited, timeZone, financialDraft);
  assert.deepEqual(command.patch, {});

  const dialog = await readFile("src/modules/transactions/ui/components/edit-transaction-dialog.tsx", "utf8");
  assert.match(dialog, /getTransactionEditSubmissionIntent/);
  assert.match(dialog, /submissionIntent === "review-correction"/);
  assert.match(dialog, /setView\("review"\);\s+return;/);
  assert.match(dialog, /function backToEdit\(\) \{\s+setView\("edit"\);/);
  assert.match(dialog, /const command = createTransactionEditCommand/);
  assert.match(dialog, /method: "PATCH"/);
  assert.match(dialog, /createTransactionCorrectionCommand/);
  assert.match(dialog, /method: "POST"/);
  assert.match(dialog, /router\.replace/);
  assert.match(dialog, /setCorrectionIdempotencyKey\(null\)/);
  assert.match(dialog, /onReasonChange=\{updateCorrectionReason\}/);
});

test("server failures map to safe fields or a non-overwriting conflict state", () => {
  assert.deepEqual(mapTransactionEditFailure("CATEGORY_NOT_ALLOWED"), { fieldErrors: { category: "category" }, formError: null });
  assert.deepEqual(mapTransactionEditFailure("INVALID_COUNTERPARTY"), { fieldErrors: { counterparty: "counterparty" }, formError: null });
  assert.deepEqual(mapTransactionEditFailure("CONCURRENT_MODIFICATION"), { fieldErrors: {}, formError: "concurrent" });
  assert.deepEqual(mapTransactionEditFailure("TRANSACTION_EDIT_NOT_ALLOWED"), { fieldErrors: {}, formError: "notAllowed" });
  assert.deepEqual(mapTransactionEditFailure("UNEXPECTED"), { fieldErrors: {}, formError: "failed" });
  assert.deepEqual(mapTransactionCorrectionFailure("INVALID_AMOUNT"), { fieldErrors: { amount: "amount" }, formError: "amount" });
  assert.deepEqual(
    mapTransactionCorrectionFailure("CORRECTED_AMOUNT_BELOW_REFUNDED_TOTAL"),
    { fieldErrors: { amount: "refundLimit" }, formError: "refundLimit" },
  );
  assert.deepEqual(mapTransactionCorrectionFailure("SAME_TRANSFER_ACCOUNT"), { fieldErrors: { toAccount: "toAccount" }, formError: "transfer" });
  assert.deepEqual(mapTransactionCorrectionFailure("CONCURRENT_MODIFICATION"), { fieldErrors: {}, formError: "conflict" });
  assert.deepEqual(mapTransactionCorrectionFailure("TRANSACTION_CORRECTION_NOT_ALLOWED"), { fieldErrors: {}, formError: "notAllowed" });
  assert.deepEqual(
    mapTransactionCorrectionFailureForKind("CROSS_CURRENCY_TRANSFER_UNSUPPORTED", "TRANSFER"),
    { fieldErrors: { fromAccount: "fromAccount", toAccount: "toAccount" }, formError: "currency" },
  );
  assert.deepEqual(mapTransactionCorrectionFailure("UNEXPECTED"), { fieldErrors: {}, formError: "failed" });
  assert.equal(correctionReplacementTransactionId({ correction: { replacementTransaction: { id: "replacement-1" } } }), "replacement-1");
  assert.equal(correctionReplacementTransactionId({ correction: { replacementTransaction: {} } }), null);
});

test("Edit and correction labels are complete in English, French, and German", () => {
  for (const language of ["en", "fr", "de"] as const) {
    const translated = getTransactionEditLabels(getDashboardLabels(language));
    assert.ok(translated.title.length > 0, language);
    assert.ok(translated.concurrentModification.length > 0, language);
    assert.ok(translated.reviewCorrection.length > 0, language);
    assert.ok(translated.correction.reviewTitle.length > 0, language);
    assert.ok(translated.correction.reviewDescription.length > 0, language);
    assert.ok(translated.correction.originalPreserved.length > 0, language);
    assert.ok(translated.correction.apply.length > 0, language);
    assert.ok(translated.correction.applying.length > 0, language);
    assert.ok(translated.correction.failed.length > 0, language);
    assert.ok(translated.correction.conflict.length > 0, language);
    assert.ok(translated.correction.reloadLatest.length > 0, language);
    assert.ok(translated.correction.notAllowed.length > 0, language);
    assert.ok(translated.correction.refundLimit.length > 0, language);
  }
});
