import { randomUUID } from "node:crypto";

import {
  assertWorkspacePermission,
  canAssignInvitationRole,
  type WorkspaceRole,
} from "@/authorization/workspace-permissions";
import {
  AuthorizationError,
  ConflictError,
  DomainConflictError,
  NotFoundError,
} from "@/authorization/errors";

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
import { createWorkspaceSlug, isWorkspaceSlugConflict } from "./slug";

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
  /** Omit the email only for a deliberately shareable invitation link. */
  email?: string;
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

export const PERSONAL_WORKSPACE_CANNOT_INVITE = "PERSONAL_WORKSPACE_CANNOT_INVITE";
export const WORKSPACE_CANNOT_BECOME_PERSONAL = "WORKSPACE_CANNOT_BECOME_PERSONAL";

export class PersonalWorkspaceInviteError extends DomainConflictError {
  constructor() {
    super(PERSONAL_WORKSPACE_CANNOT_INVITE, "Personal workspaces cannot have invitations.");
    this.name = "PersonalWorkspaceInviteError";
  }
}

export class WorkspaceCannotBecomePersonalError extends DomainConflictError {
  constructor() {
    super(
      WORKSPACE_CANNOT_BECOME_PERSONAL,
      "A workspace with other members or active invitations cannot become personal.",
    );
    this.name = "WorkspaceCannotBecomePersonalError";
  }
}

export class WorkspaceService {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly invitationPepper: string,
    private readonly createId: () => string = randomUUID,
  ) {}

  async createWorkspace(actor: AuthenticatedActor, input: CreateWorkspaceInput): Promise<WorkspaceRecord> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.createWorkspaceWithId(actor, input, this.createId());
      } catch (error) {
        if (!isWorkspaceSlugConflict(error) || attempt === 2) {
          throw error;
        }
      }
    }

    throw new Error("Unable to allocate a unique workspace slug.");
  }

  
  async createOrUpdateOnboardingWorkspace(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: CreateWorkspaceInput,
  ): Promise<WorkspaceRecord> {
    const context = await this.repository.findMemberContext(workspaceId, actor.userId);

    if (context) {
      if (context.workspace.createdByUserId !== actor.userId || context.membership.role !== "OWNER") {
        throw new AuthorizationError("You cannot update this onboarding workspace.");
      }

      if (input.type === "PERSONAL") {
        await this.assertCanBecomePersonal(workspaceId);
      }

      return this.repository.updateWorkspace(workspaceId, { name: input.name, type: input.type });
    }

    if (await this.repository.findWorkspaceById(workspaceId)) {
      throw new AuthorizationError("You cannot access this onboarding workspace.");
    }

    try {
      return await this.createWorkspaceWithId(actor, input, workspaceId);
    } catch (error) {
      // Two direct POST retries can both observe a newly reserved id before
      // either insert commits. The loser reuses the winner's owner record.
      const concurrentlyCreated = await this.repository.findMemberContext(workspaceId, actor.userId);
      if (
        concurrentlyCreated &&
        concurrentlyCreated.workspace.createdByUserId === actor.userId &&
        concurrentlyCreated.membership.role === "OWNER"
      ) {
        return this.repository.updateWorkspace(workspaceId, { name: input.name, type: input.type });
      }

      throw error;
    }
  }

  async getWorkspaceForMember(actor: AuthenticatedActor, workspaceId: string): Promise<WorkspaceRecord | null> {
    return (await this.repository.findMemberContext(workspaceId, actor.userId))?.workspace ?? null;
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
    invitationId: string = randomUUID(),
  ): Promise<CreatedInvitation> {
    const context = await this.repository.findMemberContext(workspaceId, actor.userId);

    if (!context) {
      throw new AuthorizationError("You are not a member of this workspace.");
    }

    if (context.workspace.type === "PERSONAL") {
      throw new PersonalWorkspaceInviteError();
    }

    const { membership } = context;
    assertWorkspacePermission(membership.role, "create_invitation");

    if (!canAssignInvitationRole(membership.role, input.role)) {
      throw new AuthorizationError("You cannot grant that workspace role.");
    }

    const secrets = createInvitationSecrets();
    const invitation = await this.repository.createInvitation({
      id: invitationId,
      workspaceId,
      invitedEmail: input.email?.trim().toLowerCase() || null,
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

  private async assertCanBecomePersonal(workspaceId: string): Promise<void> {
    const [memberCount, hasActiveInvitations] = await Promise.all([
      this.repository.countMembers(workspaceId),
      this.repository.hasActiveInvitations(workspaceId),
    ]);

    if (memberCount > 1 || hasActiveInvitations) {
      throw new WorkspaceCannotBecomePersonalError();
    }
  }

  private async createWorkspaceWithId(
    actor: AuthenticatedActor,
    input: CreateWorkspaceInput,
    workspaceId: string,
  ): Promise<WorkspaceRecord> {
    const now = new Date();
    const workspace: WorkspaceRecord = {
      id: workspaceId,
      name: input.name,
      slug: createWorkspaceSlug(input.name, workspaceId),
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
}
