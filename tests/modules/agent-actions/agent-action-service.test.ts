import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError, NotFoundError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { AgentActionService } from "@/modules/agent-actions/agent-action-service";
import { calculateIncomeAndSpendingTotals } from "@/modules/ledger/totals";
import { LedgerService } from "@/modules/ledger/ledger-service";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryAgentActionRepository } from "../../support/in-memory-agent-action-repository";
import {
  InMemoryLedgerRepository,
  SYSTEM_OTHER_INCOME_ID,
  SYSTEM_TRANSPORT_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const member: AuthenticatedActor = { userId: "member-1", email: "member@pace.test", name: "Member" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";

async function createFixture() {
  const actions = new InMemoryAgentActionRepository();
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const service = new AgentActionService(actions, ledger, ledgerRecords, workspaces);

  for (const id of [workspaceOne, workspaceTwo]) {
    const now = new Date("2026-09-14T00:00:00.000Z");
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
    });
  }
  workspaces.addMembership({
    workspaceId: workspaceOne,
    userId: member.userId,
    role: "MEMBER",
    invitedByUserId: null,
    joinedAt: new Date(),
  });
  workspaces.addMembership({
    workspaceId: workspaceOne,
    userId: viewer.userId,
    role: "VIEWER",
    invitedByUserId: null,
    joinedAt: new Date(),
  });

  const bank = await ledger.createAccount(owner, workspaceOne, { name: "Bank", currency: "XAF" });
  return { actions, bank, ledger, ledgerRecords, service, workspaces };
}

function createDraft(
  service: AgentActionService,
  input: Partial<{
    kind: "EXPENSE" | "INCOME" | "TRANSFER";
    amountText: string;
    sourceText: string;
    accountHint: string;
    transferAccountHint: string;
    occurredAtText: string;
    idempotencyKey: string;
  }> = {},
) {
  return service.createTransactionDraft(owner, workspaceOne, {
    kind: "EXPENSE",
    amountText: "3500",
    sourceText: "taxi 3500",
    idempotencyKey: `test:${crypto.randomUUID()}`,
    ...input,
  });
}

test("natural-language intents become typed server-side drafts without model money arithmetic", async () => {
  const { bank, ledger, service } = await createFixture();
  const taxi = await createDraft(service);

  assert.equal(taxi.status, "DRAFT");
  assert.equal(taxi.draft.kind, "EXPENSE");
  assert.equal(taxi.draft.amountMinor, "3500");
  assert.equal(taxi.draft.currency, "XAF");
  assert.equal(taxi.draft.accountId, bank.id);
  assert.equal(taxi.draft.categoryId, SYSTEM_TRANSPORT_ID);
  assert.deepEqual(taxi.draft.missingFields, []);
  assert.match(taxi.draft.occurredAt ?? "", /^2026-09-14T12:00:00.000Z$/);

  const income = await createDraft(service, {
    kind: "INCOME",
    amountText: "150k",
    sourceText: "I received 150k today",
    occurredAtText: "today",
  });
  assert.equal(income.draft.amountMinor, "150000");
  assert.equal(income.draft.categoryId, SYSTEM_OTHER_INCOME_ID);

  const momo = await ledger.createAccount(owner, workspaceOne, { name: "MoMo", currency: "XAF" });
  const transfer = await createDraft(service, {
    kind: "TRANSFER",
    amountText: "25k",
    sourceText: "move 25k from Bank to MoMo",
    accountHint: "Bank",
    transferAccountHint: "MoMo",
  });
  assert.equal(transfer.draft.accountId, bank.id);
  assert.equal(transfer.draft.transferAccountId, momo.id);
  assert.equal(transfer.draft.categoryId, null);
  assert.equal(transfer.draft.amountMinor, "25000");
  assert.deepEqual(transfer.draft.missingFields, []);

  const ambiguous = await createDraft(service, {
    amountText: "500",
    sourceText: "expense 500",
  });
  assert.equal(ambiguous.status, "DRAFT");
  assert.equal(ambiguous.draft.categoryId, null);
  assert.equal(ambiguous.draft.missingFields.includes("category"), true);
  assert.equal(ambiguous.draft.missingFields.includes("account"), true);
});

test("agent actions enforce workspace permissions and do not disclose another workspace action", async () => {
  const { service } = await createFixture();
  await assert.rejects(
    service.createTransactionDraft(viewer, workspaceOne, {
      kind: "EXPENSE",
      amountText: "3500",
      sourceText: "taxi 3500",
      idempotencyKey: "viewer:one",
    }),
    AuthorizationError,
  );

  const other = await service.createTransactionDraft(owner, workspaceTwo, {
    kind: "EXPENSE",
    amountText: "3500",
    sourceText: "taxi 3500",
    idempotencyKey: "owner:two",
  });
  await assert.rejects(
    service.getActionDetail(owner, workspaceOne, other.id),
    NotFoundError,
  );

  const own = await createDraft(service, { idempotencyKey: "owner:one" });
  await assert.rejects(service.requestApproval(member, workspaceOne, own.id), AuthorizationError);
});

test("approval and rejection are durable lifecycle transitions with an audit trail", async () => {
  const { actions, ledgerRecords, service } = await createFixture();
  const action = await createDraft(service, { idempotencyKey: "reject-me" });
  const waiting = await service.requestApproval(owner, workspaceOne, action.id);
  assert.equal(waiting.status, "WAITING_APPROVAL");
  const rejected = await service.rejectAction(owner, workspaceOne, action.id);
  assert.equal(rejected.status, "REJECTED");
  assert.equal(ledgerRecords.transactions.size, 0);
  const events = await actions.listAudit(workspaceOne, action.id);
  assert.deepEqual(events.map((event) => event.event), ["DRAFT_CREATED", "APPROVAL_REQUESTED", "REJECTED"]);
});

test("approved execution is idempotent and verifies the persisted transaction", async () => {
  const { actions, ledgerRecords, service } = await createFixture();
  const action = await createDraft(service, { idempotencyKey: "execute-once" });
  await service.requestApproval(owner, workspaceOne, action.id);
  await service.approveAction(owner, workspaceOne, action.id);

  const first = await service.executeApprovedTransaction(owner, workspaceOne, action.id);
  const second = await service.executeApprovedTransaction(owner, workspaceOne, action.id);
  assert.equal(first.transactionId, second.transactionId);
  assert.equal(ledgerRecords.transactions.size, 1);
  const persisted = ledgerRecords.transactions.get(first.transactionId);
  assert.equal(persisted?.source.agentActionId, action.id);
  assert.equal(persisted?.deduplicationFingerprint, `agent-action:${action.id}`);
  assert.equal((await actions.findAction(workspaceOne, action.id))?.status, "COMPLETED");
});

test("transfers stay out of income and spending totals after approved execution", async () => {
  const { ledger, service } = await createFixture();
  const momo = await ledger.createAccount(owner, workspaceOne, { name: "MoMo", currency: "XAF" });
  const transfer = await createDraft(service, {
    kind: "TRANSFER",
    amountText: "25k",
    sourceText: "move 25k from Bank to MoMo",
    accountHint: "Bank",
    transferAccountHint: "MoMo",
    idempotencyKey: "transfer-once",
  });
  assert.ok(momo.id);
  await service.requestApproval(owner, workspaceOne, transfer.id);
  await service.approveAction(owner, workspaceOne, transfer.id);
  await service.executeApprovedTransaction(owner, workspaceOne, transfer.id);

  const transactions = await ledger.listTransactions(owner, workspaceOne);
  assert.equal(transactions[0]?.kind, "TRANSFER");
  assert.equal(transactions[0]?.categoryId, null);
  assert.deepEqual(calculateIncomeAndSpendingTotals(transactions, "XAF"), {
    incomeMinor: 0n,
    spendingMinor: 0n,
  });
});
