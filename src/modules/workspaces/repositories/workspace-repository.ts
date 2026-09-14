import { and, asc, count, eq, gt, isNull } from "drizzle-orm";

import { db, neonSql } from "@/db/client";
import {
  workspaceInvitations,
  workspaceMembers,
  workspacePreferences,
  workspaces,
} from "@/db/schema";

import type {
  WorkspaceInvitationRecord,
  WorkspaceMemberContext,
  WorkspaceMembershipRecord,
  WorkspacePreferenceRecord,
  WorkspacePreferencesInput,
  WorkspaceRecord,
} from "../domain";

export interface CreateWorkspaceWithOwnerInput {
  workspace: WorkspaceRecord;
  preferences: WorkspacePreferencesInput;
  owner: WorkspaceMembershipRecord;
}

export interface CreateInvitationRecordInput {
  id: string;
  workspaceId: string;
  invitedEmail: string | null;
  role: WorkspaceMembershipRecord["role"];
  tokenHash: string;
  codeHash: string;
  invitedByUserId: string;
  expiresAt: Date;
}

export interface ConsumeInvitationInput {
  matcher: "token" | "code";
  hash: string;
  userId: string;
  email: string;
}

export interface ConsumedInvitation {
  workspaceId: string;
  role: WorkspaceMembershipRecord["role"];
}

export interface WorkspaceRepository {
  createWorkspaceWithOwner(input: CreateWorkspaceWithOwnerInput): Promise<void>;
  findWorkspaceById(workspaceId: string): Promise<WorkspaceRecord | null>;
  findMembership(workspaceId: string, userId: string): Promise<WorkspaceMembershipRecord | null>;
  findMemberContext(workspaceId: string, userId: string): Promise<WorkspaceMemberContext | null>;
  findMemberContextBySlug(slug: string, userId: string): Promise<WorkspaceMemberContext | null>;
  findDefaultMemberContext(userId: string): Promise<WorkspaceMemberContext | null>;
  listWorkspacesForUser(userId: string): Promise<WorkspaceRecord[]>;
  countMembers(workspaceId: string): Promise<number>;
  hasActiveInvitations(workspaceId: string): Promise<boolean>;
  findInvitationById(invitationId: string): Promise<WorkspaceInvitationRecord | null>;
  updateWorkspace(
    workspaceId: string,
    values: Pick<WorkspaceRecord, "name" | "type">,
  ): Promise<WorkspaceRecord>;
  updatePreferences(
    workspaceId: string,
    preferences: Partial<WorkspacePreferencesInput>,
  ): Promise<WorkspacePreferenceRecord>;
  createInvitation(input: CreateInvitationRecordInput): Promise<WorkspaceInvitationRecord>;
  revokeInvitation(workspaceId: string, invitationId: string): Promise<boolean>;
  consumeInvitation(input: ConsumeInvitationInput): Promise<ConsumedInvitation | null>;
}

export class DatabaseWorkspaceRepository implements WorkspaceRepository {
  async createWorkspaceWithOwner(input: CreateWorkspaceWithOwnerInput): Promise<void> {
    await db.batch([
      db.insert(workspaces).values(input.workspace),
      db.insert(workspacePreferences).values({
        workspaceId: input.workspace.id,
        ...input.preferences,
      }),
      db.insert(workspaceMembers).values(input.owner),
    ]);
  }

  async findMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembershipRecord | null> {
    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    return membership ?? null;
  }

  async findMemberContext(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberContext | null> {
    const [record] = await db
      .select({ workspace: workspaces, membership: workspaceMembers, preferences: workspacePreferences })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .innerJoin(workspacePreferences, eq(workspacePreferences.workspaceId, workspaces.id))
      .where(and(eq(workspaces.id, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1);
    return record ?? null;
  }

  async findWorkspaceById(workspaceId: string): Promise<WorkspaceRecord | null> {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    return workspace ?? null;
  }

  async findMemberContextBySlug(
    slug: string,
    userId: string,
  ): Promise<WorkspaceMemberContext | null> {
    const [record] = await db
      .select({ workspace: workspaces, membership: workspaceMembers, preferences: workspacePreferences })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .innerJoin(workspacePreferences, eq(workspacePreferences.workspaceId, workspaces.id))
      .where(and(eq(workspaces.slug, slug), eq(workspaceMembers.userId, userId)))
      .limit(1);
    return record ?? null;
  }

  async findDefaultMemberContext(userId: string): Promise<WorkspaceMemberContext | null> {
    const [record] = await db
      .select({ workspace: workspaces, membership: workspaceMembers, preferences: workspacePreferences })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .innerJoin(workspacePreferences, eq(workspacePreferences.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaces.createdAt), asc(workspaces.id))
      .limit(1);
    return record ?? null;
  }

  async listWorkspacesForUser(userId: string): Promise<WorkspaceRecord[]> {
    const records = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        type: workspaces.type,
        createdByUserId: workspaces.createdByUserId,
        createdAt: workspaces.createdAt,
        updatedAt: workspaces.updatedAt,
      })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, userId));

    return records;
  }

  async countMembers(workspaceId: string): Promise<number> {
    const [result] = await db
      .select({ value: count() })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    return Number(result?.value ?? 0);
  }

  async hasActiveInvitations(workspaceId: string): Promise<boolean> {
    const [result] = await db
      .select({ value: count() })
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          isNull(workspaceInvitations.revokedAt),
          isNull(workspaceInvitations.usedAt),
          gt(workspaceInvitations.expiresAt, new Date()),
        ),
      );
    return Number(result?.value ?? 0) > 0;
  }

  async findInvitationById(invitationId: string): Promise<WorkspaceInvitationRecord | null> {
    const [invitation] = await db
      .select({
        id: workspaceInvitations.id,
        workspaceId: workspaceInvitations.workspaceId,
        invitedEmail: workspaceInvitations.invitedEmail,
        role: workspaceInvitations.role,
        invitedByUserId: workspaceInvitations.invitedByUserId,
        acceptedByUserId: workspaceInvitations.acceptedByUserId,
        expiresAt: workspaceInvitations.expiresAt,
        usedAt: workspaceInvitations.usedAt,
        revokedAt: workspaceInvitations.revokedAt,
        createdAt: workspaceInvitations.createdAt,
      })
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.id, invitationId))
      .limit(1);
    return invitation ?? null;
  }

  async updateWorkspace(
    workspaceId: string,
    values: Pick<WorkspaceRecord, "name" | "type">,
  ): Promise<WorkspaceRecord> {
    const [workspace] = await db
      .update(workspaces)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    if (!workspace) {
      throw new Error("Workspace does not exist.");
    }

    return workspace;
  }

  async updatePreferences(
    workspaceId: string,
    preferences: Partial<WorkspacePreferencesInput>,
  ): Promise<WorkspacePreferenceRecord> {
    const [record] = await db
      .update(workspacePreferences)
      .set({ ...preferences, updatedAt: new Date() })
      .where(eq(workspacePreferences.workspaceId, workspaceId))
      .returning();

    if (!record) {
      throw new Error("Workspace preferences do not exist.");
    }

    return record;
  }

  async createInvitation(
    input: CreateInvitationRecordInput,
  ): Promise<WorkspaceInvitationRecord> {
    const [record] = await db
      .insert(workspaceInvitations)
      .values(input)
      .returning({
        id: workspaceInvitations.id,
        workspaceId: workspaceInvitations.workspaceId,
        invitedEmail: workspaceInvitations.invitedEmail,
        role: workspaceInvitations.role,
        invitedByUserId: workspaceInvitations.invitedByUserId,
        acceptedByUserId: workspaceInvitations.acceptedByUserId,
        expiresAt: workspaceInvitations.expiresAt,
        usedAt: workspaceInvitations.usedAt,
        revokedAt: workspaceInvitations.revokedAt,
        createdAt: workspaceInvitations.createdAt,
      });

    if (!record) {
      throw new Error("Failed to create invitation.");
    }

    return record;
  }

  async revokeInvitation(workspaceId: string, invitationId: string): Promise<boolean> {
    const revoked = await db
      .update(workspaceInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          eq(workspaceInvitations.id, invitationId),
        ),
      )
      .returning({ id: workspaceInvitations.id });

    return revoked.length === 1;
  }

  async consumeInvitation(input: ConsumeInvitationInput): Promise<ConsumedInvitation | null> {
    const digestPredicate =
      input.matcher === "token"
        ? neonSql`i.token_hash = ${input.hash}`
        : neonSql`i.code_hash = ${input.hash}`;

    // A single PostgreSQL statement locks the invitation, creates the membership,
    // and consumes the invitation. A concurrent claim cannot produce two members
    // or consume an invite without adding its membership.
    const rows = (await neonSql`
      WITH candidate AS (
        SELECT i.id, i.workspace_id, i.role, i.invited_by_user_id
        FROM workspace_invitation AS i
        INNER JOIN workspace AS workspace ON workspace.id = i.workspace_id
        WHERE ${digestPredicate}
          AND workspace.type <> 'PERSONAL'
          AND (i.invited_email IS NULL OR i.invited_email = ${input.email})
          AND i.revoked_at IS NULL
          AND i.used_at IS NULL
          AND i.expires_at > NOW()
        FOR UPDATE
      ),
      created_membership AS (
        INSERT INTO workspace_member (workspace_id, user_id, role, invited_by_user_id, joined_at)
        SELECT workspace_id, ${input.userId}, role, invited_by_user_id, NOW()
        FROM candidate
        WHERE NOT EXISTS (
          SELECT 1
          FROM workspace_member AS member
          WHERE member.workspace_id = candidate.workspace_id
            AND member.user_id = ${input.userId}
        )
        ON CONFLICT (workspace_id, user_id) DO NOTHING
        RETURNING workspace_id
      ),
      consumed AS (
        UPDATE workspace_invitation AS invitation
        SET used_at = NOW(), accepted_by_user_id = ${input.userId}
        WHERE invitation.id IN (SELECT id FROM candidate)
          AND EXISTS (SELECT 1 FROM created_membership)
        RETURNING invitation.workspace_id, invitation.role
      )
      SELECT workspace_id AS "workspaceId", role
      FROM consumed;
    `) as ConsumedInvitation[];

    return rows[0] ?? null;
  }
}
