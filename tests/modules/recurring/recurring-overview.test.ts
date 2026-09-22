import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import type { WorkspaceMembershipRecord } from "@/modules/workspaces/domain";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import type { RecurringPaymentView } from "@/modules/financial-inbox/financial-inbox-service";
import type { LedgerAccountRecord, LedgerCategoryRecord } from "@/modules/ledger/domain";
import {
  buildRecurringOverview,
  parseRecurringOverviewFilter,
} from "@/modules/recurring/domain/recurring-overview";
import { getRecurringOverviewWithReaders } from "@/modules/recurring/queries/get-recurring-overview";
import { getRecurringUiLabels } from "@/modules/recurring/ui/recurring-ui-labels";

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

test("recurring UI labels are complete, localized, and serializable across supported languages", () => {
  for (const language of ["en", "fr", "de"] as const) {
    const labels = getRecurringUiLabels(getDashboardLabels(language));
    assert.ok(labels.title.length > 0);
    assert.ok(labels.subtitle.length > 0);
    assert.ok(labels.filters.NEEDS_REVIEW.length > 0);
    assert.ok(labels.projectionNotice.length > 0);
    assert.equal(containsFunction(labels), false);
  }
});

function recurring(id: string, overrides: Partial<RecurringPaymentView> = {}): RecurringPaymentView {
  return {
    id,
    normalizedMerchant: "netflix",
    displayName: null,
    origin: "DETECTED",
    direction: "EXPENSE",
    accountId: "account-a",
    categoryId: "category-a",
    status: "CONFIRMED",
    cadenceDays: 30,
    typicalAmountMinor: "5700",
    currency: "XAF",
    firstOccurredAt: "2026-07-01T12:00:00.000Z",
    lastOccurredAt: "2026-09-01T12:00:00.000Z",
    nextOccurrenceAt: null,
    sampleTransactionIds: ["transaction-1", "transaction-2", "transaction-3"],
    updatedAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

function account(id = "account-a"): LedgerAccountRecord {
  return {
    id,
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

function category(id = "category-a"): LedgerCategoryRecord {
  return {
    id,
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

test("recurring overview composes canonical M4 fields and preserves candidate review state", () => {
  const overview = buildRecurringOverview({
    payments: [
      recurring("candidate", {
        normalizedMerchant: "gym",
        status: "CANDIDATE",
        typicalAmountMinor: "9000",
        lastOccurredAt: "2026-09-05T12:00:00.000Z",
      }),
      recurring("confirmed"),
      recurring("ignored", { normalizedMerchant: "old service", status: "IGNORED" }),
    ],
    accounts: [account()],
    categories: [category()],
    filter: "ALL",
    timeZone: "UTC",
    now,
    workspaceRole: "MEMBER",
  });

  const candidate = overview.items.find((item) => item.id === "candidate");
  const ignored = overview.items.find((item) => item.id === "ignored");
  assert.equal(candidate?.direction, "OUTFLOW");
  assert.equal(candidate?.origin, "DETERMINISTIC_DETECTION");
  assert.equal(candidate?.amountKind, "TYPICAL");
  assert.equal(candidate?.reviewState, "NEEDS_REVIEW");
  assert.equal(candidate?.capabilities.canConfirm, true);
  assert.equal(candidate?.capabilities.canIgnore, true);
  assert.equal(candidate?.capabilities.canRestore, false);
  assert.equal(candidate?.account?.name, "Main account");
  assert.equal(candidate?.category?.systemKey, "expense:entertainment");
  assert.ok(candidate?.nextExpectedAt);
  assert.equal(ignored?.nextExpectedAt, null);
  assert.equal(ignored?.capabilities.canRestore, true);
  assert.deepEqual(overview.counts, { ALL: 3, CONFIRMED: 1, NEEDS_REVIEW: 1, IGNORED: 1 });
  assert.equal("accountBalanceMinor" in overview, false);
});

test("recurring overview groups every financial projection by currency and excludes candidates from confirmed projections", () => {
  const overview = buildRecurringOverview({
    payments: [
      recurring("xof", { currency: "XOF", typicalAmountMinor: "10000" }),
      recurring("usd", { currency: "USD", typicalAmountMinor: "2999", normalizedMerchant: "streaming" }),
      recurring("candidate", { currency: "USD", typicalAmountMinor: "9999", status: "CANDIDATE", normalizedMerchant: "candidate" }),
    ],
    accounts: [account()],
    categories: [category()],
    filter: "ALL",
    timeZone: "UTC",
    now,
    workspaceRole: "MEMBER",
  });

  assert.deepEqual(overview.confirmedOutflows, [
    { currency: "USD", amountMinor: "2999" },
    { currency: "XOF", amountMinor: "10000" },
  ]);
  assert.deepEqual(overview.expectedUpcoming, overview.confirmedOutflows);
  assert.deepEqual(overview.upcoming.map((item) => item.id), ["xof", "usd"]);
  assert.equal(overview.upcoming.some((item) => item.id === "candidate"), false);
});

test("recurring filters are URL-safe and operate on canonical status/review values", () => {
  const payments = [
    recurring("confirmed"),
    recurring("candidate", { status: "CANDIDATE" }),
    recurring("ignored", { status: "IGNORED" }),
  ];
  const input = {
    payments,
    accounts: [account()],
    categories: [category()],
    timeZone: "UTC",
    now,
    workspaceRole: "MEMBER" as const,
  };

  assert.equal(parseRecurringOverviewFilter("CONFIRMED"), "CONFIRMED");
  assert.equal(parseRecurringOverviewFilter("not-a-filter"), "ALL");
  assert.deepEqual(buildRecurringOverview({ ...input, filter: "CONFIRMED" }).items.map((item) => item.id), ["confirmed"]);
  assert.deepEqual(buildRecurringOverview({ ...input, filter: "NEEDS_REVIEW" }).items.map((item) => item.id), ["candidate"]);
  assert.deepEqual(buildRecurringOverview({ ...input, filter: "IGNORED" }).items.map((item) => item.id), ["ignored"]);
});

test("overview readers stay workspace-scoped and fetch related ledger data in batches", async () => {
  const requested: string[] = [];
  const overview = await getRecurringOverviewWithReaders({
    actor,
    workspaceId: "workspace-a",
    filter: "ALL",
    timeZone: "UTC",
    now,
  }, {
    findMembership: async (workspaceId, userId) => {
      requested.push(`membership:${workspaceId}:${userId}`);
      return membership();
    },
    listRecurring: async (_actor, workspaceId) => {
      requested.push(`recurring:${workspaceId}`);
      return [recurring("current")];
    },
    listAccounts: async (_actor, workspaceId) => {
      requested.push(`accounts:${workspaceId}`);
      return [account()];
    },
    listCategories: async (_actor, workspaceId) => {
      requested.push(`categories:${workspaceId}`);
      return [category()];
    },
  });

  assert.deepEqual(requested, [
    "membership:workspace-a:member-1",
    "recurring:workspace-a",
    "accounts:workspace-a",
    "categories:workspace-a",
  ]);
  assert.equal(overview.items[0]?.account?.name, "Main account");
  assert.equal(overview.items[0]?.capabilities.canEdit, false);
});

test("overview rejects a foreign workspace before loading recurring rows", async () => {
  let loaded = false;
  await assert.rejects(
    getRecurringOverviewWithReaders({
      actor,
      workspaceId: "workspace-b",
      filter: "ALL",
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
    }),
    AuthorizationError,
  );
  assert.equal(loaded, false);
});

function containsFunction(value: unknown): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(containsFunction);
}
