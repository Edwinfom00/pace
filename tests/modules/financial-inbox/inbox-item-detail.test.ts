import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import type { FinancialInboxItemRecord, InboxReason } from "@/modules/financial-inbox/domain";
import type {
  InboxItemDetailReadInput,
  InboxItemDetailReadRecord,
  InboxItemDetailReader,
} from "@/modules/financial-inbox/inbox-item-detail";
import { getInboxItemDetail } from "@/modules/financial-inbox/queries/get-inbox-item-detail";
import type { LedgerTransactionListRow, LedgerTransactionRecord } from "@/modules/ledger/domain";
import type { WorkspaceMembershipRecord } from "@/modules/workspaces/domain";

const actor: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const workspaceId = "workspace-one";
const createdAt = new Date("2026-09-20T10:00:00.000Z");

class StubInboxItemDetailReader implements InboxItemDetailReader {
  readonly calls: InboxItemDetailReadInput[] = [];

  constructor(private readonly result: InboxItemDetailReadRecord | null) {}

  async readInboxItemDetail(input: InboxItemDetailReadInput): Promise<InboxItemDetailReadRecord | null> {
    this.calls.push(input);
    return this.result;
  }
}

const membership: WorkspaceMembershipRecord = {
  workspaceId,
  userId: actor.userId,
  role: "OWNER",
  invitedByUserId: null,
  joinedAt: createdAt,
};

function memberRepository(value: WorkspaceMembershipRecord | null = membership) {
  return { findMembership: async () => value };
}

function transactionRow({
  id = "transaction-1",
  kind = "EXPENSE",
  reversalOfTransactionId = null,
  category = true,
  merchant = true,
}: {
  readonly id?: string;
  readonly kind?: LedgerTransactionRecord["kind"];
  readonly reversalOfTransactionId?: string | null;
  readonly category?: boolean;
  readonly merchant?: boolean;
} = {}): LedgerTransactionListRow {
  return {
    transaction: {
      id,
      workspaceId,
      kind,
      status: "POSTED",
      amountMinor: 24_850n,
      currency: "XAF",
      occurredAt: createdAt,
      accountId: "account-1",
      transferAccountId: kind === "TRANSFER" ? "account-2" : null,
      categoryId: category ? "category-shopping" : null,
      merchantId: merchant ? "merchant-1" : null,
      createdByUserId: actor.userId,
      paidByUserId: null,
      transferGroupId: kind === "TRANSFER" ? "transfer-group-1" : null,
      refundedTransactionId: kind === "REFUND" ? "expense-1" : null,
      reversalOfTransactionId,
      source: { provider: "import" },
      deduplicationFingerprint: null,
      note: "Receipt reference 204",
      createdAt,
      updatedAt: createdAt,
    },
    account: {
      id: "account-1",
      workspaceId,
      name: "Main account",
      type: "CHECKING",
      currency: "XAF",
      createdByUserId: actor.userId,
      archivedAt: null,
      createdAt,
      updatedAt: createdAt,
    },
    category: category
      ? {
          id: "category-shopping",
          workspaceId: null,
          name: "Shopping",
          kind: "EXPENSE",
          isSystem: true,
          systemKey: "expense:shopping",
          createdByUserId: null,
          createdAt,
          updatedAt: createdAt,
        }
      : null,
    merchant: merchant
      ? {
          id: "merchant-1",
          workspaceId,
          name: "Amazon",
          normalizedName: "amazon",
          createdByUserId: actor.userId,
          createdAt,
          updatedAt: createdAt,
        }
      : null,
  };
}

function inboxItem(reason: InboxReason = "CLASSIFICATION_REVIEW", status: FinancialInboxItemRecord["status"] = "OPEN"): FinancialInboxItemRecord {
  return {
    id: "inbox-1",
    workspaceId,
    transactionId: "transaction-1",
    classificationId: "classification-1",
    recurringPaymentId: null,
    reason,
    actions: ["CLASSIFY_TRANSACTION"],
    status,
    details: {},
    resolvedByUserId: null,
    resolvedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function detailRecord({
  source = transactionRow(),
  effective = source,
  relatedItems = [inboxItem()],
}: {
  readonly source?: LedgerTransactionListRow;
  readonly effective?: LedgerTransactionListRow;
  readonly relatedItems?: readonly FinancialInboxItemRecord[];
} = {}): InboxItemDetailReadRecord {
  return {
    item: inboxItem(),
    sourceTransaction: source,
    effectiveTransaction: effective,
    classification: {
      id: "classification-1",
      workspaceId,
      transactionId: "transaction-1",
      merchantName: "Amazon",
      normalizedMerchant: "amazon",
      suggestedCategoryId: "category-shopping",
      appliedCategoryId: null,
      source: "DETERMINISTIC",
      confidence: 0.92,
      status: "NEEDS_REVIEW",
      explanation: { code: "known_merchant" },
      resolvedByUserId: null,
      resolvedAt: null,
      createdAt,
      updatedAt: createdAt,
    },
    suggestedCategory: {
      id: "category-shopping",
      workspaceId: null,
      name: "Shopping",
      kind: "EXPENSE",
      isSystem: true,
      systemKey: "expense:shopping",
      createdByUserId: null,
      createdAt,
      updatedAt: createdAt,
    },
    recurring: null,
    relatedItems,
    similarTransactions: [transactionRow({ id: "similar-1" })],
    audits: [
      {
        id: "audit-1",
        workspaceId,
        inboxItemId: "inbox-1",
        classificationId: "classification-1",
        recurringPaymentId: null,
        actorUserId: null,
        event: "INBOX_ITEM_CREATED",
        commandFingerprint: null,
        idempotencyKey: null,
        metadata: {},
        createdAt,
      },
    ],
    corrections: [],
  };
}

test("Inbox item detail composes canonical transaction truth while keeping a proposal distinct", async () => {
  const reader = new StubInboxItemDetailReader(detailRecord());
  const detail = await getInboxItemDetail({
    actor,
    workspaceId,
    inboxItemId: "inbox-1",
    unknownMerchantName: "Unknown merchant",
  }, { reader, workspaces: memberRepository() });

  assert.equal(detail?.transaction.merchant.name, "Amazon");
  assert.equal(detail?.transaction.kind, "EXPENSE");
  assert.equal(detail?.currentClassification.state, "CONFIRMED");
  assert.deepEqual(detail?.suggestion?.category, { id: "category-shopping", name: "Shopping", systemKey: "expense:shopping" });
  assert.equal(detail?.suggestion?.confidence, "HIGH");
  assert.equal(detail?.suggestion?.score, 0.92);
  assert.equal(detail?.context.account?.name, "Main account");
  assert.equal(detail?.context.source, "IMPORT");
  assert.deepEqual(detail?.activity.map((activity) => activity.event), ["INBOX_ITEM_CREATED"]);
  assert.deepEqual(reader.calls, [{ workspaceId, inboxItemId: "inbox-1", similarLimit: 3 }]);
});

test("Inbox item detail preserves multiple canonical reasons and suppresses non-authoritative audit events", async () => {
  const first = inboxItem("UNKNOWN_CATEGORY");
  const second = { ...inboxItem("POSSIBLE_TRANSFER"), id: "inbox-2" };
  const uncategorized = transactionRow({ category: false });
  const baseRecord = detailRecord({ source: uncategorized, effective: uncategorized, relatedItems: [first, second] });
  const record: InboxItemDetailReadRecord = {
    ...baseRecord,
    audits: [
      ...baseRecord.audits,
      { ...baseRecord.audits[0]!, id: "audit-ignored", event: "UNSUPPORTED_EVENT" },
    ],
  };
  const detail = await getInboxItemDetail({ actor, workspaceId, inboxItemId: "inbox-1", unknownMerchantName: "Unknown merchant" }, {
    reader: new StubInboxItemDetailReader(record),
    workspaces: memberRepository(),
  });

  assert.deepEqual(detail?.attentionReasons, ["UNKNOWN_CATEGORY", "POSSIBLE_TRANSFER"]);
  assert.deepEqual(detail?.activity.map((activity) => activity.event), ["INBOX_ITEM_CREATED"]);
});

test("Inbox item detail keeps remaining reasons open and reports resolved only after all reasons clear", async () => {
  const categoryItem = inboxItem("CLASSIFICATION_REVIEW", "RESOLVED");
  const transferItem = { ...inboxItem("POSSIBLE_TRANSFER"), id: "inbox-2" };
  const categorized = transactionRow({ category: true });
  const withRemainingReason = detailRecord({
    source: categorized,
    effective: categorized,
    relatedItems: [categoryItem, transferItem],
  });
  const openDetail = await getInboxItemDetail({
    actor,
    workspaceId,
    inboxItemId: "inbox-1",
    unknownMerchantName: "Unknown merchant",
  }, {
    reader: new StubInboxItemDetailReader({ ...withRemainingReason, item: categoryItem }),
    workspaces: memberRepository(),
  });

  assert.equal(openDetail?.status, "OPEN");
  assert.deepEqual(openDetail?.attentionReasons, ["POSSIBLE_TRANSFER"]);

  const resolvedDetail = await getInboxItemDetail({
    actor,
    workspaceId,
    inboxItemId: "inbox-1",
    unknownMerchantName: "Unknown merchant",
  }, {
    reader: new StubInboxItemDetailReader({
      ...withRemainingReason,
      item: categoryItem,
      relatedItems: [categoryItem],
    }),
    workspaces: memberRepository(),
  });

  assert.equal(resolvedDetail?.status, "RESOLVED");
  assert.deepEqual(resolvedDetail?.attentionReasons, []);
});

test("Inbox item detail uses the reader's effective transaction and preserves transfer and refund semantics", async () => {
  const transfer = transactionRow({ id: "transfer-current", kind: "TRANSFER", category: false, merchant: false });
  const transferDetail = await getInboxItemDetail({ actor, workspaceId, inboxItemId: "inbox-1", unknownMerchantName: "Unknown merchant" }, {
    reader: new StubInboxItemDetailReader(detailRecord({ effective: transfer })),
    workspaces: memberRepository(),
  });
  assert.equal(transferDetail?.transaction.kind, "TRANSFER");
  assert.equal(transferDetail?.transaction.effectiveTransactionId, "transfer-current");

  const refund = transactionRow({ id: "refund-current", kind: "REFUND" });
  const refundDetail = await getInboxItemDetail({ actor, workspaceId, inboxItemId: "inbox-1", unknownMerchantName: "Unknown merchant" }, {
    reader: new StubInboxItemDetailReader(detailRecord({ effective: refund })),
    workspaces: memberRepository(),
  });
  assert.equal(refundDetail?.transaction.kind, "REFUND");
});

test("Inbox item detail rejects a non-member before it reads any Inbox data", async () => {
  const reader = new StubInboxItemDetailReader(detailRecord());
  await assert.rejects(
    getInboxItemDetail({ actor, workspaceId, inboxItemId: "foreign-item", unknownMerchantName: "Unknown merchant" }, {
      reader,
      workspaces: memberRepository(null),
    }),
    AuthorizationError,
  );
  assert.deepEqual(reader.calls, []);
});

test("Inbox item detail safely reports a missing or foreign item as unavailable", async () => {
  const detail = await getInboxItemDetail({ actor, workspaceId, inboxItemId: "foreign-item", unknownMerchantName: "Unknown merchant" }, {
    reader: new StubInboxItemDetailReader(null),
    workspaces: memberRepository(),
  });
  assert.equal(detail, null);
});
