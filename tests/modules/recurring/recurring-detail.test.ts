import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import type { WorkspaceMembershipRecord } from "@/modules/workspaces/domain";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import type { RecurringPaymentView } from "@/modules/financial-inbox/financial-inbox-service";
import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import { parseRecurringDetailTab } from "@/modules/recurring/domain/recurring-detail";
import {
  buildRecurringDetail,
  getRecurringDetailWithReaders,
} from "@/modules/recurring/queries/get-recurring-detail";
import { getRecurringDetailUiLabels } from "@/modules/recurring/ui/recurring-detail-ui-labels";

const actor: AuthenticatedActor = { userId: "member-1", email: "member@example.com", name: "Member" };
const now = new Date("2026-09-20T12:00:00.000Z");

function membership(role: WorkspaceMembershipRecord["role"] = "MEMBER"): WorkspaceMembershipRecord {
  return {
    workspaceId: "workspace-a",
    userId: actor.userId,
    role,
    invitedByUserId: null,
    joinedAt: now,
  };
}

function recurring(overrides: Partial<RecurringPaymentView> = {}): RecurringPaymentView {
  return {
    id: "recurring-a",
    normalizedMerchant: "netflix",
    accountId: "account-a",
    categoryId: "category-a",
    status: "CONFIRMED",
    cadenceDays: 30,
    typicalAmountMinor: "6500",
    currency: "XAF",
    firstOccurredAt: "2026-06-01T12:00:00.000Z",
    lastOccurredAt: "2026-09-01T12:00:00.000Z",
    sampleTransactionIds: ["transaction-1", "transaction-2", "transaction-3"],
    ...overrides,
  };
}

function account(): LedgerAccountRecord {
  return {
    id: "account-a",
    workspaceId: "workspace-a",
    name: "Main account",
    type: "CHECKING",
    currency: "XAF",
    createdByUserId: actor.userId,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function category(): LedgerCategoryRecord {
  return {
    id: "category-a",
    workspaceId: null,
    name: "Entertainment",
    kind: "EXPENSE",
    isSystem: true,
    systemKey: "expense:entertainment",
    createdByUserId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function merchant(): LedgerMerchantRecord {
  return {
    id: "merchant-a",
    workspaceId: "workspace-a",
    name: "Netflix",
    normalizedName: "netflix",
    createdByUserId: actor.userId,
    createdAt: now,
    updatedAt: now,
  };
}

function transaction(id: string, occurredAt: string, overrides: Partial<LedgerTransactionRecord> = {}): LedgerTransactionRecord {
  const date = new Date(`${occurredAt}T12:00:00.000Z`);
  return {
    id,
    workspaceId: "workspace-a",
    kind: "EXPENSE",
    status: "POSTED",
    amountMinor: 6500n,
    currency: "XAF",
    occurredAt: date,
    accountId: "account-a",
    transferAccountId: null,
    categoryId: "category-a",
    merchantId: "merchant-a",
    createdByUserId: actor.userId,
    paidByUserId: actor.userId,
    transferGroupId: null,
    refundedTransactionId: null,
    reversalOfTransactionId: null,
    source: {},
    deduplicationFingerprint: id,
    note: null,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}

function build(
  overrides: Partial<RecurringPaymentView> = {},
  accountOverrides: Partial<LedgerAccountRecord> = {},
) {
  const payment = recurring(overrides);
  const third = transaction("transaction-3", "2026-08-28");
  const evidence = [
    transaction("transaction-1", "2026-06-28"),
    transaction("transaction-2", "2026-07-28"),
    third,
    transaction("technical-reversal", "2026-08-29", {
      kind: "REFUND",
      reversalOfTransactionId: third.id,
    }),
  ];
  return {
    detail: buildRecurringDetail({
      payment,
      accounts: [{ ...account(), ...accountOverrides }],
      categories: [category()],
      merchants: [merchant()],
      evidence,
      merchant: merchant(),
      now,
      timeZone: "UTC",
      workspaceRole: "MEMBER",
    }),
    evidence,
  };
}

test("recurring detail presents canonical M4 facts and keeps projections informational", () => {
  const { detail, evidence } = build();

  assert.equal(detail.title, "Netflix");
  assert.equal(detail.direction, "OUTFLOW");
  assert.equal(detail.amount.kind, "TYPICAL");
  assert.equal(detail.amount.minor, "6500");
  assert.equal(detail.account?.name, "Main account");
  assert.equal(detail.category?.systemKey, "expense:entertainment");
  assert.equal(detail.merchant?.name, "Netflix");
  assert.equal(detail.origin, "DETERMINISTIC_DETECTION");
  assert.equal(detail.capabilities.canConfirm, false);
  assert.equal(detail.capabilities.reasons.confirm, "ALREADY_CONFIRMED");
  assert.equal(detail.upcomingOccurrences.length, 12);
  assert.equal(detail.relatedTransactions.length, 2);
  assert.equal(detail.history.length, 2);
  assert.equal(detail.relatedTransactions.some((item) => item.id === "technical-reversal"), false);
  assert.equal(detail.relatedTransactions.some((item) => item.id === "transaction-3"), false);
  assert.equal(evidence.length, 4);
  assert.equal("currentBalanceMinor" in detail, false);
  assert.equal("availableBalanceMinor" in detail, false);
});

test("candidate and ignored details retain their M4 review semantics", () => {
  const candidate = build({ status: "CANDIDATE" }).detail;
  const ignored = build({ status: "IGNORED" }).detail;

  assert.equal(candidate.reviewState, "NEEDS_REVIEW");
  assert.equal(candidate.capabilities.canConfirm, true);
  assert.equal(candidate.capabilities.canIgnore, true);
  assert.equal(candidate.upcomingOccurrences.length, 12);
  assert.equal(ignored.reviewState, null);
  assert.equal(ignored.capabilities.canConfirm, false);
  assert.equal(ignored.capabilities.reasons.ignore, "ALREADY_IGNORED");
  assert.equal(ignored.nextOccurrenceAt, null);
  assert.equal(ignored.upcomingOccurrences.length, 0);
});

test("an archived linked account keeps recurring provenance readable", () => {
  const { detail } = build({}, { archivedAt: now });

  assert.equal(detail.account?.name, "Main account");
  assert.equal(detail.capabilities.canViewHistory, true);
  assert.equal(detail.capabilities.canEdit, false);
  assert.equal(detail.history.length, 2);
  assert.equal(detail.relatedTransactions.length, 2);
});

test("detail readers scope every related read to the current workspace and recurrence evidence", async () => {
  const requests: string[] = [];
  const detail = await getRecurringDetailWithReaders({
    actor,
    workspaceId: "workspace-a",
    recurringId: "recurring-a",
    timeZone: "UTC",
    now,
  }, {
    findMembership: async () => membership(),
    listRecurring: async (_actor, workspaceId) => {
      requests.push(`recurring:${workspaceId}`);
      return [recurring()];
    },
    listAccounts: async (_actor, workspaceId) => {
      requests.push(`accounts:${workspaceId}`);
      return [account()];
    },
    listCategories: async (_actor, workspaceId) => {
      requests.push(`categories:${workspaceId}`);
      return [category()];
    },
    listMerchants: async (_actor, workspaceId) => {
      requests.push(`merchants:${workspaceId}`);
      return [merchant()];
    },
    listTransactions: async (_actor, workspaceId, filters) => {
      requests.push(`transactions:${workspaceId}:${filters.accountId}:${filters.merchantId}:${filters.statuses?.join(",")}`);
      return [transaction("transaction-1", "2026-06-28")];
    },
  });

  assert.ok(detail);
  assert.ok(requests.every((request) => request.includes("workspace-a")));
  assert.ok(requests.some((request) => request === "transactions:workspace-a:account-a:merchant-a:POSTED"));
});

test("a recurring id outside the workspace has the same null detail response as a missing id", async () => {
  const readers = {
    findMembership: async () => membership(),
    listRecurring: async () => [recurring({ id: "recurring-a" })],
    listAccounts: async () => [account()],
    listCategories: async () => [category()],
    listMerchants: async () => [merchant()],
    listTransactions: async () => [],
  };
  const missing = await getRecurringDetailWithReaders({ actor, workspaceId: "workspace-a", recurringId: "missing", timeZone: "UTC", now }, readers);
  const foreign = await getRecurringDetailWithReaders({ actor, workspaceId: "workspace-a", recurringId: "workspace-b-item", timeZone: "UTC", now }, readers);
  assert.equal(missing, null);
  assert.equal(foreign, null);
});

test("detail rejects a foreign workspace before reading the recurring record", async () => {
  let loaded = false;
  await assert.rejects(
    getRecurringDetailWithReaders({
      actor,
      workspaceId: "workspace-b",
      recurringId: "recurring-b",
      timeZone: "UTC",
      now,
    }, {
      findMembership: async () => null,
      listRecurring: async () => {
        loaded = true;
        return [];
      },
      listAccounts: async () => [],
      listCategories: async () => [],
      listMerchants: async () => [],
      listTransactions: async () => [],
    }),
    AuthorizationError,
  );
  assert.equal(loaded, false);
});

test("detail tabs are URL-safe and labels are localized and serializable", () => {
  assert.equal(parseRecurringDetailTab("history"), "history");
  assert.equal(parseRecurringDetailTab("unknown"), "overview");
  for (const language of ["en", "fr", "de"] as const) {
    const labels = getRecurringDetailUiLabels(getDashboardLabels(language));
    assert.ok(labels.tabs.transactions.length > 0);
    assert.ok(labels.about.description.length > 0);
    assert.equal(containsFunction(labels), false);
  }
});

test("detail view keeps the approved hierarchy while exposing no recurring mutations", async () => {
  const source = await readFile("src/modules/recurring/ui/views/recurring-detail-view.tsx", "utf8");
  assert.match(source, /<h1/);
  assert.match(source, /<RecurringDetailTabs/);
  assert.match(source, /upcomingOccurrences/);
  assert.match(source, /labels\.about\.title/);
  assert.match(source, /TransactionTable/);
  assert.match(source, /\/w\/\$\{workspaceSlug\}\/accounts\/\$\{detail\.account\.id\}/);
  assert.doesNotMatch(source, /\b(?:Pause|Resume|Delete|Skip next)\b/);
});

function containsFunction(value: unknown): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(containsFunction);
}
