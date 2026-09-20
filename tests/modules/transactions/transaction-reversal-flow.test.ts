import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";
import {
  createTransactionReversalCommand,
  mapTransactionReversalFailure,
  reversalErrorCode,
  reversalResponseId,
} from "@/modules/transactions/ui/components/transaction-reversal-flow";
import { getTransactionReversalLabels } from "@/modules/transactions/ui/transaction-reversal-labels";

const idempotencyKey = "00000000-0000-4000-8000-000000000299";
const updatedAt = "2026-09-20T09:30:00.000Z";

function transaction(overrides: Partial<TransactionDetailData> = {}): TransactionDetailData {
  return {
    id: "00000000-0000-4000-8000-000000000201",
    kind: "EXPENSE",
    status: "POSTED",
    amount: { currency: "XAF", minor: "10000" },
    occurredAt: updatedAt,
    createdAt: updatedAt,
    updatedAt,
    note: "Original note remains untouched",
    merchant: { id: "merchant-1", name: "Santa Lucia", iconKey: null, merchantLogoKey: null },
    category: { id: "category-1", name: "Groceries", systemKey: "expense:groceries" },
    account: { id: "account-1", name: "Main Account", currency: "XAF", type: "CHECKING" },
    transferAccount: null,
    source: { origin: "MANUAL", channel: "WEB" },
    capabilities: {
      canEdit: true,
      canCorrectFinancials: true,
      canRefund: true,
      canReverse: true,
      canDelete: false,
      canViewTechnicalDetails: true,
      reasons: {},
    },
    correction: null,
    reversal: null,
    refund: null,
    context: { accountImpacts: [], monthlyCategory: null },
    ...overrides,
  };
}

test("reversal command uses the canonical F.1 shape and keeps the original note immutable", () => {
  const source = transaction();
  assert.deepEqual(
    createTransactionReversalCommand("workspace-1", source, { reason: "  Duplicate transaction  " }, idempotencyKey),
    {
      workspaceId: "workspace-1",
      transactionId: source.id,
      expectedUpdatedAt: updatedAt,
      idempotencyKey,
      reason: "Duplicate transaction",
    },
  );
  assert.deepEqual(
    createTransactionReversalCommand("workspace-1", source, { reason: "  " }, idempotencyKey),
    {
      workspaceId: "workspace-1",
      transactionId: source.id,
      expectedUpdatedAt: updatedAt,
      idempotencyKey,
    },
  );
  assert.equal(
    createTransactionReversalCommand(
      "workspace-1",
      transaction({ capabilities: { ...source.capabilities, canReverse: false } }),
      { reason: "Duplicate transaction" },
      idempotencyKey,
    ),
    null,
  );
});

test("reversal command retries retain the caller's idempotency key until intent changes", () => {
  const source = transaction();
  const first = createTransactionReversalCommand("workspace-1", source, { reason: "Duplicate transaction" }, idempotencyKey);
  const retry = createTransactionReversalCommand("workspace-1", source, { reason: "Duplicate transaction" }, idempotencyKey);
  const changedIntent = createTransactionReversalCommand(
    "workspace-1",
    source,
    { reason: "Entered by mistake" },
    "00000000-0000-4000-8000-000000000300",
  );

  assert.equal(first?.idempotencyKey, retry?.idempotencyKey);
  assert.notEqual(first?.idempotencyKey, changedIntent?.idempotencyKey);
});

test("canonical reversal failures map to safe form states without exposing server errors", () => {
  assert.equal(mapTransactionReversalFailure("TRANSACTION_REVERSAL_NOT_ALLOWED"), "notAllowed");
  assert.equal(mapTransactionReversalFailure("TRANSACTION_HAS_ACTIVE_REFUNDS"), "hasActiveRefunds");
  for (const code of [
    "TRANSACTION_ALREADY_REVERSED",
    "TRANSACTION_NOT_CURRENT",
    "CONCURRENT_MODIFICATION",
    "REVERSAL_ALREADY_PROCESSED",
  ]) {
    assert.equal(mapTransactionReversalFailure(code), "conflict", code);
  }
  assert.equal(mapTransactionReversalFailure("TRANSACTION_REVERSAL_FAILED"), "failed");
  assert.equal(reversalErrorCode({ code: "CONCURRENT_MODIFICATION" }), "CONCURRENT_MODIFICATION");
  assert.equal(reversalErrorCode({ error: "Database failed" }), undefined);
});

test("only an authoritative reversal response is accepted for success reconciliation", () => {
  assert.equal(reversalResponseId({
    reversal: {
      effectiveState: "REVERSED",
      reversalTransaction: { id: "reversal-1" },
    },
  }), "reversal-1");
  assert.equal(reversalResponseId({ reversal: { effectiveState: "REVERSED", reversalTransaction: {} } }), null);
  assert.equal(reversalResponseId({ reversal: { effectiveState: "POSTED", reversalTransaction: { id: "reversal-1" } } }), null);
  assert.equal(reversalResponseId({ transaction: { id: "reversal-1" } }), null);
});

test("reversal labels are complete in English, French, and German", () => {
  for (const language of ["en", "fr", "de"] as const) {
    const labels = getTransactionReversalLabels(getDashboardLabels(language));
    assert.ok(labels.title.length > 0, language);
    assert.ok(labels.description.length > 0, language);
    assert.ok(labels.review.length > 0, language);
    assert.ok(labels.reversing.length > 0, language);
    assert.ok(labels.conflict.length > 0, language);
    assert.ok(labels.hasActiveRefunds.length > 0, language);
    assert.equal(typeof labels.typeAndAmount, "string", language);
    assert.equal(typeof labels.restored, "string", language);
    assert.deepEqual(JSON.parse(JSON.stringify(labels)), labels, language);
  }
});

test("reversal UI uses the shared responsive dialog and canonical reversal route", async () => {
  const [dialog, flow, route] = await Promise.all([
    readFile("src/modules/transactions/ui/components/transaction-reversal-dialog.tsx", "utf8"),
    readFile("src/modules/transactions/ui/components/transaction-reversal-flow.ts", "utf8"),
    readFile("src/app/api/workspaces/[workspaceId]/ledger/transactions/[transactionId]/reverse/route.ts", "utf8"),
  ]);

  assert.match(dialog, /<ResponsiveDialog/);
  assert.match(dialog, /drawerClassName/);
  assert.match(dialog, /<DropdownMenu/);
  assert.doesNotMatch(dialog, /@\/components\/ui\/dialog/);
  assert.match(dialog, /window\.crypto\.randomUUID\(\)/);
  assert.match(dialog, /router\.refresh\(\)/);
  assert.match(dialog, /formatReversalTemplate/);
  assert.match(dialog, /isSubmitting/);
  assert.match(flow, /transaction\.capabilities\.canReverse/);
  assert.match(route, /reverseTransaction/);
  assert.doesNotMatch(route, /deleteTransaction|createRefund/);
});
