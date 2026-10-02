import type {
  RuleExecutionRecord,
  RuleManagementAuditRecord,
  RuleRecord,
  RuleStatus,
} from "@/modules/plans/rules/domain";
import type {
  CreateRuleExecution,
  CreateRuleManagementAudit,
  CreateRuleRecord,
  RuleExecutionClaim,
  RuleExecutionCompletion,
  RuleUpdate,
  RulesRepository,
} from "@/modules/plans/rules/repositories/rules-repository";

export class InMemoryRulesRepository implements RulesRepository {
  readonly rules = new Map<string, RuleRecord>();
  readonly audits = new Map<string, RuleManagementAuditRecord>();
  readonly executions = new Map<string, RuleExecutionRecord>();

  async createRule(rule: CreateRuleRecord, audit: CreateRuleManagementAudit): Promise<RuleRecord> {
    this.assertAuditKeyAvailable(audit);
    if (
      rule.createdByAgentActionId &&
      [...this.rules.values()].some(
        (candidate) =>
          candidate.workspaceId === rule.workspaceId && candidate.createdByAgentActionId === rule.createdByAgentActionId,
      )
    )
      throw Object.assign(new Error("duplicate agent action"), { code: "23505" });
    const record: RuleRecord = { ...rule, updatedAt: rule.createdAt };
    this.rules.set(record.id, record);
    this.storeAudit(audit);
    return record;
  }

  async findRule(workspaceId: string, ruleId: string): Promise<RuleRecord | null> {
    const record = this.rules.get(ruleId);
    return record?.workspaceId === workspaceId ? record : null;
  }

  async findRuleByAgentAction(workspaceId: string, agentActionId: string): Promise<RuleRecord | null> {
    return (
      [...this.rules.values()].find(
        (rule) => rule.workspaceId === workspaceId && rule.createdByAgentActionId === agentActionId,
      ) ?? null
    );
  }

  async listRules(workspaceId: string, status?: RuleStatus): Promise<RuleRecord[]> {
    return [...this.rules.values()]
      .filter((rule) => rule.workspaceId === workspaceId && (!status || rule.status === status))
      .sort((left, right) => left.priority - right.priority || left.createdAt.getTime() - right.createdAt.getTime());
  }

  async updateRule(
    workspaceId: string,
    ruleId: string,
    update: RuleUpdate,
    expectedUpdatedAt: Date,
    audit: CreateRuleManagementAudit,
  ): Promise<RuleRecord | null> {
    const current = await this.findRule(workspaceId, ruleId);
    if (!current || current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return null;
    this.assertAuditKeyAvailable(audit);
    const updated: RuleRecord = { ...current, ...update };
    this.rules.set(ruleId, updated);
    this.storeAudit(audit);
    return updated;
  }

  async findManagementAudit(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<RuleManagementAuditRecord | null> {
    return this.audits.get(`${workspaceId}:${actorUserId}:${idempotencyKey}`) ?? null;
  }

  async listManagementAudits(workspaceId: string, ruleId: string): Promise<RuleManagementAuditRecord[]> {
    return [...this.audits.values()].filter((audit) => audit.workspaceId === workspaceId && audit.ruleId === ruleId);
  }

  async claimExecution(input: CreateRuleExecution): Promise<RuleExecutionClaim> {
    const existing = [...this.executions.values()].find(
      (execution) =>
        execution.workspaceId === input.workspaceId &&
        execution.ruleId === input.ruleId &&
        execution.ruleRevision === input.ruleRevision &&
        execution.transactionId === input.transactionId,
    );
    if (existing) return { claimed: false, execution: existing };
    const now = new Date();
    const execution: RuleExecutionRecord = { ...input, createdAt: now, updatedAt: now };
    this.executions.set(execution.id, execution);
    return { claimed: true, execution };
  }

  async completeExecution(
    workspaceId: string,
    executionId: string,
    completion: RuleExecutionCompletion,
  ): Promise<RuleExecutionRecord> {
    const current = this.executions.get(executionId);
    if (!current || current.workspaceId !== workspaceId || current.outcome !== "PENDING")
      throw new Error("Rule execution could not be completed.");
    const completed: RuleExecutionRecord = { ...current, ...completion, updatedAt: new Date() };
    this.executions.set(executionId, completed);
    return completed;
  }

  async listExecutions(
    workspaceId: string,
    filters: { readonly ruleId?: string; readonly transactionId?: string },
  ): Promise<RuleExecutionRecord[]> {
    return [...this.executions.values()].filter(
      (execution) =>
        execution.workspaceId === workspaceId &&
        (!filters.ruleId || execution.ruleId === filters.ruleId) &&
        (!filters.transactionId || execution.transactionId === filters.transactionId),
    );
  }

  private assertAuditKeyAvailable(audit: CreateRuleManagementAudit): void {
    if (this.audits.has(`${audit.workspaceId}:${audit.actorUserId}:${audit.idempotencyKey}`))
      throw Object.assign(new Error("duplicate idempotency key"), { code: "23505" });
  }

  private storeAudit(audit: CreateRuleManagementAudit): void {
    this.audits.set(`${audit.workspaceId}:${audit.actorUserId}:${audit.idempotencyKey}`, {
      ...audit,
      createdAt: new Date(),
    });
  }
}
