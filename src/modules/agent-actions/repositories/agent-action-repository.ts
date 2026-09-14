import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { agentActionAudits, agentActions } from "@/db/schema";

import type {
  AgentActionAuditRecord,
  AgentActionRecord,
  AgentActionResult,
  AgentActionStatus,
  AgentActionType,
  AgentActionDraft,
} from "../domain";

export interface CreateAgentActionInput {
  id: string;
  workspaceId: string;
  type: AgentActionType;
  initiatedByUserId: string;
  draft: AgentActionDraft;
  idempotencyKey: string;
  eveSessionId: string | null;
  eveCallId: string | null;
}

export interface CreateAgentActionAuditInput {
  id: string;
  actionId: string;
  workspaceId: string;
  actorUserId: string | null;
  event: string;
  fromStatus: AgentActionStatus | null;
  toStatus: AgentActionStatus | null;
  metadata?: Record<string, unknown>;
}

export interface TransitionAgentActionInput {
  workspaceId: string;
  actionId: string;
  from: readonly AgentActionStatus[];
  to: AgentActionStatus;
  approvedByUserId?: string | null;
  result?: AgentActionResult | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

export interface AgentActionRepository {
  createAction(input: CreateAgentActionInput): Promise<AgentActionRecord>;
  findAction(workspaceId: string, actionId: string): Promise<AgentActionRecord | null>;
  findActionByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<AgentActionRecord | null>;
  updateDraft(
    workspaceId: string,
    actionId: string,
    draft: AgentActionDraft,
  ): Promise<AgentActionRecord | null>;
  transitionAction(input: TransitionAgentActionInput): Promise<AgentActionRecord | null>;
  createAudit(input: CreateAgentActionAuditInput): Promise<AgentActionAuditRecord>;
  listAudit(workspaceId: string, actionId: string): Promise<AgentActionAuditRecord[]>;
}

export class DatabaseAgentActionRepository implements AgentActionRepository {
  async createAction(input: CreateAgentActionInput): Promise<AgentActionRecord> {
    const [record] = await db.insert(agentActions).values(input).returning();
    if (!record) throw new Error("Failed to create agent action.");
    return record;
  }

  async findAction(workspaceId: string, actionId: string): Promise<AgentActionRecord | null> {
    const [record] = await db
      .select()
      .from(agentActions)
      .where(and(eq(agentActions.workspaceId, workspaceId), eq(agentActions.id, actionId)))
      .limit(1);
    return record ?? null;
  }

  async findActionByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<AgentActionRecord | null> {
    const [record] = await db
      .select()
      .from(agentActions)
      .where(
        and(
          eq(agentActions.workspaceId, workspaceId),
          eq(agentActions.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async updateDraft(
    workspaceId: string,
    actionId: string,
    draft: AgentActionDraft,
  ): Promise<AgentActionRecord | null> {
    const [record] = await db
      .update(agentActions)
      .set({ draft, updatedAt: new Date() })
      .where(
        and(
          eq(agentActions.workspaceId, workspaceId),
          eq(agentActions.id, actionId),
          eq(agentActions.status, "DRAFT"),
        ),
      )
      .returning();
    return record ?? null;
  }

  async transitionAction(input: TransitionAgentActionInput): Promise<AgentActionRecord | null> {
    const values: {
      status: AgentActionStatus;
      updatedAt: Date;
      approvedByUserId?: string | null;
      result?: AgentActionResult | null;
      failureCode?: string | null;
      failureMessage?: string | null;
    } = { status: input.to, updatedAt: new Date() };

    if (input.approvedByUserId !== undefined) values.approvedByUserId = input.approvedByUserId;
    if (input.result !== undefined) values.result = input.result;
    if (input.failureCode !== undefined) values.failureCode = input.failureCode;
    if (input.failureMessage !== undefined) values.failureMessage = input.failureMessage;

    const [record] = await db
      .update(agentActions)
      .set(values)
      .where(
        and(
          eq(agentActions.workspaceId, input.workspaceId),
          eq(agentActions.id, input.actionId),
          inArray(agentActions.status, [...input.from]),
        ),
      )
      .returning();
    return record ?? null;
  }

  async createAudit(input: CreateAgentActionAuditInput): Promise<AgentActionAuditRecord> {
    const [record] = await db
      .insert(agentActionAudits)
      .values({ ...input, metadata: input.metadata ?? {} })
      .returning();
    if (!record) throw new Error("Failed to write agent action audit event.");
    return record;
  }

  async listAudit(workspaceId: string, actionId: string): Promise<AgentActionAuditRecord[]> {
    return db
      .select()
      .from(agentActionAudits)
      .where(
        and(
          eq(agentActionAudits.workspaceId, workspaceId),
          eq(agentActionAudits.actionId, actionId),
        ),
      )
      .orderBy(asc(agentActionAudits.createdAt), asc(agentActionAudits.id));
  }
}
