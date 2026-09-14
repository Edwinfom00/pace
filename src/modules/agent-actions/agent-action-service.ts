import { randomUUID } from "node:crypto";

import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { AuthenticatedActor } from "@/authorization/session";
import type { LedgerAccountRecord, LedgerCategoryRecord, LedgerTransactionRecord } from "@/modules/ledger/domain";
import { LedgerService } from "@/modules/ledger/ledger-service";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceMemberContext } from "@/modules/workspaces/domain";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";
import type { TransactionClassificationRequest } from "@/modules/financial-inbox/financial-inbox-service";
import type { PlansContext, PlansService } from "@/modules/plans/plan-service";
import type { BudgetRecord, SavingsGoalRecord } from "@/modules/plans/domain";

import {
  type AgentActionRecord,
  type AgentActionStatus,
  isAgentActionDraftReady,
  isPlanAction,
  isTransactionAction,
  type PlanAgentActionRecord,
  type PlanActionResult,
  type TransactionAgentActionRecord,
  type TransactionActionResult,
  type TransactionDraft,
} from "./domain";
import { buildPlanDraft, type PlanDraftIntent } from "./plan-draft";
import type { AgentActionRepository } from "./repositories/agent-action-repository";
import {
  buildTransactionDraft,
  type TransactionDraftIntent,
} from "./transaction-draft";

export interface CreateTransactionDraftInput extends TransactionDraftIntent {
  idempotencyKey: string;
  eveSessionId?: string | null;
  eveCallId?: string | null;
}

export interface EditTransactionDraftInput {
  amountText?: string | null;
  occurredAtText?: string | null;
  accountId?: string | null;
  transferAccountId?: string | null;
  categoryId?: string | null;
  merchantName?: string | null;
  note?: string | null;
}

export interface CreatePlanDraftInput extends PlanDraftIntent {
  idempotencyKey: string;
  eveSessionId?: string | null;
  eveCallId?: string | null;
}

export type EditPlanDraftInput = Omit<Partial<PlanDraftIntent>, "actionType" | "budgetId" | "goalId">;

export interface AgentTransactionContext {
  workspaceId: string;
  currency: string;
  locale: string;
  timezone: string;
  accounts: readonly Pick<LedgerAccountRecord, "id" | "name" | "currency">[];
  categories: readonly Pick<LedgerCategoryRecord, "id" | "name" | "kind">[];
}

export interface TransactionActionDetail {
  action: AgentActionRecord & { readonly type: "TRANSACTION_CREATE"; readonly draft: TransactionDraft };
  transactionContext: AgentTransactionContext;
}

export interface PlanActionDetail {
  action: AgentActionRecord;
  planContext: PlansContext;
}

export type AgentActionDetail = TransactionActionDetail | PlanActionDetail;

interface TransactionClassifier {
  ingestTransaction(
    actor: AuthenticatedActor,
    workspaceId: string,
    request: TransactionClassificationRequest,
  ): Promise<unknown>;
}

/**
 * The only server-side path from an LLM-produced draft to M2's ledger. The
 * model never receives a Drizzle handle or computes an amount; execution
 * rechecks membership, approval, draft completeness, and persistence.
 */
export class AgentActionService {
  constructor(
    private readonly actions: AgentActionRepository,
    private readonly ledger: LedgerService,
    private readonly ledgerRecords: Pick<LedgerRepository, "findTransactionByFingerprint">,
    private readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">,
    private readonly classifier?: TransactionClassifier,
    private readonly plans?: PlansService,
  ) {}

  async getTransactionContext(
    actor: AuthenticatedActor,
    workspaceId: string,
  ): Promise<AgentTransactionContext> {
    const context = await this.requireLedgerContext(actor, workspaceId);
    const [accounts, categories] = await Promise.all([
      this.ledger.listAccounts(actor, workspaceId),
      this.ledger.listCategories(actor, workspaceId),
    ]);
    return this.presentTransactionContext(context, accounts, categories);
  }

  async createTransactionDraft(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: CreateTransactionDraftInput,
  ): Promise<TransactionAgentActionRecord> {
    const existing = await this.actions.findActionByIdempotencyKey(workspaceId, input.idempotencyKey);
    if (existing) {
      const action = await this.requireActionInitiator(actor, workspaceId, existing.id);
      if (!isTransactionAction(action)) throw new ConflictError("Idempotency key belongs to another action type.");
      return action;
    }

    const [context, transactionContext] = await Promise.all([
      this.requireLedgerContext(actor, workspaceId),
      this.getTransactionContext(actor, workspaceId),
    ]);
    const draft = buildTransactionDraft(input, {
      currency: context.preferences.currency,
      timezone: context.preferences.timezone,
      accounts: transactionContext.accounts.map((account) => ({
        ...account,
        openingBalanceMinor: 0n,
        workspaceId,
        createdByUserId: actor.userId,
        archivedAt: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })),
      categories: (await this.ledger.listCategories(actor, workspaceId)),
    });

    const created = await this.actions.createAction({
      id: randomUUID(),
      workspaceId,
      type: "TRANSACTION_CREATE",
      initiatedByUserId: actor.userId,
      draft,
      idempotencyKey: input.idempotencyKey,
      eveSessionId: input.eveSessionId ?? null,
      eveCallId: input.eveCallId ?? null,
    });
    await this.audit(created, actor.userId, "DRAFT_CREATED", null, "DRAFT");
    if (!isTransactionAction(created)) throw new Error("Created action was not a transaction.");
    return created;
  }

  async getPlanContext(actor: AuthenticatedActor, workspaceId: string): Promise<PlansContext> {
    return this.requirePlans().getContext(actor, workspaceId);
  }

  async getPlanStatus(actor: AuthenticatedActor, workspaceId: string): Promise<{
    budgets: Awaited<ReturnType<PlansService["listBudgetSummaries"]>>;
    savingsGoals: Awaited<ReturnType<PlansService["listSavingsGoalSummaries"]>>;
  }> {
    const plans = this.requirePlans();
    const [budgets, savingsGoals] = await Promise.all([
      plans.listBudgetSummaries(actor, workspaceId),
      plans.listSavingsGoalSummaries(actor, workspaceId),
    ]);
    return { budgets, savingsGoals };
  }

  async createPlanDraft(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: CreatePlanDraftInput,
  ): Promise<PlanAgentActionRecord> {
    const existing = await this.actions.findActionByIdempotencyKey(workspaceId, input.idempotencyKey);
    if (existing) {
      const action = await this.requireActionInitiator(actor, workspaceId, existing.id);
      if (!isPlanAction(action)) throw new ConflictError("Idempotency key belongs to another action type.");
      return action;
    }
    const context = await this.getPlanContext(actor, workspaceId);
    const draft = buildPlanDraft(input, {
      currency: context.currency,
      timezone: context.timezone,
      categories: await this.ledger.listCategories(actor, workspaceId),
      budgets: context.budgets,
      savingsGoals: context.savingsGoals,
    });
    const created = await this.actions.createAction({
      id: randomUUID(),
      workspaceId,
      type: input.actionType,
      initiatedByUserId: actor.userId,
      draft,
      idempotencyKey: input.idempotencyKey,
      eveSessionId: input.eveSessionId ?? null,
      eveCallId: input.eveCallId ?? null,
    });
    await this.audit(created, actor.userId, "DRAFT_CREATED", null, "DRAFT", { planType: draft.planType });
    if (!isPlanAction(created)) throw new Error("Created action was not a plan.");
    return created;
  }

  async getActionDetail(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
  ): Promise<AgentActionDetail> {
    const action = await this.requireActionInitiator(actor, workspaceId, actionId);
    if (isTransactionAction(action)) {
      return { action, transactionContext: await this.getTransactionContext(actor, workspaceId) };
    }
    if (isPlanAction(action)) {
      return { action, planContext: await this.getPlanContext(actor, workspaceId) };
    }
    throw new ConflictError("Agent action has an unsupported draft.");
  }

  async editTransactionDraft(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
    input: EditTransactionDraftInput,
  ): Promise<AgentActionRecord> {
    const action = await this.requireActionInitiator(actor, workspaceId, actionId);
    if (!isTransactionAction(action)) throw new ConflictError("This is not a transaction draft.");
    if (action.status !== "DRAFT") {
      throw new ConflictError("Only a draft agent action can be edited.");
    }

    const context = await this.requireLedgerContext(actor, workspaceId);
    const [accounts, categories] = await Promise.all([
      this.ledger.listAccounts(actor, workspaceId),
      this.ledger.listCategories(actor, workspaceId),
    ]);
    const draft = this.applyDraftEdit(action.draft, input, context, accounts, categories);
    const updated = await this.actions.updateDraft(workspaceId, action.id, draft);
    if (!updated) throw new ConflictError("This draft changed before it could be updated.");
    await this.audit(updated, actor.userId, "DRAFT_UPDATED", "DRAFT", "DRAFT");
    if (!isTransactionAction(updated)) throw new Error("Updated action was not a transaction.");
    return updated;
  }

  async editPlanDraft(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
    input: EditPlanDraftInput,
  ): Promise<AgentActionRecord> {
    const action = await this.requireActionInitiator(actor, workspaceId, actionId);
    if (!isPlanAction(action)) throw new ConflictError("This is not a plan draft.");
    if (action.status !== "DRAFT") throw new ConflictError("Only a draft agent action can be edited.");
    const context = await this.getPlanContext(actor, workspaceId);
    const current = action.draft;
    const draft = buildPlanDraft(
      {
        actionType: action.type,
        budgetId: current.planType === "BUDGET" ? current.budgetId : undefined,
        goalId: current.planType === "SAVINGS_GOAL" ? current.goalId : undefined,
        scope: current.planType === "BUDGET" ? current.scope : undefined,
        categoryId: current.planType === "BUDGET" ? current.categoryId : undefined,
        amountText: current.planType === "BUDGET" ? current.amountText : undefined,
        startsOnText: current.planType === "BUDGET" ? current.startsOn?.slice(0, 10) : undefined,
        endsOnText: current.planType === "BUDGET" ? current.endsOn?.slice(0, 10) : undefined,
        budgetStatus: current.planType === "BUDGET" ? current.status : undefined,
        name: current.planType === "SAVINGS_GOAL" ? current.name : undefined,
        targetAmountText: current.planType === "SAVINGS_GOAL" ? current.targetAmountText : undefined,
        currentSavedText: current.planType === "SAVINGS_GOAL" ? current.currentSavedText : undefined,
        targetDateText: current.planType === "SAVINGS_GOAL" ? current.targetDate?.slice(0, 10) : undefined,
        goalStatus: current.planType === "SAVINGS_GOAL" ? current.status : undefined,
        sourceText: current.sourceText,
        ...input,
      },
      {
        currency: context.currency,
        timezone: context.timezone,
        categories: await this.ledger.listCategories(actor, workspaceId),
        budgets: context.budgets,
        savingsGoals: context.savingsGoals,
      },
    );
    const updated = await this.actions.updateDraft(workspaceId, action.id, draft);
    if (!updated) throw new ConflictError("This draft changed before it could be updated.");
    await this.audit(updated, actor.userId, "DRAFT_UPDATED", "DRAFT", "DRAFT", { planType: draft.planType });
    return updated;
  }

  async requestApproval(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
  ): Promise<AgentActionRecord> {
    const action = await this.requireActionInitiator(actor, workspaceId, actionId);
    if (action.status === "WAITING_APPROVAL") return action;
    if (action.status !== "DRAFT") {
      throw new ConflictError("Only a new draft can be sent for approval.");
    }
    if (!isAgentActionDraftReady(action.draft)) {
      throw new ConflictError("Complete the draft before requesting approval.");
    }

    const transitioned = await this.actions.transitionAction({
      workspaceId,
      actionId,
      from: ["DRAFT"],
      to: "WAITING_APPROVAL",
    });
    if (!transitioned) {
      const current = await this.requireActionInitiator(actor, workspaceId, actionId);
      if (current.status === "WAITING_APPROVAL") return current;
      throw new ConflictError("This action changed before approval could be requested.");
    }
    await this.audit(transitioned, actor.userId, "APPROVAL_REQUESTED", "DRAFT", "WAITING_APPROVAL");
    return transitioned;
  }

  async approveAction(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
  ): Promise<AgentActionRecord> {
    const action = await this.requireActionInitiator(actor, workspaceId, actionId);
    if (action.status === "APPROVED") return action;
    if (action.status !== "WAITING_APPROVAL") {
      throw new ConflictError("This action is not awaiting approval.");
    }

    const transitioned = await this.actions.transitionAction({
      workspaceId,
      actionId,
      from: ["WAITING_APPROVAL"],
      to: "APPROVED",
      approvedByUserId: actor.userId,
    });
    if (!transitioned) throw new ConflictError("This action changed before it could be approved.");
    await this.audit(transitioned, actor.userId, "APPROVED", "WAITING_APPROVAL", "APPROVED");
    return transitioned;
  }

  async rejectAction(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
  ): Promise<AgentActionRecord> {
    const action = await this.requireActionInitiator(actor, workspaceId, actionId);
    if (action.status === "REJECTED") return action;
    if (action.status !== "WAITING_APPROVAL") {
      throw new ConflictError("This action is not awaiting approval.");
    }

    const transitioned = await this.actions.transitionAction({
      workspaceId,
      actionId,
      from: ["WAITING_APPROVAL"],
      to: "REJECTED",
    });
    if (!transitioned) throw new ConflictError("This action changed before it could be rejected.");
    await this.audit(transitioned, actor.userId, "REJECTED", "WAITING_APPROVAL", "REJECTED");
    return transitioned;
  }

  async executeApprovedTransaction(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
  ): Promise<TransactionActionResult> {
    let action = await this.requireActionInitiator(actor, workspaceId, actionId);
    if (!isTransactionAction(action)) throw new ConflictError("This action does not create a transaction.");
    if (action.status === "COMPLETED" && action.result) return action.result;
    if (action.status !== "APPROVED" && action.status !== "EXECUTING") {
      throw new ConflictError("Only an approved action can be executed.");
    }

    if (action.status === "APPROVED") {
      const transitioned = await this.actions.transitionAction({
        workspaceId,
        actionId,
        from: ["APPROVED"],
        to: "EXECUTING",
      });
      if (transitioned) {
        await this.audit(transitioned, actor.userId, "EXECUTION_STARTED", "APPROVED", "EXECUTING");
        action = transitioned;
      } else {
        action = await this.requireActionInitiator(actor, workspaceId, actionId);
        if (!isTransactionAction(action)) throw new ConflictError("This action does not create a transaction.");
        if (action.status === "COMPLETED" && action.result) return action.result;
        if (action.status !== "EXECUTING") {
          throw new ConflictError("This action changed before it could be executed.");
        }
      }
    }

    try {
      const fingerprint = this.transactionFingerprint(action.id);
      let transaction = await this.ledgerRecords.findTransactionByFingerprint(workspaceId, fingerprint);
      if (!transaction) {
        try {
          transaction = await this.ledger.createTransaction(
            actor,
            workspaceId,
            await this.toLedgerInput(actor, workspaceId, action),
          );
        } catch (error) {
          if (!(error instanceof ConflictError)) throw error;
          transaction = await this.ledgerRecords.findTransactionByFingerprint(workspaceId, fingerprint);
          if (!transaction) throw error;
        }
      }

      this.assertPersistedTransactionMatches(action, transaction);
      const result: TransactionActionResult = {
        transactionId: transaction.id,
        kind: transaction.kind as TransactionActionResult["kind"],
        verifiedAt: new Date().toISOString(),
      };
      const completed = await this.actions.transitionAction({
        workspaceId,
        actionId,
        from: ["EXECUTING"],
        to: "COMPLETED",
        result,
        failureCode: null,
        failureMessage: null,
      });
      if (completed) {
        await this.audit(completed, actor.userId, "PERSISTENCE_VERIFIED", "EXECUTING", "COMPLETED", {
          transactionId: transaction.id,
        });
        // Classification is an audited, non-ledger overlay. A problem creating
        // review work must never roll back or mark an already-verified money
        // mutation as failed.
        try {
          await this.classifier?.ingestTransaction(actor, workspaceId, { transaction });
        } catch (classificationError) {
          await this.audit(completed, actor.userId, "CLASSIFICATION_DEFERRED", "COMPLETED", "COMPLETED", {
            message:
              classificationError instanceof Error
                ? classificationError.message.slice(0, 1_000)
                : "Unknown classification failure.",
          });
        }
        return result;
      }

      const current = await this.requireActionInitiator(actor, workspaceId, actionId);
      if (isTransactionAction(current) && current.status === "COMPLETED" && current.result) return current.result;
      throw new ConflictError("This action changed while its transaction was being verified.");
    } catch (error) {
      await this.failAction(actor, workspaceId, actionId, error);
      throw error;
    }
  }

  async executeApprovedPlan(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
  ): Promise<PlanActionResult> {
    let action = await this.requireActionInitiator(actor, workspaceId, actionId);
    if (!isPlanAction(action)) throw new ConflictError("This action does not change a plan.");
    if (action.status === "COMPLETED" && action.result) return action.result;
    if (action.status !== "APPROVED" && action.status !== "EXECUTING") {
      throw new ConflictError("Only an approved action can be executed.");
    }
    if (action.status === "APPROVED") {
      const transitioned = await this.actions.transitionAction({
        workspaceId,
        actionId,
        from: ["APPROVED"],
        to: "EXECUTING",
      });
      if (transitioned) {
        await this.audit(transitioned, actor.userId, "EXECUTION_STARTED", "APPROVED", "EXECUTING");
        action = transitioned;
      } else {
        action = await this.requireActionInitiator(actor, workspaceId, actionId);
        if (!isPlanAction(action)) throw new ConflictError("This action does not change a plan.");
        if (action.status === "COMPLETED" && action.result) return action.result;
        if (action.status !== "EXECUTING") throw new ConflictError("This action changed before it could be executed.");
      }
    }
    try {
      if (!isPlanAction(action)) throw new ConflictError("This action does not change a plan.");
      const record = await this.persistPlanAction(actor, workspaceId, action);
      const result: PlanActionResult = {
        planType: action.draft.planType,
        planId: record.id,
        operation: action.draft.operation,
        verifiedAt: new Date().toISOString(),
      };
      const completed = await this.actions.transitionAction({
        workspaceId,
        actionId,
        from: ["EXECUTING"],
        to: "COMPLETED",
        result,
        failureCode: null,
        failureMessage: null,
      });
      if (completed) {
        await this.audit(completed, actor.userId, "PERSISTENCE_VERIFIED", "EXECUTING", "COMPLETED", {
          planId: record.id,
          planType: action.draft.planType,
          operation: action.draft.operation,
        });
        return result;
      }
      const current = await this.requireActionInitiator(actor, workspaceId, actionId);
      if (isPlanAction(current) && current.status === "COMPLETED" && current.result) return current.result;
      throw new ConflictError("This action changed while its plan was being verified.");
    } catch (error) {
      await this.failAction(actor, workspaceId, actionId, error);
      throw error;
    }
  }

  private async requireLedgerContext(
    actor: AuthenticatedActor,
    workspaceId: string,
  ): Promise<WorkspaceMemberContext> {
    const context = await this.workspaces.findMemberContext(workspaceId, actor.userId);
    if (!context) throw new AuthorizationError("You are not a member of this workspace.");
    assertWorkspacePermission(context.membership.role, "manage_ledger");
    return context;
  }

  private async persistPlanAction(
    actor: AuthenticatedActor,
    workspaceId: string,
    action: AgentActionRecord,
  ): Promise<BudgetRecord | SavingsGoalRecord> {
    if (!isPlanAction(action) || !isAgentActionDraftReady(action.draft)) {
      throw new ConflictError("The approved action has an incomplete plan draft.");
    }
    const service = this.requirePlans();
    const draft = action.draft;
    if (draft.planType === "BUDGET") {
      if (!draft.scope || !draft.amountMinor || !draft.startsOn || !draft.status) {
        throw new ConflictError("The approved budget draft is incomplete.");
      }
      if (draft.operation === "CREATE") {
        const prior = await service.findBudgetCreatedByAction(actor, workspaceId, action.id);
        const record = prior ?? await service.createBudget(actor, workspaceId, {
          scope: draft.scope,
          categoryId: draft.scope === "OVERALL" ? null : draft.categoryId,
          amountMinor: BigInt(draft.amountMinor),
          startsOn: new Date(draft.startsOn),
          endsOn: draft.endsOn ? new Date(draft.endsOn) : null,
          agentActionId: action.id,
        });
        this.assertBudgetMatchesDraft(record, draft, action.id);
        return record;
      }
      if (!draft.budgetId) throw new ConflictError("The approved budget draft has no target.");
      const record = await service.updateBudget(actor, workspaceId, draft.budgetId, {
        scope: draft.scope,
        categoryId: draft.scope === "OVERALL" ? null : draft.categoryId,
        amountMinor: BigInt(draft.amountMinor),
        startsOn: new Date(draft.startsOn),
        endsOn: draft.endsOn ? new Date(draft.endsOn) : null,
        status: draft.status,
      });
      this.assertBudgetMatchesDraft(record, draft);
      return record;
    }

    if (!draft.name || !draft.targetAmountMinor || !draft.status) {
      throw new ConflictError("The approved savings-goal draft is incomplete.");
    }
    const currentSavedMinor = BigInt(draft.currentSavedMinor ?? "0");
    if (draft.operation === "CREATE") {
      const prior = await service.findSavingsGoalCreatedByAction(actor, workspaceId, action.id);
      const record = prior ?? await service.createSavingsGoal(actor, workspaceId, {
        name: draft.name,
        targetAmountMinor: BigInt(draft.targetAmountMinor),
        currentSavedMinor,
        targetDate: draft.targetDate ? new Date(draft.targetDate) : null,
        agentActionId: action.id,
      });
      this.assertSavingsGoalMatchesDraft(record, draft, action.id);
      return record;
    }
    if (!draft.goalId) throw new ConflictError("The approved savings-goal draft has no target.");
    const record = await service.updateSavingsGoal(actor, workspaceId, draft.goalId, {
      name: draft.name,
      targetAmountMinor: BigInt(draft.targetAmountMinor),
      currentSavedMinor,
      targetDate: draft.targetDate ? new Date(draft.targetDate) : null,
      status: draft.status,
    });
    this.assertSavingsGoalMatchesDraft(record, draft);
    return record;
  }

  private async requireActionInitiator(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId?: string,
  ): Promise<AgentActionRecord> {
    await this.requireLedgerContext(actor, workspaceId);
    if (!actionId) {
      throw new NotFoundError("An agent action id is required.");
    }
    const action = await this.actions.findAction(workspaceId, actionId);
    if (!action) throw new NotFoundError("Agent action not found in this workspace.");
    if (action.initiatedByUserId !== actor.userId) {
      throw new AuthorizationError("Only the member who created this action can approve or execute it.");
    }
    return action;
  }

  private applyDraftEdit(
    current: TransactionDraft,
    input: EditTransactionDraftInput,
    workspace: WorkspaceMemberContext,
    accounts: readonly LedgerAccountRecord[],
    categories: readonly LedgerCategoryRecord[],
  ): TransactionDraft {
    const account = this.selectedAccount(input.accountId, current.accountId, accounts);
    const transferAccount = this.selectedAccount(
      input.transferAccountId,
      current.transferAccountId,
      accounts,
    );
    const category = this.selectedCategory(input.categoryId, current.categoryId, categories);

    return buildTransactionDraft(
      {
        kind: current.kind,
        amountText: input.amountText ?? current.amountText,
        occurredAtText: input.occurredAtText ?? current.occurredAt?.slice(0, 10),
        accountHint: account?.name ?? null,
        transferAccountHint: transferAccount?.name ?? null,
        categoryHint: category?.name ?? null,
        merchantName: input.merchantName ?? current.merchantName,
        note: input.note ?? current.note,
        sourceText: current.sourceText,
      },
      {
        currency: workspace.preferences.currency,
        timezone: workspace.preferences.timezone,
        accounts,
        categories,
      },
    );
  }

  private selectedAccount(
    selected: string | null | undefined,
    fallback: string | null,
    accounts: readonly LedgerAccountRecord[],
  ): LedgerAccountRecord | null {
    const id = selected === undefined ? fallback : selected;
    if (!id) return null;
    const account = accounts.find((candidate) => candidate.id === id);
    if (!account) throw new NotFoundError("Account not found in this workspace.");
    return account;
  }

  private selectedCategory(
    selected: string | null | undefined,
    fallback: string | null,
    categories: readonly LedgerCategoryRecord[],
  ): LedgerCategoryRecord | null {
    const id = selected === undefined ? fallback : selected;
    if (!id) return null;
    const category = categories.find((candidate) => candidate.id === id);
    if (!category) throw new NotFoundError("Category not found in this workspace.");
    return category;
  }

  private presentTransactionContext(
    workspace: WorkspaceMemberContext,
    accounts: readonly LedgerAccountRecord[],
    categories: readonly LedgerCategoryRecord[],
  ): AgentTransactionContext {
    return {
      workspaceId: workspace.workspace.id,
      currency: workspace.preferences.currency,
      locale: workspace.preferences.locale,
      timezone: workspace.preferences.timezone,
      accounts: accounts.map(({ id, name, currency }) => ({ id, name, currency })),
      categories: categories.map(({ id, name, kind }) => ({ id, name, kind })),
    };
  }

  private async toLedgerInput(
    actor: AuthenticatedActor,
    workspaceId: string,
    action: AgentActionRecord,
  ): Promise<unknown> {
    if (!isTransactionAction(action)) throw new ConflictError("This action does not create a transaction.");
    const draft = action.draft;
    if (!isAgentActionDraftReady(draft) || !draft.amountMinor || !draft.occurredAt || !draft.accountId) {
      throw new ConflictError("The approved action has an incomplete transaction draft.");
    }

    const merchant =
      draft.kind === "TRANSFER" || !draft.merchantName
        ? null
        : await this.ledger.createOrFindMerchant(actor, workspaceId, draft.merchantName);
    const common = {
      amountMinor: draft.amountMinor,
      currency: draft.currency,
      occurredAt: draft.occurredAt,
      source: { provider: "pace-agent", agentActionId: action.id },
      deduplicationFingerprint: this.transactionFingerprint(action.id),
      note: draft.note ?? draft.merchantName ?? undefined,
    };

    if (draft.kind === "TRANSFER") {
      return {
        kind: "TRANSFER",
        ...common,
        accountId: draft.accountId,
        transferAccountId: draft.transferAccountId,
      };
    }

    return {
      kind: draft.kind,
      ...common,
      accountId: draft.accountId,
      categoryId: draft.categoryId,
      ...(merchant ? { merchantId: merchant.id } : {}),
    };
  }

  private assertPersistedTransactionMatches(
    action: AgentActionRecord,
    transaction: LedgerTransactionRecord,
  ): void {
    if (!isTransactionAction(action)) throw new Error("Persisted transaction action was not a transaction.");
    const draft = action.draft;
    if (
      transaction.workspaceId !== action.workspaceId ||
      transaction.kind !== draft.kind ||
      transaction.amountMinor.toString() !== draft.amountMinor ||
      transaction.currency !== draft.currency ||
      transaction.accountId !== draft.accountId ||
      transaction.deduplicationFingerprint !== this.transactionFingerprint(action.id) ||
      transaction.source.agentActionId !== action.id
    ) {
      throw new Error("Persisted transaction verification failed.");
    }
    if (draft.kind === "TRANSFER") {
      if (
        transaction.transferAccountId !== draft.transferAccountId ||
        transaction.categoryId !== null ||
        transaction.merchantId !== null
      ) {
        throw new Error("Persisted transfer verification failed.");
      }
    } else if (transaction.transferAccountId !== null || transaction.categoryId !== draft.categoryId) {
      throw new Error("Persisted transaction verification failed.");
    }
  }

  private assertBudgetMatchesDraft(
    record: BudgetRecord,
    draft: Extract<AgentActionRecord["draft"], { planType: "BUDGET" }>,
    createdByAgentActionId?: string | null,
  ): void {
    if (
      record.scope !== draft.scope ||
      record.categoryId !== (draft.scope === "OVERALL" ? null : draft.categoryId) ||
      record.amountMinor.toString() !== draft.amountMinor ||
      record.startsOn.toISOString() !== draft.startsOn ||
      (record.endsOn?.toISOString() ?? null) !== draft.endsOn ||
      record.status !== draft.status ||
      (createdByAgentActionId !== undefined && record.createdByAgentActionId !== createdByAgentActionId)
    ) {
      throw new Error("Persisted budget verification failed.");
    }
  }

  private assertSavingsGoalMatchesDraft(
    record: SavingsGoalRecord,
    draft: Extract<AgentActionRecord["draft"], { planType: "SAVINGS_GOAL" }>,
    createdByAgentActionId?: string | null,
  ): void {
    if (
      record.name !== draft.name ||
      record.targetAmountMinor.toString() !== draft.targetAmountMinor ||
      record.currentSavedMinor.toString() !== (draft.currentSavedMinor ?? "0") ||
      (record.targetDate?.toISOString() ?? null) !== draft.targetDate ||
      (createdByAgentActionId !== undefined && record.createdByAgentActionId !== createdByAgentActionId)
    ) {
      throw new Error("Persisted savings-goal verification failed.");
    }
  }

  private async failAction(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : "Unknown execution failure.";
    const failed = await this.actions.transitionAction({
      workspaceId,
      actionId,
      from: ["EXECUTING"],
      to: "FAILED",
      failureCode: "EXECUTION_FAILED",
      failureMessage: message.slice(0, 1_000),
    });
    if (failed) {
      await this.audit(failed, actor.userId, "EXECUTION_FAILED", "EXECUTING", "FAILED", {
        message: failed.failureMessage,
      });
    }
  }

  private async audit(
    action: AgentActionRecord,
    actorUserId: string | null,
    event: string,
    fromStatus: AgentActionStatus | null,
    toStatus: AgentActionStatus | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.actions.createAudit({
      id: randomUUID(),
      actionId: action.id,
      workspaceId: action.workspaceId,
      actorUserId,
      event,
      fromStatus,
      toStatus,
      metadata,
    });
  }

  private transactionFingerprint(actionId: string): string {
    return `agent-action:${actionId}`;
  }

  private requirePlans(): PlansService {
    if (!this.plans) throw new Error("Plans service is unavailable.");
    return this.plans;
  }
}
