import { randomUUID } from "node:crypto";

import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { AuthenticatedActor } from "@/authorization/session";
import { correctTransactionSchema } from "@/modules/ledger/correct-transaction-contract";
import type { LedgerAccountRecord, LedgerCategoryRecord, LedgerTransactionRecord } from "@/modules/ledger/domain";
import { manageAccountSchema } from "@/modules/ledger/manage-account-contract";
import { parseTransactionDetailsPatch } from "@/modules/ledger/update-transaction-details-contract";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { createLedgerAccountSchema } from "@/modules/ledger/validation";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceMemberContext } from "@/modules/workspaces/domain";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";
import type {
  FinancialInboxService,
  RecurringPaymentView,
  TransactionClassificationRequest,
} from "@/modules/financial-inbox/financial-inbox-service";
import {
  inboxReasonHasResolution,
  isCategoryInboxOperation,
} from "@/modules/financial-inbox/agent-inbox-query";
import {
  agentInboxUnavailableReason,
  presentAgentInboxItem,
  type AgentInboxStateReader,
} from "@/modules/financial-inbox/queries/agent-inbox-reads";
import type { PlansContext, PlansService } from "@/modules/plans/plan-service";
import type { BudgetRecord, SavingsGoalRecord } from "@/modules/plans/domain";
import { buildRecurringOverview } from "@/modules/recurring/domain/recurring-overview";
import { withRecurringDisplayNames } from "@/modules/recurring/domain/recurring-reference";

import {
  accountManagementCommand,
  buildAccountDraft,
  presentDraftAccount,
  type AccountDraftIntent,
} from "./account-draft";
import {
  type AccountActionResult,
  type AccountAgentActionRecord,
  type AccountDraft,
  type AgentActionRecord,
  type AgentActionStatus,
  type InboxActionResult,
  type InboxAgentActionRecord,
  type InboxResolutionDraft,
  isAccountAction,
  isAccountDraftReady,
  isAgentActionDraftReady,
  isInboxAction,
  isInboxDraftReady,
  isPlanAction,
  isRecurringAction,
  isRecurringDraftReady,
  isTransactionAction,
  isTransactionChangeAction,
  isTransactionChangeDraftReady,
  type PlanAgentActionRecord,
  type PlanActionResult,
  type RecurringActionResult,
  type RecurringAgentActionRecord,
  type RecurringDraft,
  type TransactionAgentActionRecord,
  type TransactionActionResult,
  type TransactionChangeActionResult,
  type TransactionChangeAgentActionRecord,
  type TransactionChangeDraft,
  type TransactionDraft,
} from "./domain";
import {
  assertInboxDraftCurrent,
  buildInboxDraft,
  inboxIdempotencyKey,
  locateInboxDraftTarget,
  persistedInboxResolutionMatches,
  presentInboxResult,
  type InboxDraftIntent,
} from "./inbox-draft";
import { buildPlanDraft, type PlanDraftIntent } from "./plan-draft";
import {
  buildRecurringDraft,
  nextOccurrenceInstant,
  persistedRecurringMatches,
  presentRecurringResult,
  recurringIdempotencyKey,
  type RecurringDraftIntent,
} from "./recurring-draft";
import type { AgentActionRepository } from "./repositories/agent-action-repository";
import {
  buildTransactionChangeDraft,
  transactionChangeDetailsPatch,
  type TransactionChangeIntent,
} from "./transaction-change-draft";
import {
  buildTransactionDraft,
  type TransactionDraftIntent,
} from "./transaction-draft";

export interface CreateTransactionDraftInput extends TransactionDraftIntent {
  idempotencyKey: string;
  eveSessionId?: string | null;
  eveCallId?: string | null;
}

export interface CreateTransactionChangeDraftInput extends TransactionChangeIntent {
  idempotencyKey: string;
  eveSessionId?: string | null;
  eveCallId?: string | null;
}

export interface CreateAccountDraftInput extends AccountDraftIntent {
  idempotencyKey: string;
  eveSessionId?: string | null;
  eveCallId?: string | null;
}

export interface CreateRecurringDraftInput extends RecurringDraftIntent {
  idempotencyKey: string;
  eveSessionId?: string | null;
  eveCallId?: string | null;
}

export interface CreateInboxDraftInput extends InboxDraftIntent {
  idempotencyKey: string;
  eveSessionId?: string | null;
  eveCallId?: string | null;
}

/**
 * A reason without a canonical settlement rule never becomes an action: the
 * member gets the explanation instead, and nothing is drafted or approved.
 */
export type InboxDraftOutcome =
  | { readonly prepared: true; readonly action: InboxAgentActionRecord }
  | {
      readonly prepared: false;
      readonly supported: false;
      readonly explanation: string;
      readonly item: ReturnType<typeof presentAgentInboxItem>;
    };

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

export interface TransactionChangeActionDetail {
  action: TransactionChangeAgentActionRecord;
  transactionContext: AgentTransactionContext;
}

export interface PlanActionDetail {
  action: AgentActionRecord;
  planContext: PlansContext;
}

export interface AccountActionDetail {
  action: AccountAgentActionRecord;
}

export interface RecurringActionDetail {
  action: RecurringAgentActionRecord;
}

export interface InboxActionDetail {
  action: InboxAgentActionRecord;
}

export type AgentActionDetail =
  | TransactionActionDetail
  | TransactionChangeActionDetail
  | PlanActionDetail
  | AccountActionDetail
  | RecurringActionDetail
  | InboxActionDetail;

type RecurringActions = Pick<
  FinancialInboxService,
  | "listRecurring"
  | "createManualRecurring"
  | "updateRecurring"
  | "pauseRecurring"
  | "resumeRecurring"
  | "confirmRecurring"
  | "ignoreRecurring"
  | "restoreRecurring"
>;

export interface InboxActions {
  readonly reader: AgentInboxStateReader;
  readonly resolutions: Pick<
    FinancialInboxService,
    "acceptInboxCategorySuggestion" | "chooseInboxCategory" | "confirmInboxRecurring" | "ignoreInboxRecurring"
  >;
}

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
    private readonly recurring?: RecurringActions,
    private readonly inbox?: InboxActions,
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
        type: "OTHER",
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

  /**
   * Prepares a change to one existing transaction. The target is resolved to
   * its current effective version, so a superseded original is never edited,
   * and nothing is written to the ledger until the draft is approved.
   */
  async createTransactionChangeDraft(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: CreateTransactionChangeDraftInput,
  ): Promise<TransactionChangeAgentActionRecord> {
    const existing = await this.actions.findActionByIdempotencyKey(workspaceId, input.idempotencyKey);
    if (existing) {
      const action = await this.requireActionInitiator(actor, workspaceId, existing.id);
      if (!isTransactionChangeAction(action)) throw new ConflictError("Idempotency key belongs to another action type.");
      return action;
    }

    const context = await this.requireLedgerContext(actor, workspaceId);
    const [transaction, accounts, categories] = await Promise.all([
      this.ledger.getCurrentEffectiveTransaction(actor, workspaceId, input.transactionId),
      this.ledger.listAccounts(actor, workspaceId),
      this.ledger.listCategories(actor, workspaceId),
    ]);
    const draft = buildTransactionChangeDraft(input, {
      transaction,
      timezone: context.preferences.timezone,
      accounts,
      categories,
    });
    try {
      parseTransactionDetailsPatch(draft.transactionKind, transactionChangeDetailsPatch(draft));
    } catch {
      throw new ConflictError("The requested change is not valid for this transaction.");
    }

    const created = await this.actions.createAction({
      id: randomUUID(),
      workspaceId,
      type: draft.changeType === "FINANCIAL" ? "TRANSACTION_CORRECT" : "TRANSACTION_UPDATE",
      initiatedByUserId: actor.userId,
      draft,
      idempotencyKey: input.idempotencyKey,
      eveSessionId: input.eveSessionId ?? null,
      eveCallId: input.eveCallId ?? null,
    });
    await this.audit(created, actor.userId, "DRAFT_CREATED", null, "DRAFT", {
      transactionId: draft.transactionId,
      changeType: draft.changeType,
    });
    if (!isTransactionChangeAction(created)) throw new Error("Created action was not a transaction change.");
    return created;
  }

  /**
   * Prepares an account creation or lifecycle change. Nothing is written to
   * the account until the draft is approved; a change the canonical account
   * policy would refuse is rejected here with that policy's own reason.
   */
  async createAccountDraft(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: CreateAccountDraftInput,
  ): Promise<AccountAgentActionRecord> {
    const existing = await this.actions.findActionByIdempotencyKey(workspaceId, input.idempotencyKey);
    if (existing) {
      const action = await this.requireActionInitiator(actor, workspaceId, existing.id);
      if (!isAccountAction(action)) throw new ConflictError("Idempotency key belongs to another action type.");
      return action;
    }

    const context = await this.requireLedgerContext(actor, workspaceId);
    const draft = buildAccountDraft(input, {
      currency: context.preferences.currency,
      accounts: await this.ledger.listAccounts(actor, workspaceId),
    });
    const id = randomUUID();
    if (isAccountDraftReady(draft)) await this.assertAccountDraftAllowed(actor, workspaceId, id, draft);

    const created = await this.actions.createAction({
      id,
      workspaceId,
      type: draft.accountOperation === "CREATE" ? "ACCOUNT_CREATE" : "ACCOUNT_MANAGE",
      initiatedByUserId: actor.userId,
      draft,
      idempotencyKey: input.idempotencyKey,
      eveSessionId: input.eveSessionId ?? null,
      eveCallId: input.eveCallId ?? null,
    });
    await this.audit(created, actor.userId, "DRAFT_CREATED", null, "DRAFT", {
      accountOperation: draft.accountOperation,
      accountId: draft.accountId,
    });
    if (!isAccountAction(created)) throw new Error("Created action was not an account action.");
    return created;
  }

  /**
   * Prepares a recurring creation, edit, or state change. Nothing is written
   * until the draft is approved; a change the canonical recurring policy would
   * refuse is rejected here with that policy's own reason.
   */
  async createRecurringDraft(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: CreateRecurringDraftInput,
  ): Promise<RecurringAgentActionRecord> {
    const existing = await this.actions.findActionByIdempotencyKey(workspaceId, input.idempotencyKey);
    if (existing) {
      const action = await this.requireActionInitiator(actor, workspaceId, existing.id);
      if (!isRecurringAction(action)) throw new ConflictError("Idempotency key belongs to another action type.");
      return action;
    }

    const context = await this.requireLedgerContext(actor, workspaceId);
    const [payments, accounts, categories, merchants] = await Promise.all([
      this.requireRecurring().listRecurring(actor, workspaceId),
      this.ledger.listAccounts(actor, workspaceId),
      this.ledger.listCategories(actor, workspaceId),
      this.ledger.listMerchants(actor, workspaceId),
    ]);
    const now = new Date();
    const overview = buildRecurringOverview({
      payments,
      accounts,
      categories,
      filter: "ALL",
      timeZone: context.preferences.timezone,
      now,
      workspaceRole: context.membership.role,
    });
    const draft = buildRecurringDraft(input, {
      currency: context.preferences.currency,
      now,
      items: withRecurringDisplayNames(overview.items, payments, merchants),
      accounts,
      categories,
    });

    const created = await this.actions.createAction({
      id: randomUUID(),
      workspaceId,
      type: draft.recurringOperation === "CREATE" ? "RECURRING_CREATE" : "RECURRING_MANAGE",
      initiatedByUserId: actor.userId,
      draft,
      idempotencyKey: input.idempotencyKey,
      eveSessionId: input.eveSessionId ?? null,
      eveCallId: input.eveCallId ?? null,
    });
    await this.audit(created, actor.userId, "DRAFT_CREATED", null, "DRAFT", {
      recurringOperation: draft.recurringOperation,
      recurringId: draft.recurringId,
    });
    if (!isRecurringAction(created)) throw new Error("Created action was not a recurring action.");
    return created;
  }

  /**
   * Prepares the resolution of one open Inbox item. Nothing is resolved until
   * the draft is approved; a resolution the canonical Inbox policy would refuse
   * is rejected here with that policy's own reason.
   */
  async createInboxDraft(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: CreateInboxDraftInput,
  ): Promise<InboxDraftOutcome> {
    const existing = await this.actions.findActionByIdempotencyKey(workspaceId, input.idempotencyKey);
    if (existing) {
      const action = await this.requireActionInitiator(actor, workspaceId, existing.id);
      if (!isInboxAction(action)) throw new ConflictError("Idempotency key belongs to another action type.");
      return { prepared: true, action };
    }

    await this.requireLedgerContext(actor, workspaceId);
    const [states, categories] = await Promise.all([
      this.requireInbox().reader.listOpenItems(actor, workspaceId),
      this.ledger.listCategories(actor, workspaceId),
    ]);
    const target = locateInboxDraftTarget(input, states);
    if (target.status === "RESOLVED" && !inboxReasonHasResolution(target.state.item.reason)) {
      return {
        prepared: false,
        supported: false,
        explanation: agentInboxUnavailableReason(target.state) ?? "This Inbox item cannot be resolved.",
        item: presentAgentInboxItem(target.state),
      };
    }
    const draft = buildInboxDraft(input, { states, categories });

    const created = await this.actions.createAction({
      id: randomUUID(),
      workspaceId,
      type: "INBOX_RESOLVE",
      initiatedByUserId: actor.userId,
      draft,
      idempotencyKey: input.idempotencyKey,
      eveSessionId: input.eveSessionId ?? null,
      eveCallId: input.eveCallId ?? null,
    });
    await this.audit(created, actor.userId, "DRAFT_CREATED", null, "DRAFT", {
      inboxOperation: draft.inboxOperation,
      inboxItemId: draft.inboxItemId,
    });
    if (!isInboxAction(created)) throw new Error("Created action was not an Inbox resolution.");
    return { prepared: true, action: created };
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
    if (isTransactionChangeAction(action)) {
      return { action, transactionContext: await this.getTransactionContext(actor, workspaceId) };
    }
    if (isAccountAction(action)) return { action };
    if (isRecurringAction(action)) return { action };
    if (isInboxAction(action)) return { action };
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
  ): Promise<TransactionActionResult | TransactionChangeActionResult> {
    let action = await this.requireActionInitiator(actor, workspaceId, actionId);
    if (isTransactionChangeAction(action)) return this.executeApprovedTransactionChange(actor, workspaceId, action);
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
          transaction = await this.ledger.createTransactionIdempotently(
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

  private async executeApprovedTransactionChange(
    actor: AuthenticatedActor,
    workspaceId: string,
    approved: TransactionChangeAgentActionRecord,
  ): Promise<TransactionChangeActionResult> {
    if (approved.status === "COMPLETED" && approved.result) return approved.result;
    if (approved.status !== "APPROVED" && approved.status !== "EXECUTING") {
      throw new ConflictError("Only an approved action can be executed.");
    }
    const actionId = approved.id;

    if (approved.status === "APPROVED") {
      const transitioned = await this.actions.transitionAction({
        workspaceId,
        actionId,
        from: ["APPROVED"],
        to: "EXECUTING",
      });
      if (transitioned) {
        await this.audit(transitioned, actor.userId, "EXECUTION_STARTED", "APPROVED", "EXECUTING");
      } else {
        const current = await this.requireActionInitiator(actor, workspaceId, actionId);
        if (!isTransactionChangeAction(current)) throw new ConflictError("This action does not change a transaction.");
        if (current.status === "COMPLETED" && current.result) return current.result;
        if (current.status !== "EXECUTING") {
          throw new ConflictError("This action changed before it could be executed.");
        }
      }
    }

    try {
      const draft = approved.draft;
      if (!isTransactionChangeDraftReady(draft)) {
        throw new ConflictError("The approved action has an incomplete transaction change.");
      }
      const transaction = await this.persistTransactionChange(actor, workspaceId, actionId, draft);
      this.assertPersistedChangeMatches(draft, transaction);
      const result: TransactionChangeActionResult = {
        changeType: draft.changeType,
        transactionId: transaction.id,
        originalTransactionId: draft.transactionId,
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
          originalTransactionId: draft.transactionId,
          changeType: draft.changeType,
        });
        return result;
      }

      const current = await this.requireActionInitiator(actor, workspaceId, actionId);
      if (isTransactionChangeAction(current) && current.status === "COMPLETED" && current.result) return current.result;
      throw new ConflictError("This action changed while its transaction change was being verified.");
    } catch (error) {
      await this.failAction(actor, workspaceId, actionId, error);
      throw error;
    }
  }

  private async persistTransactionChange(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
    draft: TransactionChangeDraft,
  ): Promise<LedgerTransactionRecord> {
    const patch = transactionChangeDetailsPatch(draft);
    if (draft.changeType === "DETAILS") {
      const context = await this.requireLedgerContext(actor, workspaceId);
      return this.ledger.updateTransactionDetails(
        actor,
        workspaceId,
        draft.transactionId,
        patch,
        new Date(draft.expectedUpdatedAt),
        context.preferences.timezone,
      );
    }

    const { amountMinor, accountId, transferAccountId } = draft.changes;
    // The action id is the correction's idempotency key: a retried execution
    // replays the committed correction instead of reversing the ledger twice.
    const correction = await this.ledger.correctTransaction(
      actor,
      correctTransactionSchema.parse({
        workspaceId,
        transactionId: draft.transactionId,
        idempotencyKey: actionId,
        expectedUpdatedAt: draft.expectedUpdatedAt,
        kind: draft.transactionKind,
        ...(draft.reason ? { reason: draft.reason.slice(0, 500) } : {}),
        financialChanges:
          draft.transactionKind === "TRANSFER"
            ? {
                ...(amountMinor === undefined ? {} : { amountMinor }),
                ...(accountId === undefined ? {} : { fromAccountId: accountId }),
                ...(transferAccountId === undefined ? {} : { toAccountId: transferAccountId }),
              }
            : {
                ...(amountMinor === undefined ? {} : { amountMinor }),
                ...(accountId === undefined ? {} : { accountId }),
              },
        ...(Object.keys(patch).length > 0 ? { details: patch } : {}),
      }),
    );
    if (correction.originalTransaction.id !== draft.transactionId) {
      throw new Error("Persisted transaction correction verification failed.");
    }
    return correction.replacementTransaction;
  }

  private assertPersistedChangeMatches(draft: TransactionChangeDraft, transaction: LedgerTransactionRecord): void {
    const { changes, current } = draft;
    const isCorrection = draft.changeType === "FINANCIAL";
    if (
      transaction.kind !== draft.transactionKind ||
      transaction.currency !== draft.currency ||
      (transaction.id === draft.transactionId) === isCorrection ||
      transaction.amountMinor.toString() !== (changes.amountMinor ?? current.amountMinor) ||
      transaction.accountId !== (changes.accountId ?? current.accountId) ||
      transaction.transferAccountId !== (changes.transferAccountId ?? current.transferAccountId) ||
      (changes.categoryId !== undefined && transaction.categoryId !== changes.categoryId) ||
      (changes.note !== undefined && transaction.note !== changes.note)
    ) {
      throw new Error("Persisted transaction change verification failed.");
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

  async executeApprovedAccount(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
  ): Promise<AccountActionResult> {
    const action = await this.requireActionInitiator(actor, workspaceId, actionId);
    if (!isAccountAction(action)) throw new ConflictError("This action does not change an account.");
    if (action.status === "COMPLETED" && action.result) return action.result;
    // Account creation has no idempotency key in the ledger, so only the one
    // caller that moves the action out of APPROVED may create the account. An
    // interrupted creation is never retried, because a retry could open a duplicate.
    const isCreate = action.draft.accountOperation === "CREATE";
    if (action.status === "EXECUTING" && isCreate) {
      throw new ConflictError("This account is already being created. Check your accounts before trying again.");
    }
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
      } else {
        const current = await this.requireActionInitiator(actor, workspaceId, actionId);
        if (!isAccountAction(current)) throw new ConflictError("This action does not change an account.");
        if (current.status === "COMPLETED" && current.result) return current.result;
        if (isCreate || current.status !== "EXECUTING") {
          throw new ConflictError("This action changed before it could be executed.");
        }
      }
    }

    try {
      const draft = action.draft;
      if (!isAccountDraftReady(draft)) {
        throw new ConflictError("The approved action has an incomplete account draft.");
      }
      const persisted = isCreate
        ? await this.ledger.createAccount(actor, workspaceId, {
            name: draft.name,
            type: draft.type,
            currency: draft.currency,
          })
        : await this.ledger.manageAccount(
            actor,
            manageAccountSchema.parse(accountManagementCommand(workspaceId, actionId, draft)),
          );
      const stored = (await this.ledger.listAccounts(actor, workspaceId)).find(
        (account) => account.id === persisted.id,
      );
      const verified = this.assertPersistedAccountMatches(draft, workspaceId, stored);
      const result: AccountActionResult = {
        accountOperation: draft.accountOperation,
        accountId: verified.id,
        name: verified.name,
        type: verified.type,
        currency: verified.currency,
        status: presentDraftAccount(verified).status,
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
          accountId: verified.id,
          accountOperation: draft.accountOperation,
        });
        return result;
      }

      const current = await this.requireActionInitiator(actor, workspaceId, actionId);
      if (isAccountAction(current) && current.status === "COMPLETED" && current.result) return current.result;
      throw new ConflictError("This action changed while its account change was being verified.");
    } catch (error) {
      await this.failAction(actor, workspaceId, actionId, error);
      throw error;
    }
  }

  /**
   * Applies an approved recurring draft through the canonical Recurring
   * service. Every operation carries the action's idempotency key, so a retry
   * replays the same change, and none of them posts a ledger transaction.
   */
  async executeApprovedRecurring(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
  ): Promise<RecurringActionResult> {
    const action = await this.requireActionInitiator(actor, workspaceId, actionId);
    if (!isRecurringAction(action)) throw new ConflictError("This action does not change a recurring payment.");
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
      } else {
        const current = await this.requireActionInitiator(actor, workspaceId, actionId);
        if (!isRecurringAction(current)) throw new ConflictError("This action does not change a recurring payment.");
        if (current.status === "COMPLETED" && current.result) return current.result;
        if (current.status !== "EXECUTING") {
          throw new ConflictError("This action changed before it could be executed.");
        }
      }
    }

    try {
      const draft = action.draft;
      if (!isRecurringDraftReady(draft)) {
        throw new ConflictError("The approved action has an incomplete recurring draft.");
      }
      const persisted = await this.persistRecurringAction(actor, workspaceId, actionId, draft);
      const stored = (await this.requireRecurring().listRecurring(actor, workspaceId)).find(
        (payment) => payment.id === persisted.id,
      );
      if (!stored || !persistedRecurringMatches(draft, stored)) {
        throw new Error("Persisted recurring verification failed.");
      }
      const result = presentRecurringResult(draft.recurringOperation, stored, new Date());
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
          recurringId: stored.id,
          recurringOperation: draft.recurringOperation,
        });
        return result;
      }

      const current = await this.requireActionInitiator(actor, workspaceId, actionId);
      if (isRecurringAction(current) && current.status === "COMPLETED" && current.result) return current.result;
      throw new ConflictError("This action changed while its recurring change was being verified.");
    } catch (error) {
      await this.failAction(actor, workspaceId, actionId, error);
      throw error;
    }
  }

  private async persistRecurringAction(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
    draft: RecurringDraft,
  ): Promise<RecurringPaymentView> {
    const recurring = this.requireRecurring();
    const idempotencyKey = recurringIdempotencyKey(actionId);
    const { values } = draft;

    if (draft.recurringOperation === "CREATE") {
      const { name, amountMinor, cadenceDays, nextOccurrenceOn } = values;
      if (!draft.direction || !draft.currency || !name || !amountMinor || !cadenceDays || !nextOccurrenceOn) {
        throw new ConflictError("The approved recurring draft is incomplete.");
      }
      return recurring.createManualRecurring(actor, {
        workspaceId,
        direction: draft.direction,
        name,
        amountMinor: BigInt(amountMinor),
        currency: draft.currency,
        cadenceDays,
        nextOccurrenceAt: nextOccurrenceInstant(nextOccurrenceOn),
        accountId: values.accountId ?? null,
        categoryId: values.categoryId ?? null,
        idempotencyKey,
      });
    }

    if (!draft.recurringId || !draft.expectedUpdatedAt) {
      throw new ConflictError("The approved recurring draft has no target.");
    }
    const command = {
      workspaceId,
      recurringId: draft.recurringId,
      expectedUpdatedAt: new Date(draft.expectedUpdatedAt),
      idempotencyKey,
    };
    switch (draft.recurringOperation) {
      case "EDIT":
        return recurring.updateRecurring(actor, {
          ...command,
          name: values.name,
          amountMinor: values.amountMinor === undefined ? undefined : BigInt(values.amountMinor),
          cadenceDays: values.cadenceDays,
          nextOccurrenceAt:
            values.nextOccurrenceOn === undefined ? undefined : nextOccurrenceInstant(values.nextOccurrenceOn),
          accountId: values.accountId,
          categoryId: values.categoryId,
        });
      case "PAUSE":
        return recurring.pauseRecurring(actor, command);
      case "RESUME":
        return recurring.resumeRecurring(actor, command);
      case "CONFIRM":
        return recurring.confirmRecurring(actor, command);
      case "IGNORE":
        return recurring.ignoreRecurring(actor, command);
      case "RESTORE":
        return recurring.restoreRecurring(actor, command);
    }
  }

  /**
   * Resolves an approved Inbox draft through the canonical Inbox resolution
   * service, which owns the transaction category edit and the recurring review.
   * The item counts as resolved only once that service succeeded and the stored
   * item, transaction, and recurring payment were read back and match the draft.
   */
  async executeApprovedInbox(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
  ): Promise<InboxActionResult> {
    const action = await this.requireActionInitiator(actor, workspaceId, actionId);
    if (!isInboxAction(action)) throw new ConflictError("This action does not resolve an Inbox item.");
    if (action.status === "COMPLETED" && action.result) return action.result;
    if (action.status !== "APPROVED" && action.status !== "EXECUTING") {
      throw new ConflictError("Only an approved action can be executed.");
    }

    let startedHere = false;
    if (action.status === "APPROVED") {
      const transitioned = await this.actions.transitionAction({
        workspaceId,
        actionId,
        from: ["APPROVED"],
        to: "EXECUTING",
      });
      if (transitioned) {
        await this.audit(transitioned, actor.userId, "EXECUTION_STARTED", "APPROVED", "EXECUTING");
        startedHere = true;
      } else {
        const current = await this.requireActionInitiator(actor, workspaceId, actionId);
        if (!isInboxAction(current)) throw new ConflictError("This action does not resolve an Inbox item.");
        if (current.status === "COMPLETED" && current.result) return current.result;
        if (current.status !== "EXECUTING") {
          throw new ConflictError("This action changed before it could be executed.");
        }
      }
    }

    try {
      const draft = action.draft;
      if (!isInboxDraftReady(draft) || !draft.inboxItemId) {
        throw new ConflictError("The approved action has an incomplete Inbox resolution.");
      }
      const { reader } = this.requireInbox();
      // A resumed execution may already have resolved the item under this
      // action's idempotency key, so only a first attempt is compared with the
      // prepared state; the canonical service replays or refuses a retry itself.
      if (startedHere) {
        const [current, categories] = await Promise.all([
          reader.getItem(actor, workspaceId, draft.inboxItemId),
          this.ledger.listCategories(actor, workspaceId),
        ]);
        assertInboxDraftCurrent(draft, current, categories);
      }

      const outcome = await this.persistInboxResolution(actor, workspaceId, actionId, draft);
      const stored = await reader.getItem(actor, workspaceId, draft.inboxItemId);
      if (!persistedInboxResolutionMatches(draft, stored)) {
        throw new Error("Persisted Inbox resolution verification failed.");
      }
      const result = presentInboxResult(draft, stored, outcome, new Date());
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
          inboxItemId: stored.item.id,
          inboxOperation: draft.inboxOperation,
          transactionId: stored.transaction.id,
          categoryId: result.category?.id ?? null,
          recurringId: result.recurring?.id ?? null,
          resolvedInboxItemIds: result.resolvedInboxItemIds,
        });
        return result;
      }

      const current = await this.requireActionInitiator(actor, workspaceId, actionId);
      if (isInboxAction(current) && current.status === "COMPLETED" && current.result) return current.result;
      throw new ConflictError("This action changed while its Inbox resolution was being verified.");
    } catch (error) {
      await this.failAction(actor, workspaceId, actionId, error);
      throw error;
    }
  }

  private async persistInboxResolution(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
    draft: InboxResolutionDraft,
  ) {
    const { resolutions } = this.requireInbox();
    if (!draft.inboxItemId || !draft.expectedInboxUpdatedAt) {
      throw new ConflictError("The approved Inbox resolution has no target.");
    }
    const command = {
      workspaceId,
      inboxItemId: draft.inboxItemId,
      expectedInboxUpdatedAt: new Date(draft.expectedInboxUpdatedAt),
      idempotencyKey: inboxIdempotencyKey(actionId),
    };
    if (!isCategoryInboxOperation(draft.inboxOperation)) {
      return draft.inboxOperation === "CONFIRM_RECURRING"
        ? resolutions.confirmInboxRecurring(actor, command)
        : resolutions.ignoreInboxRecurring(actor, command);
    }

    if (!draft.category || !draft.expectedTransactionUpdatedAt) {
      throw new ConflictError("The approved Inbox resolution has no category.");
    }
    const categoryCommand = {
      ...command,
      expectedTransactionUpdatedAt: new Date(draft.expectedTransactionUpdatedAt),
    };
    if (draft.inboxOperation === "CHOOSE_CATEGORY") {
      return resolutions.chooseInboxCategory(actor, { ...categoryCommand, categoryId: draft.category.id });
    }
    if (!draft.expectedSuggestionUpdatedAt) {
      throw new ConflictError("The approved Inbox resolution has no suggestion to accept.");
    }
    return resolutions.acceptInboxCategorySuggestion(actor, {
      ...categoryCommand,
      expectedSuggestionCategoryId: draft.category.id,
      expectedSuggestionUpdatedAt: new Date(draft.expectedSuggestionUpdatedAt),
    });
  }

  private async assertAccountDraftAllowed(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
    draft: AccountDraft,
  ): Promise<void> {
    if (draft.accountOperation === "CREATE") {
      const parsed = createLedgerAccountSchema.safeParse({
        name: draft.name,
        type: draft.type,
        currency: draft.currency,
      });
      if (!parsed.success) throw new ConflictError("The requested account is not valid.");
      return;
    }

    const { current } = draft;
    if (!draft.accountId || !current) throw new ConflictError("The account to change is missing.");
    if (!manageAccountSchema.safeParse(accountManagementCommand(workspaceId, actionId, draft)).success) {
      throw new ConflictError("The requested account change is not valid.");
    }
    const policy = await this.ledger.getAccountActionPolicy(actor, workspaceId, draft.accountId);
    switch (draft.accountOperation) {
      case "RENAME":
        if (!policy.canRename) throw new ConflictError("This account cannot be renamed.");
        if (draft.name === current.name) throw new ConflictError(`This account is already named "${current.name}".`);
        return;
      case "CHANGE_TYPE":
        if (draft.type === current.type) throw new ConflictError("This account already has that type.");
        if (!draft.type || !policy.allowedTypeChanges.includes(draft.type)) {
          throw new ConflictError(
            policy.reasons.changeType === "ACCOUNT_HAS_FINANCIAL_ACTIVITY"
              ? "Account type is locked after the account has financial activity."
              : "The requested account type would change the account's spendability semantics.",
          );
        }
        return;
      case "ARCHIVE":
        if (!policy.canArchive) throw new ConflictError("This account is already archived.");
        return;
      case "RESTORE":
        if (!policy.canRestore) throw new ConflictError("This account is not archived.");
        return;
    }
  }

  private assertPersistedAccountMatches(
    draft: AccountDraft,
    workspaceId: string,
    account: LedgerAccountRecord | undefined,
  ): LedgerAccountRecord {
    const isCreate = draft.accountOperation === "CREATE";
    const expectsName = isCreate || draft.accountOperation === "RENAME";
    const expectsType = isCreate || draft.accountOperation === "CHANGE_TYPE";
    if (
      !account ||
      account.workspaceId !== workspaceId ||
      account.currency !== draft.currency ||
      (!isCreate && account.id !== draft.accountId) ||
      (expectsName && account.name !== draft.name) ||
      (expectsType && account.type !== draft.type) ||
      ((isCreate || draft.accountOperation === "RESTORE") && account.archivedAt !== null) ||
      (draft.accountOperation === "ARCHIVE" && account.archivedAt === null)
    ) {
      throw new Error("Persisted account verification failed.");
    }
    return account;
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
      source: { provider: "pace-agent", origin: "AGENT", agentActionId: action.id },
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

  private requireRecurring(): RecurringActions {
    if (!this.recurring) throw new Error("Recurring service is unavailable.");
    return this.recurring;
  }

  private requireInbox(): InboxActions {
    if (!this.inbox) throw new Error("Inbox service is unavailable.");
    return this.inbox;
  }
}
