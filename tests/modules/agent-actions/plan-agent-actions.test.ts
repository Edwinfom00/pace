import assert from "node:assert/strict";
import test from "node:test";

import { ConflictError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { AgentActionService } from "@/modules/agent-actions/agent-action-service";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { PlansService } from "@/modules/plans/plan-service";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryAgentActionRepository } from "../../support/in-memory-agent-action-repository";
import { InMemoryLedgerRepository, SYSTEM_GROCERIES_ID } from "../../support/in-memory-ledger-repository";
import { InMemoryPlansRepository } from "../../support/in-memory-plans-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const workspaceId = "workspace-one";

async function createFixture() {
  const actions = new InMemoryAgentActionRepository();
  const ledgerRecords = new InMemoryLedgerRepository();
  const planRecords = new InMemoryPlansRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const now = new Date("2026-09-14T00:00:00.000Z");
  const workspace: WorkspaceRecord = {
    id: workspaceId,
    name: "Household",
    slug: workspaceId,
    type: "FAMILY",
    createdByUserId: owner.userId,
    createdAt: now,
    updatedAt: now,
  };
  await workspaces.createWorkspaceWithOwner({
    workspace,
    preferences: { currency: "XAF", locale: "fr-CM", timezone: "Africa/Douala", weekStartsOn: 1 },
    owner: { workspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now },
  });
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const plans = new PlansService(planRecords, ledgerRecords, workspaces);
  const service = new AgentActionService(actions, ledger, ledgerRecords, workspaces, undefined, plans);
  return { actions, planRecords, plans, service };
}

test("a budget draft requires approval, persists once, and leaves an auditable verified action", async () => {
  const { actions, planRecords, service } = await createFixture();
  const draft = await service.createPlanDraft(owner, workspaceId, {
    actionType: "BUDGET_CREATE",
    scope: "CATEGORY",
    categoryId: SYSTEM_GROCERIES_ID,
    amountText: "50k",
    startsOnText: "2026-09",
    sourceText: "Create a 50k food budget for September",
    idempotencyKey: "budget-create",
  });
  assert.equal(draft.type, "BUDGET_CREATE");
  assert.equal(draft.draft.planType, "BUDGET");
  assert.equal(draft.draft.amountMinor, "50000");
  assert.deepEqual(draft.draft.missingFields, []);
  await service.requestApproval(owner, workspaceId, draft.id);
  await service.approveAction(owner, workspaceId, draft.id);
  const first = await service.executeApprovedPlan(owner, workspaceId, draft.id);
  const second = await service.executeApprovedPlan(owner, workspaceId, draft.id);
  assert.equal(first.planId, second.planId);
  assert.equal(planRecords.budgets.size, 1);
  assert.equal(planRecords.budgets.get(first.planId)?.createdByAgentActionId, draft.id);
  const audit = await actions.listAudit(workspaceId, draft.id);
  assert.deepEqual(audit.map((event) => event.event), [
    "DRAFT_CREATED",
    "APPROVAL_REQUESTED",
    "APPROVED",
    "EXECUTION_STARTED",
    "PERSISTENCE_VERIFIED",
  ]);
  assert.deepEqual(audit.at(-1)?.metadata, {
    planId: first.planId,
    planType: "BUDGET",
    operation: "CREATE",
  });
});

test("agent plan actions keep unresolved targets incomplete and support approved goal pauses", async () => {
  const { planRecords, plans, service } = await createFixture();
  const unresolved = await service.createPlanDraft(owner, workspaceId, {
    actionType: "BUDGET_UPDATE",
    budgetId: "00000000-0000-4000-8000-000000000999",
    amountText: "80k",
    sourceText: "Increase an unknown budget",
    idempotencyKey: "unknown-budget",
  });
  assert.equal(unresolved.draft.planType, "BUDGET");
  assert.equal(unresolved.draft.missingFields.includes("budget"), true);
  await assert.rejects(service.requestApproval(owner, workspaceId, unresolved.id), ConflictError);

  const malformed = await service.createPlanDraft(owner, workspaceId, {
    actionType: "SAVINGS_GOAL_CREATE",
    name: "Travel",
    targetAmountText: "100k",
    currentSavedText: "not money",
    sourceText: "Save 100k for travel",
    idempotencyKey: "malformed-goal",
  });
  assert.equal(malformed.draft.planType, "SAVINGS_GOAL");
  assert.equal(malformed.draft.missingFields.includes("currentSaved"), true);
  await assert.rejects(service.requestApproval(owner, workspaceId, malformed.id), ConflictError);

  const goal = await plans.createSavingsGoal(owner, workspaceId, {
    name: "Emergency fund",
    targetAmountMinor: 100_000n,
    targetDate: null,
  });
  const pause = await service.createPlanDraft(owner, workspaceId, {
    actionType: "SAVINGS_GOAL_UPDATE",
    goalId: goal.id,
    goalStatus: "PAUSED",
    sourceText: "Pause the emergency fund goal",
    idempotencyKey: "pause-goal",
  });
  assert.equal(pause.draft.planType, "SAVINGS_GOAL");
  assert.deepEqual(pause.draft.missingFields, []);
  await service.requestApproval(owner, workspaceId, pause.id);
  await service.approveAction(owner, workspaceId, pause.id);
  const result = await service.executeApprovedPlan(owner, workspaceId, pause.id);
  assert.equal(result.planId, goal.id);
  assert.equal(planRecords.goals.get(goal.id)?.status, "PAUSED");
  await assert.rejects(
    plans.updateSavingsGoal(owner, workspaceId, goal.id, { status: "COMPLETED" }),
    ConflictError,
  );
});
