import { randomUUID } from "node:crypto";

import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { AuthenticatedActor } from "@/authorization/session";
import type { LedgerAccountRecord, LedgerCategoryRecord, LedgerTransactionRecord } from "@/modules/ledger/domain";
import { LedgerService } from "@/modules/ledger/ledger-service";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceMemberContext } from "@/modules/workspaces/domain";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  type AgentActionRecord,
  type AgentActionResult,
  type AgentActionStatus,
  isTransactionDraftReady,
  type TransactionDraft,
} from "./domain";
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

export interface AgentTransactionContext {
  workspaceId: string;
  currency: string;
  locale: string;
  timezone: string;
  accounts: readonly Pick<LedgerAccountRecord, "id" | "name" | "currency">[];
  categories: readonly Pick<LedgerCategoryRecord, "id" | "name" | "kind">[];
}

export interface AgentActionDetail {
  action: AgentActionRecord;
  transactionContext: AgentTransactionContext;
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
  ): Promise<AgentActionRecord> {
    const existing = await this.actions.findActionByIdempotencyKey(workspaceId, input.idempotencyKey);
    if (existing) {
      return this.requireActionInitiator(actor, workspaceId, existing.id);
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
    return created;
  }

  async getActionDetail(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
  ): Promise<AgentActionDetail> {
    const action = await this.requireActionInitiator(actor, workspaceId, actionId);
    return { action, transactionContext: await this.getTransactionContext(actor, workspaceId) };
  }

  async editTransactionDraft(
    actor: AuthenticatedActor,
    workspaceId: string,
    actionId: string,
    input: EditTransactionDraftInput,
  ): Promise<AgentActionRecord> {
    const action = await this.requireActionInitiator(actor, workspaceId, actionId);
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
    if (!isTransactionDraftReady(action.draft)) {
      throw new ConflictError("Complete the transaction draft before requesting approval.");
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
  ): Promise<AgentActionResult> {
    let action = await this.requireActionInitiator(actor, workspaceId, actionId);
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
            this.toLedgerInput(action),
          );
        } catch (error) {
          if (!(error instanceof ConflictError)) throw error;
          transaction = await this.ledgerRecords.findTransactionByFingerprint(workspaceId, fingerprint);
          if (!transaction) throw error;
        }
      }

      this.assertPersistedTransactionMatches(action, transaction);
      const result: AgentActionResult = {
        transactionId: transaction.id,
        kind: transaction.kind as AgentActionResult["kind"],
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
        return result;
      }

      const current = await this.requireActionInitiator(actor, workspaceId, actionId);
      if (current.status === "COMPLETED" && current.result) return current.result;
      throw new ConflictError("This action changed while its transaction was being verified.");
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

  private toLedgerInput(action: AgentActionRecord): unknown {
    const draft = action.draft;
    if (!isTransactionDraftReady(draft) || !draft.amountMinor || !draft.occurredAt || !draft.accountId) {
      throw new ConflictError("The approved action has an incomplete transaction draft.");
    }

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
    };
  }

  private assertPersistedTransactionMatches(
    action: AgentActionRecord,
    transaction: LedgerTransactionRecord,
  ): void {
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
}
