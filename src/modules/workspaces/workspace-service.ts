import { randomUUID } from "node:crypto";

import {
  assertWorkspacePermission,
  canAssignInvitationRole,
  type WorkspaceRole,
} from "@/authorization/workspace-permissions";
import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";

import type { AuthenticatedActor } from "@/authorization/session";

import type {
  WorkspaceInvitationRecord,
  WorkspacePreferenceRecord,
  WorkspacePreferencesInput,
  WorkspaceRecord,
  WorkspaceType,
} from "./domain";
import {
  createInvitationSecrets,
  formatInvitationCode,
  hashInvitationSecret,
} from "./invite-secrets";
import type { WorkspaceRepository } from "./repositories/workspace-repository";

const DEFAULT_PREFERENCES: WorkspacePreferencesInput = {
  currency: "USD",
  locale: "en-US",
  timezone: "UTC",
  weekStartsOn: 1,
};

export interface CreateWorkspaceInput {
  name: string;
  type: WorkspaceType;
  preferences?: Partial<WorkspacePreferencesInput>;
}

export interface CreateInvitationInput {
  email: string;
  role: WorkspaceRole;
  expiresInHours: number;
}

export interface JoinInvitationInput {
  token?: string;
  code?: string;
}

export interface CreatedInvitation {
  invitation: WorkspaceInvitationRecord;
  inviteUrlToken: string;
  shortCode: string;
}

export class WorkspaceService {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly invitationPepper: string,
  ) {}

  async createWorkspace(actor: AuthenticatedActor, input: CreateWorkspaceInput): Promise<WorkspaceRecord> {
    const now = new Date();
    const workspace: WorkspaceRecord = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.createWorkspaceWithOwner({
      workspace,
      preferences: { ...DEFAULT_PREFERENCES, ...input.preferences },
      owner: {
        workspaceId: workspace.id,
        userId: actor.userId,
        role: "OWNER",
        invitedByUserId: null,
        joinedAt: now,
      },
    });

    return workspace;
  }

  async listWorkspaces(actor: AuthenticatedActor): Promise<WorkspaceRecord[]> {
    return this.repository.listWorkspacesForUser(actor.userId);
  }

  async updatePreferences(
    actor: AuthenticatedActor,
    workspaceId: string,
    preferences: Partial<WorkspacePreferencesInput>,
  ): Promise<WorkspacePreferenceRecord> {
    const membership = await this.requireMembership(actor.userId, workspaceId);
    assertWorkspacePermission(membership.role, "update_preferences");
    return this.repository.updatePreferences(workspaceId, preferences);
  }

  async createInvitation(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: CreateInvitationInput,
  ): Promise<CreatedInvitation> {
    const membership = await this.requireMembership(actor.userId, workspaceId);
    assertWorkspacePermission(membership.role, "create_invitation");

    if (!canAssignInvitationRole(membership.role, input.role)) {
      throw new AuthorizationError("You cannot grant that workspace role.");
    }

    const secrets = createInvitationSecrets();
    const invitation = await this.repository.createInvitation({
      id: randomUUID(),
      workspaceId,
      invitedEmail: input.email,
      role: input.role,
      tokenHash: hashInvitationSecret(this.invitationPepper, "token", secrets.token),
      codeHash: hashInvitationSecret(this.invitationPepper, "code", secrets.shortCode),
      invitedByUserId: actor.userId,
      expiresAt: new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000),
    });

    return {
      invitation,
      inviteUrlToken: secrets.token,
      shortCode: formatInvitationCode(secrets.shortCode),
    };
  }

  async revokeInvitation(
    actor: AuthenticatedActor,
    workspaceId: string,
    invitationId: string,
  ): Promise<void> {
    const membership = await this.requireMembership(actor.userId, workspaceId);
    assertWorkspacePermission(membership.role, "revoke_invitation");

    if (!(await this.repository.revokeInvitation(workspaceId, invitationId))) {
      throw new NotFoundError("Invitation not found in this workspace.");
    }
  }

  async joinInvitation(actor: AuthenticatedActor, input: JoinInvitationInput): Promise<{ workspaceId: string }> {
    const matcher = input.token ? "token" : "code";
    const secret = input.token ?? input.code?.replaceAll("-", "").toUpperCase();

    if (!secret) {
      throw new ConflictError("Invitation credentials are invalid or unavailable.");
    }

    const consumed = await this.repository.consumeInvitation({
      matcher,
      hash: hashInvitationSecret(this.invitationPepper, matcher, secret),
      userId: actor.userId,
      email: actor.email.trim().toLowerCase(),
    });

    if (!consumed) {
      throw new ConflictError("Invitation credentials are invalid, expired, or already used.");
    }

    return { workspaceId: consumed.workspaceId };
  }

  private async requireMembership(userId: string, workspaceId: string) {
    const membership = await this.repository.findMembership(workspaceId, userId);

    if (!membership) {
      throw new AuthorizationError("You are not a member of this workspace.");
    }

    return membership;
  }
}
