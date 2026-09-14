import type {
  AgentActionAuditRecord,
  AgentActionRecord,
  AgentActionStatus,
  TransactionDraft,
} from "@/modules/agent-actions/domain";
import type {
  AgentActionRepository,
  CreateAgentActionAuditInput,
  CreateAgentActionInput,
  TransitionAgentActionInput,
} from "@/modules/agent-actions/repositories/agent-action-repository";

export class InMemoryAgentActionRepository implements AgentActionRepository {
  readonly actions = new Map<string, AgentActionRecord>();
  readonly audit = new Map<string, AgentActionAuditRecord>();

  async createAction(input: CreateAgentActionInput): Promise<AgentActionRecord> {
    const now = new Date();
    const record: AgentActionRecord = {
      ...input,
      status: "DRAFT",
      approvedByUserId: null,
      result: null,
      failureCode: null,
      failureMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    this.actions.set(record.id, record);
    return record;
  }

  async findAction(workspaceId: string, actionId: string): Promise<AgentActionRecord | null> {
    const action = this.actions.get(actionId);
    return action?.workspaceId === workspaceId ? action : null;
  }

  async findActionByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<AgentActionRecord | null> {
    return (
      [...this.actions.values()].find(
        (action) => action.workspaceId === workspaceId && action.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async updateDraft(
    workspaceId: string,
    actionId: string,
    draft: TransactionDraft,
  ): Promise<AgentActionRecord | null> {
    const current = await this.findAction(workspaceId, actionId);
    if (!current || current.status !== "DRAFT") return null;
    const updated = { ...current, draft, updatedAt: new Date() };
    this.actions.set(actionId, updated);
    return updated;
  }

  async transitionAction(input: TransitionAgentActionInput): Promise<AgentActionRecord | null> {
    const current = await this.findAction(input.workspaceId, input.actionId);
    if (!current || !input.from.includes(current.status)) return null;
    const updated: AgentActionRecord = {
      ...current,
      status: input.to as AgentActionStatus,
      updatedAt: new Date(),
      ...(input.approvedByUserId === undefined ? {} : { approvedByUserId: input.approvedByUserId }),
      ...(input.result === undefined ? {} : { result: input.result }),
      ...(input.failureCode === undefined ? {} : { failureCode: input.failureCode }),
      ...(input.failureMessage === undefined ? {} : { failureMessage: input.failureMessage }),
    };
    this.actions.set(input.actionId, updated);
    return updated;
  }

  async createAudit(input: CreateAgentActionAuditInput): Promise<AgentActionAuditRecord> {
    const record: AgentActionAuditRecord = {
      ...input,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    this.audit.set(record.id, record);
    return record;
  }

  async listAudit(workspaceId: string, actionId: string): Promise<AgentActionAuditRecord[]> {
    return [...this.audit.values()]
      .filter((entry) => entry.workspaceId === workspaceId && entry.actionId === actionId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }
}
