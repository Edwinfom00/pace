import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import type { InboxReason } from "@/modules/financial-inbox/domain";
import type {
  InboxOverviewReadInput,
  InboxOverviewReadResult,
  InboxOverviewReadRow,
  InboxOverviewReader,
} from "@/modules/financial-inbox/inbox-overview";
import { getInboxOverview } from "@/modules/financial-inbox/queries/get-inbox-overview";
import type { WorkspaceMembershipRecord } from "@/modules/workspaces/domain";

const actor: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const workspaceId = "workspace-one";
const createdAt = new Date("2026-09-20T10:00:00.000Z");

class StubInboxOverviewReader implements InboxOverviewReader {
  readonly calls: InboxOverviewReadInput[] = [];

  constructor(private readonly read: (input: InboxOverviewReadInput) => InboxOverviewReadResult) {}

  async readInboxOverview(input: InboxOverviewReadInput): Promise<InboxOverviewReadResult> {
    this.calls.push(input);
    return this.read(input);
  }
}

const member: WorkspaceMembershipRecord = {
  workspaceId,
  userId: actor.userId,
  role: "OWNER",
  invitedByUserId: null,
  joinedAt: createdAt,
};

function memberRepository(membership: WorkspaceMembershipRecord | null = member) {
  return {
    findMembership: async () => membership,
  };
}

function row({
  id = "inbox-1",
  reason = "CLASSIFICATION_REVIEW",
  kind = "EXPENSE",
  provider = "import",
  withProposal = true,
  recurring = null,
}: {
  readonly id?: string;
  readonly reason?: InboxReason;
  readonly kind?: "EXPENSE" | "INCOME" | "TRANSFER" | "REFUND";
  readonly provider?: "import" | "manual" | "unknown";
  readonly withProposal?: boolean;
  readonly recurring?: InboxOverviewReadRow["recurring"];
} = {}): InboxOverviewReadRow {
  const transactionId = `transaction-${id}`;
  return {
    item: {
      id,
      workspaceId,
      transactionId,
      classificationId: withProposal ? `classification-${id}` : null,
      recurringPaymentId: recurring?.id ?? null,
      reason,
      actions: ["CLASSIFY_TRANSACTION"],
      status: "OPEN",
      details: {},
      resolvedByUserId: null,
      resolvedAt: null,
      createdAt,
      updatedAt: createdAt,
    },
    transaction: {
      transaction: {
        id: transactionId,
        workspaceId,
        kind,
        status: "POSTED",
        amountMinor: 1250n,
        currency: "XAF",
        occurredAt: createdAt,
        accountId: "account-1",
        transferAccountId: null,
        categoryId: "category-food",
        merchantId: "merchant-1",
        createdByUserId: actor.userId,
        paidByUserId: null,
        transferGroupId: null,
        refundedTransactionId: null,
        reversalOfTransactionId: null,
        source: { provider },
        deduplicationFingerprint: null,
        note: "Lunch",
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
      category: {
        id: "category-food",
        workspaceId,
        name: "Food",
        kind: "EXPENSE",
        isSystem: false,
        systemKey: null,
        createdByUserId: actor.userId,
        createdAt,
        updatedAt: createdAt,
      },
      merchant: {
        id: "merchant-1",
        workspaceId,
        name: "Café de la Gare",
        normalizedName: "cafe de la gare",
        createdByUserId: actor.userId,
        createdAt,
        updatedAt: createdAt,
      },
    },
    classification: withProposal
      ? {
          id: `classification-${id}`,
          workspaceId,
          transactionId,
          merchantName: "Café de la Gare",
          normalizedMerchant: "cafe de la gare",
          suggestedCategoryId: "category-transport",
          appliedCategoryId: "category-food",
          source: "AI_SUGGESTION",
          confidence: 0.61,
          status: "NEEDS_REVIEW",
          explanation: {},
          resolvedByUserId: null,
          resolvedAt: null,
          createdAt,
          updatedAt: createdAt,
        }
      : null,
    suggestedCategory: withProposal
      ? {
          id: "category-transport",
          workspaceId: null,
          name: "Transport",
          kind: "EXPENSE",
          isSystem: true,
          systemKey: "transport",
          createdByUserId: null,
          createdAt,
          updatedAt: createdAt,
        }
      : null,
    recurring,
  };
}

function result(rows: readonly InboxOverviewReadRow[], filteredCount = rows.length): InboxOverviewReadResult {
  return {
    rows,
    recentlyResolvedRows: [],
    unresolvedCount: 3,
    filteredCount,
    reasonCounts: [
      { reason: "POSSIBLE_RECURRING", count: 1 },
      { reason: "CLASSIFICATION_REVIEW", count: 2 },
    ],
  };
}

test("Inbox overview keeps ledger truth, review proposal, recurring link, and import provenance separate", async () => {
  const recurring = { id: "recurring-1", status: "CANDIDATE" as const, origin: "DETECTED" as const, cadenceDays: 30 };
  const reader = new StubInboxOverviewReader(() => result([
    row({ id: "refund-review", kind: "REFUND", recurring }),
  ]));

  const overview = await getInboxOverview({
    actor,
    workspaceId,
    reason: null,
    page: 1,
    unknownMerchantName: "Unknown merchant",
  }, { reader, workspaces: memberRepository() });

  assert.equal(overview.unresolvedCount, 3);
  assert.deepEqual(overview.availableFilters, [
    { reason: "POSSIBLE_RECURRING", count: 1 },
    { reason: "CLASSIFICATION_REVIEW", count: 2 },
  ]);
  assert.equal(overview.items[0]?.transaction.kind, "REFUND");
  assert.equal(overview.items[0]?.transaction.category?.label, "Food");
  assert.deepEqual(overview.items[0]?.classification?.proposal, {
    id: "category-transport",
    label: "Transport",
    key: "transport",
  });
  assert.equal(overview.items[0]?.classification?.confidence, 0.61);
  assert.deepEqual(overview.items[0]?.recurring, recurring);
  assert.equal(overview.items[0]?.provenance, "IMPORT");
  assert.deepEqual(reader.calls, [{ workspaceId, reason: null, offset: 0, limit: 25 }]);
});

test("Inbox overview clamps stale pages and retains the canonical reason filter", async () => {
  const reader = new StubInboxOverviewReader((input) => result(
    input.offset === 25 ? [row({ id: "last-page", reason: "POSSIBLE_TRANSFER", withProposal: false })] : [],
    26,
  ));

  const overview = await getInboxOverview({
    actor,
    workspaceId,
    reason: "POSSIBLE_TRANSFER",
    page: 9,
    unknownMerchantName: "Unknown merchant",
  }, { reader, workspaces: memberRepository() });

  assert.equal(overview.activeFilter, "POSSIBLE_TRANSFER");
  assert.equal(overview.pagination.page, 2);
  assert.equal(overview.pagination.totalCount, 26);
  assert.equal(overview.items[0]?.reason, "POSSIBLE_TRANSFER");
  assert.deepEqual(reader.calls, [
    { workspaceId, reason: "POSSIBLE_TRANSFER", offset: 200, limit: 25 },
    { workspaceId, reason: "POSSIBLE_TRANSFER", offset: 25, limit: 25 },
  ]);
});

test("Inbox overview refuses a workspace without a membership before querying data", async () => {
  const reader = new StubInboxOverviewReader(() => result([]));

  await assert.rejects(
    getInboxOverview({
      actor,
      workspaceId,
      reason: null,
      page: 1,
      unknownMerchantName: "Unknown merchant",
    }, { reader, workspaces: memberRepository(null) }),
    AuthorizationError,
  );
  assert.deepEqual(reader.calls, []);
});
