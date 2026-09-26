import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError, DomainConflictError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import type { FinancialInboxItemRecord } from "@/modules/financial-inbox/domain";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import { LedgerService } from "@/modules/ledger/ledger-service";
import type { LedgerTransactionRecord } from "@/modules/ledger/domain";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_SALARY_ID,
  SYSTEM_TRANSPORT_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceId = "workspace-one";
const foreignWorkspaceId = "workspace-two";
const now = new Date("2026-09-23T10:00:00.000Z");

async function fixture() {
  const financial = new InMemoryFinancialInboxRepository();
  const records = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(records, workspaces);
  const service = new FinancialInboxService(financial, records, workspaces, ledger);
  for (const id of [workspaceId, foreignWorkspaceId]) {
    const workspace: WorkspaceRecord = {
      id,
      name: id,
      slug: id,
      type: "PERSONAL",
      createdByUserId: owner.userId,
      createdAt: now,
      updatedAt: now,
    };
    await workspaces.createWorkspaceWithOwner({
      workspace,
      preferences: { currency: "XAF", locale: "fr-CM", timezone: "Africa/Douala", weekStartsOn: 1 },
      owner: { workspaceId: id, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now },
      initialAccount: { id: `${id}-main`, workspaceId: id, name: "Main", type: "CHECKING", currency: "XAF", createdByUserId: owner.userId },
    });
  }
  workspaces.addMembership({
    workspaceId,
    userId: viewer.userId,
    role: "VIEWER",
    invitedByUserId: owner.userId,
    joinedAt: now,
  });
  const account = await ledger.createAccount(owner, workspaceId, { name: "Cash", type: "CASH", currency: "XAF" });
  const transaction = await ledger.createTransaction(owner, workspaceId, {
    kind: "EXPENSE",
    status: "POSTED",
    accountId: account.id,
    amountMinor: "24850",
    currency: "XAF",
    occurredAt: "2026-09-22T09:00:00.000Z",
    merchantName: "City Taxi",
    source: { provider: "manual", origin: "MANUAL" },
  });
  const classification = await financial.createClassification({
    id: "00000000-0000-4000-8000-000000000301",
    workspaceId,
    transactionId: transaction.id,
    merchantName: "City Taxi",
    normalizedMerchant: "city taxi",
    suggestedCategoryId: SYSTEM_TRANSPORT_ID,
    appliedCategoryId: null,
    source: "AI_SUGGESTION",
    confidence: 0.61,
    status: "NEEDS_REVIEW",
    explanation: { code: "classifier_proposal", model: "m4" },
    resolvedByUserId: null,
    resolvedAt: null,
  });
  const item = await financial.createInboxItem({
    id: "00000000-0000-4000-8000-000000000401",
    workspaceId,
    transactionId: transaction.id,
    classificationId: classification.id,
    recurringPaymentId: null,
    reason: "CLASSIFICATION_REVIEW",
    actions: ["CLASSIFY_TRANSACTION"],
    status: "OPEN",
    details: {},
    resolvedByUserId: null,
    resolvedAt: null,
  });
  return { account, classification, financial, item, ledger, records, service, transaction, workspaces };
}

function command(input: {
  readonly item: FinancialInboxItemRecord;
  readonly transaction: LedgerTransactionRecord;
  readonly idempotencyKey: string;
}) {
  return {
    workspaceId,
    inboxItemId: input.item.id,
    expectedInboxUpdatedAt: input.item.updatedAt,
    expectedTransactionUpdatedAt: input.transaction.updatedAt,
    idempotencyKey: input.idempotencyKey,
  };
}

function financialShape(transaction: LedgerTransactionRecord) {
  return {
    amountMinor: transaction.amountMinor,
    accountId: transaction.accountId,
    currency: transaction.currency,
    kind: transaction.kind,
    transferAccountId: transaction.transferAccountId,
    transferGroupId: transaction.transferGroupId,
    refundedTransactionId: transaction.refundedTransactionId,
    reversalOfTransactionId: transaction.reversalOfTransactionId,
  };
}

test("accepting a current suggestion uses the ledger metadata path and settles only category attention", async () => {
  const { account, classification, financial, item, ledger, records, service, transaction } = await fixture();
  const duplicateReason = await financial.createInboxItem({
    id: "00000000-0000-4000-8000-000000000402",
    workspaceId,
    transactionId: transaction.id,
    classificationId: classification.id,
    recurringPaymentId: null,
    reason: "POSSIBLE_TRANSFER",
    actions: ["REVIEW_TRANSFER"],
    status: "OPEN",
    details: {},
    resolvedByUserId: null,
    resolvedAt: null,
  });
  const before = records.transactions.get(transaction.id);
  assert.ok(before);
  const beforeFinancial = financialShape(before);
  const beforeBalance = await ledger.getAccountBalance(owner, { workspaceId, accountId: account.id });
  const transactionAuditsBefore = await records.listTransactionAudit(workspaceId, transaction.id);
  assert.equal((await service.listInboxPreview(owner, workspaceId, 12)).unresolvedCount, 2);

  const result = await service.acceptInboxCategorySuggestion(owner, {
    ...command({ item, transaction, idempotencyKey: "accept-city-taxi" }),
    expectedSuggestionCategoryId: SYSTEM_TRANSPORT_ID,
    expectedSuggestionUpdatedAt: classification.updatedAt,
  });

  assert.equal(result.replayed, false);
  assert.equal(result.transaction.categoryId, SYSTEM_TRANSPORT_ID);
  assert.deepEqual(result.unresolvedReasons, ["POSSIBLE_TRANSFER"]);
  assert.deepEqual(result.resolvedInboxItemIds, [item.id]);
  assert.equal((await financial.findInboxItem(workspaceId, item.id))?.status, "RESOLVED");
  assert.equal((await financial.findInboxItem(workspaceId, duplicateReason.id))?.status, "OPEN");
  assert.equal((await service.listInboxPreview(owner, workspaceId, 12)).unresolvedCount, 1);

  const persisted = records.transactions.get(transaction.id);
  assert.ok(persisted);
  assert.deepEqual(financialShape(persisted), beforeFinancial);
  const afterBalance = await ledger.getAccountBalance(owner, { workspaceId, accountId: account.id });
  assert.deepEqual(afterBalance, beforeBalance);
  assert.equal(records.transactions.size, 1);
  assert.equal((await records.listTransactionAudit(workspaceId, transaction.id)).length, transactionAuditsBefore.length + 1);

  const resolvedClassification = financial.classifications.get(classification.id);
  assert.equal(resolvedClassification?.status, "APPLIED");
  assert.equal(resolvedClassification?.appliedCategoryId, SYSTEM_TRANSPORT_ID);
  assert.equal(resolvedClassification?.suggestedCategoryId, SYSTEM_TRANSPORT_ID);
  assert.equal(resolvedClassification?.source, "AI_SUGGESTION");
  assert.deepEqual(resolvedClassification?.explanation, classification.explanation);

  const audit = await financial.listAudit(workspaceId, classification.id, item.id);
  assert.equal(audit.at(-1)?.event, "INBOX_CATEGORY_SUGGESTION_ACCEPTED");
  assert.deepEqual(audit.at(-1)?.metadata.before, { categoryId: null });
  assert.deepEqual(audit.at(-1)?.metadata.after, { categoryId: SYSTEM_TRANSPORT_ID });

  const retry = await service.acceptInboxCategorySuggestion(owner, {
    ...command({ item, transaction, idempotencyKey: "accept-city-taxi" }),
    expectedSuggestionCategoryId: SYSTEM_TRANSPORT_ID,
    expectedSuggestionUpdatedAt: classification.updatedAt,
  });
  assert.equal(retry.replayed, true);
  assert.equal((await records.listTransactionAudit(workspaceId, transaction.id)).length, transactionAuditsBefore.length + 1);
  assert.equal((await financial.listAudit(workspaceId, classification.id, item.id)).length, audit.length);
});

test("a changed classifier proposal cannot be accepted from a stale Inbox view", async () => {
  const { classification, financial, item, records, service, transaction } = await fixture();
  const originalSuggestionVersion = classification.updatedAt;
  financial.classifications.set(classification.id, {
    ...classification,
    suggestedCategoryId: SYSTEM_GROCERIES_ID,
    updatedAt: new Date(classification.updatedAt.getTime() + 1),
  });

  await assert.rejects(
    service.acceptInboxCategorySuggestion(owner, {
      ...command({ item, transaction, idempotencyKey: "stale-suggestion" }),
      expectedSuggestionCategoryId: SYSTEM_TRANSPORT_ID,
      expectedSuggestionUpdatedAt: originalSuggestionVersion,
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "CATEGORY_SUGGESTION_STALE",
  );
  assert.equal(records.transactions.get(transaction.id)?.categoryId, null);
  assert.equal((await financial.findInboxItem(workspaceId, item.id))?.status, "OPEN");
});

test("choosing another valid category preserves classifier evidence and resolves a category-only item", async () => {
  const { classification, financial, item, service, transaction } = await fixture();
  assert.equal((await service.listInboxPreview(owner, workspaceId, 12)).unresolvedCount, 1);
  const result = await service.chooseInboxCategory(owner, {
    ...command({ item, transaction, idempotencyKey: "choose-groceries" }),
    categoryId: SYSTEM_GROCERIES_ID,
  });

  assert.equal(result.transaction.categoryId, SYSTEM_GROCERIES_ID);
  assert.deepEqual(result.unresolvedReasons, []);
  assert.equal(result.item.status, "RESOLVED");
  assert.equal((await service.listInboxPreview(owner, workspaceId, 12)).unresolvedCount, 0);
  const resolvedClassification = financial.classifications.get(classification.id);
  assert.equal(resolvedClassification?.suggestedCategoryId, SYSTEM_TRANSPORT_ID);
  assert.equal(resolvedClassification?.appliedCategoryId, SYSTEM_GROCERIES_ID);
  assert.equal(resolvedClassification?.status, "APPLIED");
  assert.equal((await financial.listAudit(workspaceId, classification.id, item.id)).at(-1)?.event, "INBOX_CATEGORY_MANUALLY_SELECTED");
});

test("canonical category restrictions and workspace authorization remain enforced", async () => {
  const { item, records, service, transaction } = await fixture();
  records.categories.set("00000000-0000-4000-8000-000000000777", {
    id: "00000000-0000-4000-8000-000000000777",
    workspaceId: foreignWorkspaceId,
    name: "Foreign",
    kind: "EXPENSE",
    isSystem: false,
    systemKey: null,
    createdByUserId: owner.userId,
    createdAt: now,
    updatedAt: now,
  });
  for (const categoryId of [SYSTEM_SALARY_ID, "00000000-0000-4000-8000-000000000777"]) {
    await assert.rejects(
      service.chooseInboxCategory(owner, {
        ...command({ item, transaction, idempotencyKey: `invalid-${categoryId}` }),
        categoryId,
      }),
      (error: unknown) => error instanceof DomainConflictError && error.code === "CATEGORY_NOT_ALLOWED",
    );
  }
  await assert.rejects(
    service.chooseInboxCategory(viewer, {
      ...command({ item, transaction, idempotencyKey: "viewer-cannot-resolve" }),
      categoryId: SYSTEM_GROCERIES_ID,
    }),
    AuthorizationError,
  );
  assert.equal(records.transactions.get(transaction.id)?.categoryId, null);
});

test("a direct transaction-category edit wins a stale Inbox mutation and reconciles the category reason", async () => {
  const { financial, item, ledger, records, service, transaction } = await fixture();
  await ledger.updateTransactionDetails(
    owner,
    workspaceId,
    transaction.id,
    { categoryId: SYSTEM_GROCERIES_ID },
    transaction.updatedAt,
    "Africa/Douala",
  );

  await assert.rejects(
    service.chooseInboxCategory(owner, {
      ...command({ item, transaction, idempotencyKey: "stale-direct-edit" }),
      categoryId: SYSTEM_TRANSPORT_ID,
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "INBOX_REASON_ALREADY_RESOLVED",
  );
  assert.equal(records.transactions.get(transaction.id)?.categoryId, SYSTEM_GROCERIES_ID);
  assert.equal((await financial.findInboxItem(workspaceId, item.id))?.status, "RESOLVED");
  assert.equal(financial.classifications.get(item.classificationId!)?.status, "APPLIED");
  assert.equal(financial.classifications.get(item.classificationId!)?.appliedCategoryId, SYSTEM_GROCERIES_ID);
});

test("concurrent category choices never silently last-write-win", async () => {
  const { classification, financial, item, records, service, transaction } = await fixture();
  const [first, second] = await Promise.allSettled([
    service.chooseInboxCategory(owner, {
      ...command({ item, transaction, idempotencyKey: "concurrent-groceries" }),
      categoryId: SYSTEM_GROCERIES_ID,
    }),
    service.chooseInboxCategory(owner, {
      ...command({ item, transaction, idempotencyKey: "concurrent-transport" }),
      categoryId: SYSTEM_TRANSPORT_ID,
    }),
  ]);

  assert.equal([first, second].filter((result) => result.status === "fulfilled").length, 1);
  assert.equal([first, second].filter((result) => result.status === "rejected").length, 1);
  const rejected = first.status === "rejected" ? first.reason : second.status === "rejected" ? second.reason : null;
  assert.ok(rejected instanceof DomainConflictError);
  assert.ok(["CONCURRENT_MODIFICATION", "INBOX_REASON_ALREADY_RESOLVED"].includes(rejected.code));
  assert.ok([SYSTEM_GROCERIES_ID, SYSTEM_TRANSPORT_ID].includes(records.transactions.get(transaction.id)?.categoryId ?? ""));
  assert.equal((await financial.listAudit(workspaceId, classification.id, item.id)).filter(
    (audit) => audit.event.startsWith("INBOX_CATEGORY_"),
  ).length, 1);
});

test("technical reversal rows are never category-resolution targets", async () => {
  const { item, records, service, transaction } = await fixture();
  records.transactions.set(transaction.id, { ...transaction, reversalOfTransactionId: "original-transaction" });

  await assert.rejects(
    service.chooseInboxCategory(owner, {
      ...command({ item, transaction, idempotencyKey: "technical-reversal" }),
      categoryId: SYSTEM_GROCERIES_ID,
    }),
    (error: unknown) => error instanceof DomainConflictError && error.code === "TRANSACTION_NOT_CURRENT",
  );
  assert.equal(records.transactions.get(transaction.id)?.categoryId, null);
});
