import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { alias } from "drizzle-orm/pg-core";

import { db, neonSql } from "@/db/client";
import {
  workspaceInvitations,
  workspaceMembers,
  workspacePreferences,
  workspaces,
} from "@/db/schema";
import { users } from "@/db/schema/auth";

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
  workspaceSlug: string;
  role: WorkspaceMembershipRecord["role"];
  alreadyMember: boolean;
}

export interface WorkspaceInvitationLookup {
  invitation: WorkspaceInvitationRecord;
  workspace: WorkspaceRecord;
  invitedByName: string | null;
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
  findInvitationForJoin(
    matcher: "token" | "code",
    hash: string,
  ): Promise<WorkspaceInvitationLookup | null>;
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

  async findInvitationForJoin(
    matcher: "token" | "code",
    hash: string,
  ): Promise<WorkspaceInvitationLookup | null> {
    const inviter = alias(users, "workspace_inviter");
    const predicate =
      matcher === "token"
        ? eq(workspaceInvitations.tokenHash, hash)
        : eq(workspaceInvitations.codeHash, hash);
    const [record] = await db
      .select({
        invitation: {
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
        },
        workspace: {
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          type: workspaces.type,
          createdByUserId: workspaces.createdByUserId,
          createdAt: workspaces.createdAt,
          updatedAt: workspaces.updatedAt,
        },
        invitedByName: inviter.name,
      })
      .from(workspaceInvitations)
      .innerJoin(workspaces, eq(workspaces.id, workspaceInvitations.workspaceId))
      .leftJoin(inviter, eq(inviter.id, workspaceInvitations.invitedByUserId))
      .where(predicate)
      .limit(1);

    return record ?? null;
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
    const auditId = randomUUID();
    const rows = (await neonSql`
      WITH candidate AS (
        SELECT i.id, i.workspace_id, workspace.slug AS workspace_slug, i.role,
          i.invited_by_user_id, i.used_at, i.accepted_by_user_id, i.expires_at
        FROM workspace_invitation AS i
        INNER JOIN workspace AS workspace ON workspace.id = i.workspace_id
        WHERE ${digestPredicate}
          AND workspace.type <> 'PERSONAL'
          AND (i.invited_email IS NULL OR i.invited_email = ${input.email})
          AND i.revoked_at IS NULL
        FOR UPDATE
      ),
      eligible AS (
        SELECT * FROM candidate
        WHERE (used_at IS NULL AND expires_at > NOW())
          OR accepted_by_user_id = ${input.userId}
      ),
      existing_membership AS (
        SELECT candidate.workspace_id, candidate.workspace_slug, member.role
        FROM eligible AS candidate
        INNER JOIN workspace_member AS member
          ON member.workspace_id = candidate.workspace_id
          AND member.user_id = ${input.userId}
      ),
      created_membership AS (
        INSERT INTO workspace_member (workspace_id, user_id, role, invited_by_user_id, joined_at)
        SELECT workspace_id, ${input.userId}, role, invited_by_user_id, NOW()
        FROM eligible
        WHERE used_at IS NULL AND NOT EXISTS (
          SELECT 1
          FROM existing_membership
        )
        ON CONFLICT (workspace_id, user_id) DO NOTHING
        RETURNING workspace_id
      ),
      consumed AS (
        UPDATE workspace_invitation AS invitation
        SET used_at = NOW(), accepted_by_user_id = ${input.userId}
        WHERE invitation.id IN (
          SELECT candidate.id
          FROM eligible AS candidate
          INNER JOIN created_membership ON created_membership.workspace_id = candidate.workspace_id
        )
          AND EXISTS (SELECT 1 FROM created_membership)
        RETURNING invitation.workspace_id, invitation.role
      ),
      audited AS (
        INSERT INTO workspace_invitation_audit (id, invitation_id, workspace_id, accepted_by_user_id, event_type)
        SELECT ${auditId}, candidate.id, consumed.workspace_id, ${input.userId}, 'ACCEPTED'
        FROM consumed
        INNER JOIN candidate ON candidate.workspace_id = consumed.workspace_id
      )
      SELECT consumed.workspace_id AS "workspaceId", candidate.workspace_slug AS "workspaceSlug", consumed.role,
        false AS "alreadyMember"
      FROM consumed
      INNER JOIN candidate ON candidate.workspace_id = consumed.workspace_id
      UNION ALL
      SELECT workspace_id AS "workspaceId", workspace_slug AS "workspaceSlug", role,
        true AS "alreadyMember"
      FROM existing_membership
      LIMIT 1;
    `) as ConsumedInvitation[];

    return rows[0] ?? null;
  }
}
