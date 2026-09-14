import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError, NotFoundError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import { LedgerService } from "@/modules/ledger/ledger-service";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_OTHER_EXPENSE_ID,
  SYSTEM_TRANSPORT_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const member: AuthenticatedActor = { userId: "member-1", email: "member@pace.test", name: "Member" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";

async function createFixture() {
  const financial = new InMemoryFinancialInboxRepository();
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const service = new FinancialInboxService(financial, ledgerRecords, workspaces);
  const now = new Date("2026-09-14T00:00:00.000Z");
  for (const workspaceId of [workspaceOne, workspaceTwo]) {
    const workspace: WorkspaceRecord = {
      id: workspaceId,
      name: workspaceId,
      slug: workspaceId,
      type: "PERSONAL",
      createdByUserId: owner.userId,
      createdAt: now,
      updatedAt: now,
    };
    await workspaces.createWorkspaceWithOwner({
      workspace,
      preferences: { currency: "XAF", locale: "fr-CM", timezone: "Africa/Douala", weekStartsOn: 1 },
      owner: { workspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now },
    });
  }
  workspaces.addMembership({
    workspaceId: workspaceOne,
    userId: member.userId,
    role: "MEMBER",
    invitedByUserId: null,
    joinedAt: now,
  });
  const account = await ledger.createAccount(owner, workspaceOne, { name: "Bank", currency: "XAF" });
  const otherAccount = await ledger.createAccount(owner, workspaceTwo, { name: "Other bank", currency: "XAF" });
  return { account, financial, ledger, ledgerRecords, otherAccount, service };
}

async function createExpense(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  input: {
    merchant: string;
    occurredAt: string;
    amountMinor?: string;
    categoryId?: string;
    note?: string;
    workspaceId?: string;
  },
) {
  const workspaceId = input.workspaceId ?? workspaceOne;
  const account = workspaceId === workspaceOne ? fixture.account : fixture.otherAccount;
  const merchant = await fixture.ledger.createOrFindMerchant(owner, workspaceId, input.merchant);
  return fixture.ledger.createTransaction(owner, workspaceId, {
    kind: "EXPENSE",
    accountId: account.id,
    categoryId: input.categoryId ?? SYSTEM_OTHER_EXPENSE_ID,
    merchantId: merchant.id,
    amountMinor: input.amountMinor ?? "3500",
    currency: "XAF",
    occurredAt: `${input.occurredAt}T12:00:00.000Z`,
    note: input.note,
  });
}

test("Inbox lifecycle records a correction, reusable rule, and complete audit trail", async () => {
  const fixture = await createFixture();
  const first = await createExpense(fixture, { merchant: "City Taxi", occurredAt: "2026-09-01" });
  const ingested = await fixture.service.ingestTransaction(owner, workspaceOne, {
    transaction: first,
    aiSuggestion: {
      categoryId: SYSTEM_TRANSPORT_ID,
      confidence: 0.61,
      explanation: "The merchant appears to be a taxi company.",
    },
  });
  const review = ingested?.inboxItems.find((item) => item.reason === "CLASSIFICATION_REVIEW");
  assert.ok(review);
  assert.equal(review.status, "OPEN");

  const resolved = await fixture.service.resolveInboxItem(owner, workspaceOne, review.id, {
    action: "CREATE_RULE",
    categoryId: SYSTEM_TRANSPORT_ID,
  });
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(fixture.financial.rules.size, 1);
  assert.equal(fixture.financial.classifications.get(ingested!.classification.id)?.source, "USER_CORRECTION");

  const next = await createExpense(fixture, { merchant: "City Taxi", occurredAt: "2026-09-02" });
  const nextIngested = await fixture.service.ingestTransaction(owner, workspaceOne, { transaction: next });
  assert.equal(nextIngested?.classification.source, "USER_RULE");
  assert.equal(nextIngested?.classification.appliedCategoryId, SYSTEM_TRANSPORT_ID);
  assert.equal(nextIngested?.inboxItems.some((item) => item.reason === "CLASSIFICATION_REVIEW"), false);

  const audit = await fixture.financial.listAudit(workspaceOne, ingested!.classification.id, review.id);
  assert.deepEqual(
    audit.map((entry) => entry.event),
    ["INBOX_ITEM_CREATED", "CLASSIFICATION_CORRECTED", "CLASSIFICATION_RULE_CREATED", "INBOX_CREATE_RULE"],
  );
});

test("recurring candidates use cadence and amount tolerance, then move candidate to confirmed", async () => {
  const fixture = await createFixture();
  const inputs = [
    ["2026-06-01", "5000"],
    ["2026-07-01", "5100"],
    ["2026-07-31", "4950"],
  ] as const;
  let lastInboxId: string | null = null;
  for (const [occurredAt, amountMinor] of inputs) {
    const transaction = await createExpense(fixture, { merchant: "Netflix", occurredAt, amountMinor });
    const ingested = await fixture.service.ingestTransaction(owner, workspaceOne, { transaction });
    lastInboxId = ingested?.inboxItems.find((item) => item.reason === "POSSIBLE_RECURRING")?.id ?? lastInboxId;
  }
  assert.ok(lastInboxId);
  const recurringItem = await fixture.financial.findInboxItem(workspaceOne, lastInboxId);
  assert.equal(recurringItem?.reason, "POSSIBLE_RECURRING");
  assert.ok(recurringItem?.recurringPaymentId);
  const confirmed = await fixture.service.resolveInboxItem(owner, workspaceOne, recurringItem!.id, {
    action: "CONFIRM_RECURRING",
  });
  assert.equal(confirmed.status, "RESOLVED");
  assert.equal(
    (await fixture.financial.findRecurringPaymentById(workspaceOne, recurringItem!.recurringPaymentId!))?.status,
    "CONFIRMED",
  );

  const falsePositive = await createExpense(fixture, {
    merchant: "Transfer Station Cafe",
    occurredAt: "2026-08-30",
    note: "Lunch",
    categoryId: SYSTEM_GROCERIES_ID,
  });
  const falseIngested = await fixture.service.ingestTransaction(owner, workspaceOne, {
    transaction: falsePositive,
    aiSuggestion: {
      categoryId: SYSTEM_GROCERIES_ID,
      confidence: 0.6,
      explanation: "A restaurant-like merchant may need review.",
    },
  });
  assert.equal(falseIngested?.inboxItems.some((item) => item.reason === "POSSIBLE_TRANSFER"), false);
});

test("Inbox state and audit records remain workspace-scoped", async () => {
  const fixture = await createFixture();
  const transaction = await createExpense(fixture, { merchant: "City Taxi", occurredAt: "2026-09-04" });
  const ingested = await fixture.service.ingestTransaction(owner, workspaceOne, {
    transaction,
    aiSuggestion: { categoryId: SYSTEM_TRANSPORT_ID, confidence: 0.5, explanation: "Uncertain taxi." },
  });
  const item = ingested?.inboxItems[0];
  assert.ok(item);

  await assert.rejects(
    fixture.service.resolveInboxItem(owner, workspaceTwo, item.id, {
      action: "CLASSIFY_TRANSACTION",
      categoryId: SYSTEM_TRANSPORT_ID,
    }),
    NotFoundError,
  );
  await assert.rejects(
    fixture.service.resolveInboxItem(member, workspaceTwo, item.id, {
      action: "DISMISS",
    }),
    AuthorizationError,
  );
  assert.equal((await fixture.service.listInbox(owner, workspaceTwo)).length, 0);
  assert.equal((await fixture.service.listInbox(owner, workspaceOne)).length, 1);
});
