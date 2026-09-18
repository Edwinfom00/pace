import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getTransactionCapabilities,
  type TransactionActionPolicyInput,
} from "@/modules/transactions/domain/transaction-action-policy";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getTransactionDetailActionLabels } from "@/modules/transactions/ui/transaction-detail-action-labels";

function transaction(
  overrides: Partial<TransactionActionPolicyInput["transaction"]> = {},
): TransactionActionPolicyInput["transaction"] {
  return {
    kind: "EXPENSE",
    status: "POSTED",
    amountMinor: 12_500n,
    categoryId: "groceries",
    source: { provider: "manual", origin: "MANUAL" },
    ...overrides,
  };
}

function capabilities(
  overrides: Partial<TransactionActionPolicyInput> = {},
) {
  return getTransactionCapabilities({
    transaction: transaction(),
    workspaceRole: "OWNER",
    refundedAmountMinor: 0n,
    ...overrides,
  });
}

test("a financial writer can prepare to edit and refund a posted expense", () => {
  const result = capabilities();

  assert.equal(result.canEdit, true);
  assert.equal(result.canRefund, true);
  assert.equal(result.canReverse, false);
  assert.equal(result.canDelete, false);
  assert.equal(result.canViewTechnicalDetails, true);
  assert.equal(result.reasons.reverse, "REVERSAL_NOT_SUPPORTED");
  assert.equal(result.reasons.delete, "DELETE_NOT_SUPPORTED");
});

test("a financial writer can prepare to edit posted income, but cannot refund it", () => {
  const result = capabilities({ transaction: transaction({ kind: "INCOME" }) });

  assert.equal(result.canEdit, true);
  assert.equal(result.canRefund, false);
  assert.equal(result.reasons.refund, "REFUND_NOT_APPLICABLE");
});

test("transfers permit safe detail edits but never expose refunds", () => {
  const result = capabilities({ transaction: transaction({ kind: "TRANSFER", categoryId: null }) });

  assert.equal(result.canEdit, true);
  assert.equal(result.canRefund, false);
  assert.equal(result.canReverse, false);
  assert.equal(result.reasons.edit, undefined);
  assert.equal(result.reasons.refund, "REFUND_NOT_APPLICABLE");
});

test("refunds are immutable and cannot recursively create refunds", () => {
  const result = capabilities({ transaction: transaction({ kind: "REFUND" }) });

  assert.equal(result.canEdit, false);
  assert.equal(result.canRefund, false);
  assert.equal(result.reasons.edit, "REFUND_IMMUTABLE");
  assert.equal(result.reasons.refund, "REFUND_NOT_APPLICABLE");
});

test("a viewer retains technical read access but cannot manage financial actions", () => {
  const result = capabilities({ workspaceRole: "VIEWER" });

  assert.equal(result.canEdit, false);
  assert.equal(result.canRefund, false);
  assert.equal(result.canReverse, false);
  assert.equal(result.canDelete, false);
  assert.equal(result.canViewTechnicalDetails, true);
  assert.deepEqual(result.reasons, {
    edit: "READ_ONLY_ROLE",
    refund: "READ_ONLY_ROLE",
    reverse: "READ_ONLY_ROLE",
    delete: "READ_ONLY_ROLE",
  });
});

test("a MEMBER reuses the canonical manage_ledger permission", () => {
  const result = capabilities({ workspaceRole: "MEMBER" });

  assert.equal(result.canEdit, true);
  assert.equal(result.canRefund, true);
});

test("pending and imported transactions are conservatively restricted", () => {
  const pending = capabilities({ transaction: transaction({ status: "PENDING" }) });
  const imported = capabilities({ transaction: transaction({ source: { provider: "pace-import" } }) });

  assert.equal(pending.canEdit, false);
  assert.equal(pending.canRefund, false);
  assert.equal(pending.reasons.edit, "TRANSACTION_NOT_POSTED");
  assert.equal(pending.reasons.refund, "TRANSACTION_NOT_POSTED");
  assert.equal(imported.canEdit, false);
  assert.equal(imported.reasons.edit, "IMPORTED_TRANSACTION_RESTRICTED");
  assert.equal(imported.canRefund, true);
});

test("agent origin alone does not make a canonical posted record immutable", () => {
  const result = capabilities({ transaction: transaction({ source: { provider: "pace-agent", origin: "AGENT" } }) });

  assert.equal(result.canEdit, true);
  assert.equal(result.canRefund, true);
});

test("refund capability requires an eligible category and remaining original amount", () => {
  const uncategorized = capabilities({ transaction: transaction({ categoryId: null }) });
  const fullyRefunded = capabilities({ refundedAmountMinor: 12_500n });

  assert.equal(uncategorized.canRefund, false);
  assert.equal(uncategorized.reasons.refund, "REFUND_REQUIRES_CATEGORY");
  assert.equal(fullyRefunded.canRefund, false);
  assert.equal(fullyRefunded.reasons.refund, "REFUND_FULLY_ISSUED");
});

test("the canonical policy has no dependency on UI components", async () => {
  const source = await readFile("src/modules/transactions/domain/transaction-action-policy.ts", "utf8");

  assert.doesNotMatch(source, /modules\/transactions\/ui|\.\.\/ui/);
});

test("detail action reasons have English, French, and German UI mappings", () => {
  for (const language of ["en", "fr", "de"] as const) {
    const labels = getTransactionDetailActionLabels(getDashboardLabels(language));
    assert.ok(labels.unavailable.READ_ONLY_ROLE.length > 0, language);
    assert.ok(labels.unavailable.IMPORTED_TRANSACTION_RESTRICTED.length > 0, language);
    assert.ok(labels.unavailable.DELETE_NOT_SUPPORTED.length > 0, language);
  }
});

test("detail actions have no mutation trigger before their server mutations exist", async () => {
  const source = await readFile("src/modules/transactions/ui/components/transaction-detail-actions.tsx", "utf8");

  assert.match(source, /disabled/);
  assert.doesNotMatch(source, /onClick|formAction|useActionState/);
});
