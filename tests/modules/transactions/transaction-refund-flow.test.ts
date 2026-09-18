import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { toCurrencyCode } from "@/money/currency";
import type { TransactionAccountOption } from "@/modules/transactions/domain/transaction-account-options";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";
import { getTransactionRefundLabels } from "@/modules/transactions/ui/transaction-refund-labels";
import {
  createTransactionRefundCommand,
  createTransactionRefundDraft,
  mapTransactionRefundFailure,
  refundPreview,
  refundResponseId,
  validateTransactionRefundDraft,
} from "@/modules/transactions/ui/components/transaction-refund-flow";

const idempotencyKey = "00000000-0000-4000-8000-000000000098";
const occurredAt = "2026-09-18T09:30:00.000Z";
const accounts: readonly TransactionAccountOption[] = [
  { id: "00000000-0000-4000-8000-000000000021", name: "Main Account", currency: toCurrencyCode("XAF"), type: "CHECKING" },
  { id: "00000000-0000-4000-8000-000000000022", name: "Euro Account", currency: toCurrencyCode("EUR"), type: "CHECKING" },
];

function transaction(overrides: Partial<TransactionDetailData> = {}): TransactionDetailData {
  return {
    id: "00000000-0000-4000-8000-000000000011",
    kind: "EXPENSE",
    status: "POSTED",
    amount: { currency: "XAF", minor: "100" },
    occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    note: null,
    merchant: { id: "merchant-1", name: "Santa Lucia", iconKey: null, merchantLogoKey: null },
    category: { id: "category-1", name: "Groceries", systemKey: "expense:groceries" },
    account: { id: accounts[0].id, name: accounts[0].name, currency: "XAF", type: "CHECKING" },
    transferAccount: null,
    source: { origin: "MANUAL", channel: "WEB" },
    capabilities: { canEdit: true, canCorrectFinancials: true, canRefund: true, canReverse: false, canDelete: false, canViewTechnicalDetails: true, reasons: {} },
    refund: {
      effectiveExpenseAmount: { currency: "XAF", minor: "100" },
      refundedAmount: { currency: "XAF", minor: "40" },
      remainingRefundableAmount: { currency: "XAF", minor: "60" },
      status: "PARTIAL",
      sourceAccount: { id: accounts[0].id, name: accounts[0].name, currency: "XAF", type: "CHECKING" },
      refunds: [],
      activity: [],
    },
    context: { accountImpacts: [], monthlyCategory: null },
    ...overrides,
  };
}

test("refund draft uses the canonical remaining amount and account, not a numeric approximation", () => {
  const draft = createTransactionRefundDraft(transaction(), occurredAt);
  assert.deepEqual(draft, {
    amount: "60",
    accountId: accounts[0].id,
    reason: "",
    note: "",
    occurredAt,
  });
});

test("refund flow previews partial and full outcomes with bigint-safe money", () => {
  const expense = transaction();
  assert.deepEqual(refundPreview(expense, "40"), {
    amount: { currency: "XAF", minor: "40" },
    remaining: { currency: "XAF", minor: "20" },
    status: "PARTIAL",
  });
  assert.deepEqual(refundPreview(expense, "60"), {
    amount: { currency: "XAF", minor: "60" },
    remaining: { currency: "XAF", minor: "0" },
    status: "FULL",
  });
  assert.equal(refundPreview(expense, "61"), null);
});

test("refund client validation retains the server's amount, account, and currency boundaries", () => {
  const draft = createTransactionRefundDraft(transaction(), occurredAt)!;
  assert.deepEqual(validateTransactionRefundDraft(transaction(), draft, accounts), {});
  assert.deepEqual(validateTransactionRefundDraft(transaction(), { ...draft, amount: "" }, accounts), { amount: "required" });
  assert.deepEqual(validateTransactionRefundDraft(transaction(), { ...draft, amount: "0" }, accounts), { amount: "positive" });
  assert.deepEqual(validateTransactionRefundDraft(transaction(), { ...draft, amount: "60.1" }, accounts), { amount: "invalid" });
  assert.deepEqual(validateTransactionRefundDraft(transaction(), { ...draft, amount: "61" }, accounts), { amount: "exceeds" });
  assert.deepEqual(validateTransactionRefundDraft(transaction(), { ...draft, accountId: accounts[1].id }, accounts), { account: "unavailable" });
});

test("refund command serializes exact minor units and keeps optional fields off the source expense", () => {
  const expense = transaction();
  const draft = { ...createTransactionRefundDraft(expense, occurredAt)!, amount: "40", reason: "RETURNED_ITEM", note: "  Returned at checkout  " };
  assert.deepEqual(createTransactionRefundCommand("workspace-1", expense, draft, idempotencyKey), {
    workspaceId: "workspace-1",
    expenseTransactionId: expense.id,
    amountMinor: "40",
    currency: "XAF",
    accountId: accounts[0].id,
    occurredAt,
    reason: "RETURNED_ITEM",
    note: "Returned at checkout",
    idempotencyKey,
  });
});

test("canonical refund errors preserve the draft while exposing an actionable safe state", () => {
  assert.deepEqual(mapTransactionRefundFailure("INVALID_REFUND_AMOUNT"), { fieldErrors: { amount: "invalid" }, formError: null });
  assert.deepEqual(mapTransactionRefundFailure("REFUND_EXCEEDS_REMAINING_AMOUNT"), { fieldErrors: { amount: "exceeds" }, formError: "changed" });
  assert.deepEqual(mapTransactionRefundFailure("CONCURRENT_MODIFICATION"), { fieldErrors: {}, formError: "changed" });
  assert.deepEqual(mapTransactionRefundFailure("EXPENSE_ALREADY_FULLY_REFUNDED"), { fieldErrors: {}, formError: "fullyRefunded" });
  assert.deepEqual(mapTransactionRefundFailure("ACCOUNT_WORKSPACE_MISMATCH"), { fieldErrors: { account: "unavailable" }, formError: null });
  assert.deepEqual(mapTransactionRefundFailure("REFUND_CREATE_FAILED"), { fieldErrors: {}, formError: "failed" });
});

test("refund response reconciliation only accepts the canonical refund transaction payload", () => {
  assert.equal(refundResponseId({ refund: { refundTransaction: { id: "refund-1" } } }), "refund-1");
  assert.equal(refundResponseId({ refund: { refundTransaction: {} } }), null);
  assert.equal(refundResponseId({ correction: {} }), null);
});

test("refund labels are complete in English, French, and German", () => {
  for (const language of ["en", "fr", "de"] as const) {
    const labels = getTransactionRefundLabels(getDashboardLabels(language));
    assert.ok(labels.title.length > 0, language);
    assert.ok(labels.amountExceeds.length > 0, language);
    assert.ok(labels.sourceChanged.length > 0, language);
    assert.ok(labels.confirm.length > 0, language);
    assert.ok(labels.returnedItem.length > 0, language);
  }
});

test("refund UI only uses canonical money helpers and the canonical collection mutation", async () => {
  const [dialog, flow, route] = await Promise.all([
    readFile("src/modules/transactions/ui/components/transaction-refund-dialog.tsx", "utf8"),
    readFile("src/modules/transactions/ui/components/transaction-refund-flow.ts", "utf8"),
    readFile("src/app/api/workspaces/[workspaceId]/ledger/transactions/route.ts", "utf8"),
  ]);
  assert.match(dialog, /<ResponsiveDialog/);
  assert.doesNotMatch(dialog, /Sheet/);
  assert.match(dialog, /router\.refresh\(\)/);
  assert.match(flow, /parseDecimalMoney/);
  assert.doesNotMatch(flow, /parseFloat|Number\(/);
  assert.match(route, /createRefund/);
  assert.match(route, /isCanonicalRefundRequest/);
});
