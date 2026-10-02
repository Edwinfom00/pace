import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import {
  AuthorizationError,
  ConflictError,
  DomainConflictError,
  NotFoundError,
} from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import type { LedgerTransactionRecord } from "@/modules/ledger/domain";
import type { LedgerService } from "@/modules/ledger/ledger-service";
import { getTransactionCapabilities } from "@/modules/transactions/domain/transaction-action-policy";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceMemberContext } from "@/modules/workspaces/domain";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type {
  RuleAction,
  RuleActionApplicability,
  RuleDefinition,
  RuleEvaluationPlan,
  RuleExecutionRecord,
  RuleManagementAction,
  RuleManagementAuditRecord,
  RuleMatchExplanation,
  RulePlanEntry,
  RuleRecord,
  RuleTransactionFacts,
  RuleTrigger,
} from "./domain";
import type { CreateRuleManagementAudit, RuleUpdate, RulesRepository } from "./repositories/rules-repository";
import {
  archiveRuleCommand,
  createRuleCommand,
  setRuleEnabledCommand,
  testRuleCommand,
  updateRuleCommand,
  type ArchiveRuleCommand,
  type CreateRuleCommand,
  type SetRuleEnabledCommand,
  type TestRuleCommand,
  type UpdateRuleCommand,
} from "./rule-contract";
import {
  assessRuleAction,
  evaluateRuleConditions,
  planRuleEvaluation,
  toRuleTransactionFacts,
  type RuleActionContext,
  type RuleEvaluationCandidate,
} from "./rule-evaluator";

export interface CreateRuleInput extends CreateRuleCommand {
  readonly agentActionId?: string | null;
}

export interface RuleDryRunResult {
  readonly transactionId: string;
  readonly facts: RuleTransactionFacts;
  readonly match: RuleMatchExplanation;
  readonly action: RuleAction;
  readonly applicability: RuleActionApplicability;
  readonly shadowedBy: Pick<RuleRecord, "id" | "name" | "priority"> | null;
  readonly wouldApply: boolean;
}

export type RuleApplicationResult =
  | {
      readonly status: "EVALUATED";
      readonly transactionId: string;
      readonly plan: RuleEvaluationPlan;
      readonly executions: readonly RuleExecutionRecord[];
    }
  | {
      readonly status: "NOT_EFFECTIVE" | "NOT_APPLICABLE";
      readonly transactionId: string;
      readonly plan: null;
      readonly executions: readonly [];
    };

const agentActionId = z.string().trim().min(1).max(255);
const DRAFT_RULE_ID = "draft";

export class RulesService {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly rules: RulesRepository,
    private readonly ledgerRecords: Pick<
      LedgerRepository,
      "findTransaction" | "findCategory" | "listCategories" | "findAccount" | "findMerchant"
    >,
    private readonly ledger: Pick<LedgerService, "getCurrentEffectiveTransaction" | "updateTransactionDetails">,
    private readonly inbox: Pick<FinancialInboxService, "findOpenReviewItem" | "routeTransactionForReview">,
    private readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">,
  ) {}

  async listRules(
    actor: AuthenticatedActor,
    workspaceId: string,
    options: { readonly includeArchived?: boolean } = {},
  ): Promise<RuleRecord[]> {
    await this.requireReadContext(actor, workspaceId);
    return this.rules.listRules(workspaceId, options.includeArchived ? undefined : "ACTIVE");
  }

  async getRule(actor: AuthenticatedActor, workspaceId: string, ruleId: string): Promise<RuleRecord | null> {
    await this.requireReadContext(actor, workspaceId);
    return this.rules.findRule(workspaceId, ruleId);
  }

  async listRuleAudit(
    actor: AuthenticatedActor,
    workspaceId: string,
    ruleId: string,
  ): Promise<RuleManagementAuditRecord[]> {
    await this.requireReadContext(actor, workspaceId);
    return this.rules.listManagementAudits(workspaceId, ruleId);
  }

  async listRuleExecutions(
    actor: AuthenticatedActor,
    workspaceId: string,
    filters: { readonly ruleId?: string; readonly transactionId?: string } = {},
  ): Promise<RuleExecutionRecord[]> {
    await this.requireReadContext(actor, workspaceId);
    return this.rules.listExecutions(workspaceId, filters);
  }

  async createRule(actor: AuthenticatedActor, workspaceId: string, input: CreateRuleInput): Promise<RuleRecord> {
    await this.requireManageContext(actor, workspaceId);
    const { agentActionId: rawAgentActionId, ...commandInput } = input;
    const command = parseCommand(createRuleCommand, commandInput);
    const proposedBy = rawAgentActionId == null ? null : parseCommand(agentActionId, rawAgentActionId);
    if (proposedBy) {
      const prior = await this.rules.findRuleByAgentAction(workspaceId, proposedBy);
      if (prior) return prior;
    }
    const definition: RuleDefinition = {
      trigger: command.trigger,
      conditions: command.conditions,
      action: command.action,
    };
    const enabled = proposedBy ? false : (command.enabled ?? true);
    const fingerprint = fingerprintOf({
      action: "CREATE",
      name: command.name,
      priority: command.priority,
      definition,
      enabled,
      agentActionId: proposedBy,
    });
    const replay = await this.resolveReplay(workspaceId, actor.userId, command.idempotencyKey, fingerprint);
    if (replay) return replay;
    await this.assertDefinitionReferences(workspaceId, definition);

    const now = new Date();
    const ruleId = randomUUID();
    try {
      return await this.rules.createRule(
        {
          id: ruleId,
          workspaceId,
          name: command.name,
          status: "ACTIVE",
          enabled,
          priority: command.priority,
          ...definition,
          revision: 1,
          origin: proposedBy ? "AGENT" : "USER",
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
          createdByAgentActionId: proposedBy,
          createdAt: now,
        },
        this.auditRecord(workspaceId, ruleId, actor, "CREATE", fingerprint, command.idempotencyKey, {
          origin: proposedBy ? "AGENT" : "USER",
          enabled,
          revision: 1,
        }),
      );
    } catch (error) {
      const replayed = await this.resolveReplay(workspaceId, actor.userId, command.idempotencyKey, fingerprint);
      if (replayed) return replayed;
      if (proposedBy) {
        const prior = await this.rules.findRuleByAgentAction(workspaceId, proposedBy);
        if (prior) return prior;
      }
      throw error;
    }
  }

  async updateRule(
    actor: AuthenticatedActor,
    workspaceId: string,
    ruleId: string,
    input: UpdateRuleCommand,
  ): Promise<RuleRecord> {
    await this.requireManageContext(actor, workspaceId);
    const command = parseCommand(updateRuleCommand, input);
    const fingerprint = fingerprintOf({
      action: "UPDATE",
      ruleId,
      name: command.name ?? null,
      priority: command.priority ?? null,
      trigger: command.trigger ?? null,
      conditions: command.conditions ?? null,
      ruleAction: command.action ?? null,
      expectedUpdatedAt: command.expectedUpdatedAt.toISOString(),
    });
    const existing = await this.requireRuleForCommand(workspaceId, ruleId, actor, command.idempotencyKey, fingerprint);
    if ("replayed" in existing) return existing.replayed;
    const rule = existing.rule;
    if (rule.status === "ARCHIVED") throw new DomainConflictError("RULE_ARCHIVED", "Archived rules cannot be edited.");
    assertVersion(rule, command.expectedUpdatedAt);

    const definition: RuleDefinition = {
      trigger: command.trigger ?? rule.trigger,
      conditions: command.conditions ?? rule.conditions,
      action: command.action ?? rule.action,
    };
    await this.assertDefinitionReferences(workspaceId, definition);
    const definitionChanged =
      stableJson({ trigger: rule.trigger, conditions: rule.conditions, action: rule.action }) !== stableJson(definition);
    const revision = definitionChanged ? rule.revision + 1 : rule.revision;
    return this.persistMutation(actor, rule, command, fingerprint, "UPDATE", {
      name: command.name ?? rule.name,
      priority: command.priority ?? rule.priority,
      ...definition,
      revision,
    }, { revision, definitionChanged });
  }

  async setRuleEnabled(
    actor: AuthenticatedActor,
    workspaceId: string,
    ruleId: string,
    input: SetRuleEnabledCommand,
  ): Promise<RuleRecord> {
    await this.requireManageContext(actor, workspaceId);
    const command = parseCommand(setRuleEnabledCommand, input);
    const action: RuleManagementAction = command.enabled ? "ENABLE" : "DISABLE";
    const fingerprint = fingerprintOf({
      action,
      ruleId,
      expectedUpdatedAt: command.expectedUpdatedAt.toISOString(),
    });
    const existing = await this.requireRuleForCommand(workspaceId, ruleId, actor, command.idempotencyKey, fingerprint);
    if ("replayed" in existing) return existing.replayed;
    const rule = existing.rule;
    if (rule.status === "ARCHIVED")
      throw new DomainConflictError("RULE_ARCHIVED", "Archived rules cannot be enabled or disabled.");
    assertVersion(rule, command.expectedUpdatedAt);
    if (rule.enabled === command.enabled) return rule;
    return this.persistMutation(actor, rule, command, fingerprint, action, { enabled: command.enabled }, {});
  }

  async archiveRule(
    actor: AuthenticatedActor,
    workspaceId: string,
    ruleId: string,
    input: ArchiveRuleCommand,
  ): Promise<RuleRecord> {
    await this.requireManageContext(actor, workspaceId);
    const command = parseCommand(archiveRuleCommand, input);
    const fingerprint = fingerprintOf({
      action: "ARCHIVE",
      ruleId,
      expectedUpdatedAt: command.expectedUpdatedAt.toISOString(),
    });
    const existing = await this.requireRuleForCommand(workspaceId, ruleId, actor, command.idempotencyKey, fingerprint);
    if ("replayed" in existing) return existing.replayed;
    const rule = existing.rule;
    if (rule.status === "ARCHIVED") return rule;
    assertVersion(rule, command.expectedUpdatedAt);
    return this.persistMutation(actor, rule, command, fingerprint, "ARCHIVE", { status: "ARCHIVED", enabled: false }, {});
  }

  async previewRulesForTransaction(
    actor: AuthenticatedActor,
    workspaceId: string,
    transactionId: string,
    trigger: RuleTrigger = "TRANSACTION_CREATED",
  ): Promise<RuleEvaluationPlan> {
    await this.requireReadContext(actor, workspaceId);
    const subject = await this.loadSubject(actor, workspaceId, transactionId);
    const rules = await this.enabledRules(workspaceId);
    return planRuleEvaluation({ trigger, facts: subject.facts, rules, context: subject.context });
  }

  async testRule(actor: AuthenticatedActor, workspaceId: string, input: TestRuleCommand): Promise<RuleDryRunResult> {
    await this.requireReadContext(actor, workspaceId);
    const command = parseCommand(testRuleCommand, input);
    let candidate: RuleEvaluationCandidate;
    if ("ruleId" in command.rule) {
      const rule = await this.rules.findRule(workspaceId, command.rule.ruleId);
      if (!rule) throw new NotFoundError("Rule not found in this workspace.");
      candidate = rule;
    } else {
      candidate = {
        id: DRAFT_RULE_ID,
        name: "Draft rule",
        priority: command.rule.priority ?? Number.MAX_SAFE_INTEGER,
        revision: 0,
        createdAt: new Date(8.64e15),
        ...command.rule.definition,
      };
    }
    const subject = await this.loadSubject(actor, workspaceId, command.transactionId);
    const match = evaluateRuleConditions(candidate.conditions, subject.facts);
    const applicability = assessRuleAction(candidate.action, subject.facts, subject.context);
    const others = (await this.enabledRules(workspaceId)).filter((rule) => rule.id !== candidate.id);
    const plan = planRuleEvaluation({
      trigger: candidate.trigger,
      facts: subject.facts,
      rules: [...others, candidate],
      context: subject.context,
    });
    const own = plan.evaluated.find((entry) => entry.rule.id === candidate.id);
    const winner =
      own?.decision === "SHADOWED"
        ? plan.evaluated.find((entry) => entry.decision === "APPLY" && entry.rule.action.type === candidate.action.type)
        : undefined;
    return {
      transactionId: subject.transaction.id,
      facts: subject.facts,
      match,
      action: candidate.action,
      applicability,
      shadowedBy: winner ? { id: winner.rule.id, name: winner.rule.name, priority: winner.rule.priority } : null,
      wouldApply: own?.decision === "APPLY",
    };
  }

  async applyRulesToTransaction(
    actor: AuthenticatedActor,
    workspaceId: string,
    transactionId: string,
    trigger: RuleTrigger = "TRANSACTION_CREATED",
  ): Promise<RuleApplicationResult> {
    const member = await this.requireManageContext(actor, workspaceId);
    let subject: Awaited<ReturnType<RulesService["loadSubject"]>>;
    try {
      subject = await this.loadSubject(actor, workspaceId, transactionId);
    } catch (error) {
      if (
        error instanceof DomainConflictError &&
        (error.code === "TRANSACTION_ALREADY_REVERSED" || error.code === "TRANSACTION_NOT_CURRENT")
      )
        return { status: "NOT_EFFECTIVE", transactionId, plan: null, executions: [] };
      if (error instanceof DomainConflictError && error.code === "RULE_TRANSACTION_NOT_APPLICABLE")
        return { status: "NOT_APPLICABLE", transactionId, plan: null, executions: [] };
      throw error;
    }

    const guardKey = `${workspaceId}:${subject.transaction.id}`;
    if (this.inFlight.has(guardKey))
      throw new DomainConflictError("RULE_EVALUATION_REENTRANT", "Rules are already being applied to this transaction.");
    this.inFlight.add(guardKey);
    try {
      const plan = planRuleEvaluation({
        trigger,
        facts: subject.facts,
        rules: await this.enabledRules(workspaceId),
        context: subject.context,
      });
      const executions: RuleExecutionRecord[] = [];
      for (const entry of plan.evaluated) {
        executions.push(await this.executeEntry(actor, member, subject.transaction, trigger, entry));
      }
      return { status: "EVALUATED", transactionId: subject.transaction.id, plan, executions };
    } finally {
      this.inFlight.delete(guardKey);
    }
  }

  private async executeEntry(
    actor: AuthenticatedActor,
    member: WorkspaceMemberContext,
    transaction: LedgerTransactionRecord,
    trigger: RuleTrigger,
    entry: RulePlanEntry,
  ): Promise<RuleExecutionRecord> {
    const workspaceId = transaction.workspaceId;
    const claim = await this.rules.claimExecution({
      id: randomUUID(),
      workspaceId,
      ruleId: entry.rule.id,
      ruleRevision: entry.rule.revision,
      transactionId: transaction.id,
      trigger,
      actionType: entry.rule.action.type,
      outcome: "PENDING",
      reason: null,
      actorUserId: actor.userId,
      explanation: { decision: entry.decision, match: entry.match },
      result: {},
    });
    if (!claim.claimed) return claim.execution;
    const executionId = claim.execution.id;
    if (entry.decision === "SHADOWED")
      return this.rules.completeExecution(workspaceId, executionId, { outcome: "SHADOWED", reason: entry.reason, result: {} });
    if (entry.decision === "SKIP")
      return this.rules.completeExecution(workspaceId, executionId, { outcome: "SKIPPED", reason: entry.reason, result: {} });

    try {
      const result = await this.performAction(actor, member, transaction, entry, executionId);
      return this.rules.completeExecution(workspaceId, executionId, { outcome: "APPLIED", reason: null, result });
    } catch (error) {
      if (error instanceof FinancialMutationError) throw error;
      return this.rules.completeExecution(workspaceId, executionId, {
        outcome: "FAILED",
        reason: "ACTION_FAILED",
        result: { code: error instanceof DomainConflictError ? error.code : error instanceof Error ? error.name : "UNKNOWN" },
      });
    }
  }

  private async performAction(
    actor: AuthenticatedActor,
    member: WorkspaceMemberContext,
    transaction: LedgerTransactionRecord,
    entry: RulePlanEntry,
    executionId: string,
  ): Promise<Record<string, unknown>> {
    const action = entry.rule.action;
    switch (action.type) {
      case "ASSIGN_CATEGORY": {
        const before = await this.requireTransaction(transaction.workspaceId, transaction.id);
        await this.ledger.updateTransactionDetails(
          actor,
          transaction.workspaceId,
          transaction.id,
          { categoryId: action.categoryId },
          before.updatedAt,
          member.preferences.timezone,
        );
        const after = await this.requireTransaction(transaction.workspaceId, transaction.id);
        assertNoFinancialMutation(before, after);
        return { categoryId: after.categoryId, previousCategoryId: before.categoryId };
      }
      case "ROUTE_FOR_REVIEW": {
        const before = await this.requireTransaction(transaction.workspaceId, transaction.id);
        const item = await this.inbox.routeTransactionForReview(actor, transaction.workspaceId, {
          transactionId: transaction.id,
          details: {
            code: "RULE_REVIEW",
            ruleId: entry.rule.id,
            ruleName: entry.rule.name,
            ruleRevision: entry.rule.revision,
            ruleExecutionId: executionId,
          },
        });
        assertNoFinancialMutation(before, await this.requireTransaction(transaction.workspaceId, transaction.id));
        return { inboxItemId: item.id };
      }
    }
  }

  private async loadSubject(actor: AuthenticatedActor, workspaceId: string, transactionId: string) {
    const transaction = await this.ledger.getCurrentEffectiveTransaction(actor, workspaceId, transactionId);
    const merchant = transaction.merchantId
      ? await this.ledgerRecords.findMerchant(workspaceId, transaction.merchantId)
      : null;
    const facts = toRuleTransactionFacts(transaction, merchant?.name ?? null);
    if (!facts)
      throw new DomainConflictError("RULE_TRANSACTION_NOT_APPLICABLE", "Rules do not evaluate opening balances.");
    const [categories, openReview] = await Promise.all([
      this.ledgerRecords.listCategories(workspaceId),
      this.inbox.findOpenReviewItem(actor, workspaceId, transaction.id),
    ]);
    const context: RuleActionContext = {
      categories: new Map(categories.map((category) => [category.id, category])),
      hasOpenReview: openReview !== null,
      detailsEditable: getTransactionCapabilities({
        transaction,
        workspaceRole: "MEMBER",
        refundedAmountMinor: 0n,
      }).canEdit,
    };
    return { transaction, facts, context };
  }

  private async enabledRules(workspaceId: string): Promise<RuleRecord[]> {
    return (await this.rules.listRules(workspaceId, "ACTIVE")).filter((rule) => rule.enabled);
  }

  private async persistMutation(
    actor: AuthenticatedActor,
    rule: RuleRecord,
    command: { readonly expectedUpdatedAt: Date; readonly idempotencyKey: string },
    fingerprint: string,
    action: RuleManagementAction,
    changes: Omit<RuleUpdate, "updatedByUserId" | "updatedAt">,
    metadata: Record<string, unknown>,
  ): Promise<RuleRecord> {
    const updatedAt = nextVersion(rule.updatedAt);
    let updated: RuleRecord | null;
    try {
      updated = await this.rules.updateRule(
        rule.workspaceId,
        rule.id,
        { ...changes, updatedByUserId: actor.userId, updatedAt },
        command.expectedUpdatedAt,
        this.auditRecord(rule.workspaceId, rule.id, actor, action, fingerprint, command.idempotencyKey, metadata),
      );
    } catch (error) {
      const replayed = await this.resolveReplay(rule.workspaceId, actor.userId, command.idempotencyKey, fingerprint);
      if (replayed) return replayed;
      throw error;
    }
    if (!updated) throw new DomainConflictError("RULE_CHANGED", "This rule changed before it could be updated.");
    return updated;
  }

  private async requireRuleForCommand(
    workspaceId: string,
    ruleId: string,
    actor: AuthenticatedActor,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<{ readonly rule: RuleRecord } | { readonly replayed: RuleRecord }> {
    const rule = await this.rules.findRule(workspaceId, ruleId);
    if (!rule) throw new NotFoundError("Rule not found in this workspace.");
    const replayed = await this.resolveReplay(workspaceId, actor.userId, idempotencyKey, fingerprint);
    return replayed ? { replayed } : { rule };
  }

  private async resolveReplay(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<RuleRecord | null> {
    const audit = await this.rules.findManagementAudit(workspaceId, actorUserId, idempotencyKey);
    if (!audit) return null;
    if (audit.commandFingerprint !== fingerprint)
      throw new ConflictError("This idempotency key was already used for another rule action.");
    const rule = await this.rules.findRule(workspaceId, audit.ruleId);
    if (!rule) throw new ConflictError("Rule action replay could not be resolved.");
    return rule;
  }

  private async assertDefinitionReferences(workspaceId: string, definition: RuleDefinition): Promise<void> {
    const categoryIds = new Set<string>();
    const accountIds = new Set<string>();
    for (const condition of definition.conditions) {
      if (condition.field === "CATEGORY") condition.values.forEach((value) => categoryIds.add(value));
      if (condition.field === "ACCOUNT") condition.values.forEach((value) => accountIds.add(value));
    }
    if (definition.action.type === "ASSIGN_CATEGORY") categoryIds.add(definition.action.categoryId);
    const [categories, accounts] = await Promise.all([
      Promise.all([...categoryIds].map((id) => this.ledgerRecords.findCategory(workspaceId, id))),
      Promise.all([...accountIds].map((id) => this.ledgerRecords.findAccount(workspaceId, id))),
    ]);
    if (categories.some((category) => !category))
      throw new DomainConflictError("RULE_CATEGORY_NOT_FOUND", "A rule category was not found in this workspace.");
    if (accounts.some((account) => !account || account.workspaceId !== workspaceId))
      throw new DomainConflictError("RULE_ACCOUNT_NOT_FOUND", "A rule account was not found in this workspace.");
  }

  private async requireTransaction(workspaceId: string, transactionId: string): Promise<LedgerTransactionRecord> {
    const transaction = await this.ledgerRecords.findTransaction(workspaceId, transactionId);
    if (!transaction) throw new NotFoundError("Transaction not found in this workspace.");
    return transaction;
  }

  private auditRecord(
    workspaceId: string,
    ruleId: string,
    actor: AuthenticatedActor,
    action: RuleManagementAction,
    commandFingerprint: string,
    idempotencyKey: string,
    metadata: Record<string, unknown>,
  ): CreateRuleManagementAudit {
    return {
      id: randomUUID(),
      workspaceId,
      ruleId,
      actorUserId: actor.userId,
      action,
      commandFingerprint,
      idempotencyKey,
      metadata,
    };
  }

  private async requireReadContext(actor: AuthenticatedActor, workspaceId: string): Promise<WorkspaceMemberContext> {
    const context = await this.workspaces.findMemberContext(workspaceId, actor.userId);
    if (!context) throw new AuthorizationError("You are not a member of this workspace.");
    assertWorkspacePermission(context.membership.role, "read");
    return context;
  }

  private async requireManageContext(actor: AuthenticatedActor, workspaceId: string): Promise<WorkspaceMemberContext> {
    const context = await this.requireReadContext(actor, workspaceId);
    assertWorkspacePermission(context.membership.role, "manage_ledger");
    return context;
  }
}

export class FinancialMutationError extends Error {
  constructor() {
    super("A rule action changed financial transaction fields.");
    this.name = "FinancialMutationError";
  }
}

function assertNoFinancialMutation(before: LedgerTransactionRecord, after: LedgerTransactionRecord): void {
  const unchanged =
    before.id === after.id &&
    before.kind === after.kind &&
    before.status === after.status &&
    before.amountMinor === after.amountMinor &&
    before.currency === after.currency &&
    before.accountId === after.accountId &&
    before.transferAccountId === after.transferAccountId &&
    before.occurredAt.getTime() === after.occurredAt.getTime() &&
    before.transferGroupId === after.transferGroupId &&
    before.refundedTransactionId === after.refundedTransactionId &&
    before.reversalOfTransactionId === after.reversalOfTransactionId;
  if (!unchanged) throw new FinancialMutationError();
}

function parseCommand<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new DomainConflictError("INVALID_RULE_COMMAND", "The rule command is invalid.", {
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    });
  return parsed.data;
}

function assertVersion(rule: RuleRecord, expectedUpdatedAt: Date): void {
  if (rule.updatedAt.getTime() !== expectedUpdatedAt.getTime())
    throw new DomainConflictError("RULE_CHANGED", "This rule changed before it could be updated.");
}

function nextVersion(previous: Date): Date {
  const now = Date.now();
  return new Date(now > previous.getTime() ? now : previous.getTime() + 1);
}

function fingerprintOf(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return Object.fromEntries(Object.entries(current as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return current;
  });
}
