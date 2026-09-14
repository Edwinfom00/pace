import type {
  WorkspaceInvitationRecord,
  WorkspaceMemberContext,
  WorkspaceMembershipRecord,
  WorkspacePreferenceRecord,
  WorkspaceRecord,
} from "@/modules/workspaces/domain";
import type {
  ConsumedInvitation,
  ConsumeInvitationInput,
  CreateInvitationRecordInput,
  CreateWorkspaceWithOwnerInput,
  WorkspaceRepository,
  WorkspaceInvitationLookup,
} from "@/modules/workspaces/repositories/workspace-repository";

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  readonly workspaces = new Map<string, WorkspaceRecord>();
  readonly memberships = new Map<string, WorkspaceMembershipRecord>();
  readonly invitations = new Map<
    string,
    CreateInvitationRecordInput & Pick<WorkspaceInvitationRecord, "createdAt" | "usedAt" | "revokedAt" | "acceptedByUserId">
  >();
  readonly preferences = new Map<string, WorkspacePreferenceRecord>();
  readonly invitationAuditEvents: Array<{
    invitationId: string;
    workspaceId: string;
    acceptedByUserId: string;
  }> = [];

  async createWorkspaceWithOwner(input: CreateWorkspaceWithOwnerInput): Promise<void> {
    if ([...this.workspaces.values()].some((workspace) => workspace.slug === input.workspace.slug)) {
      throw Object.assign(new Error("workspace_slug_unique"), {
        code: "23505",
        constraint: "workspace_slug_unique",
      });
    }
    this.workspaces.set(input.workspace.id, input.workspace);
    this.memberships.set(this.membershipKey(input.owner.workspaceId, input.owner.userId), input.owner);
    this.preferences.set(input.workspace.id, {
      workspaceId: input.workspace.id,
      ...input.preferences,
      createdAt: input.workspace.createdAt,
      updatedAt: input.workspace.updatedAt,
    });
  }

  async findMembership(workspaceId: string, userId: string): Promise<WorkspaceMembershipRecord | null> {
    return this.memberships.get(this.membershipKey(workspaceId, userId)) ?? null;
  }

  async findMemberContext(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMemberContext | null> {
    const membership = await this.findMembership(workspaceId, userId);
    const workspace = this.workspaces.get(workspaceId);
    const preferences = this.preferences.get(workspaceId);
    return membership && workspace && preferences ? { workspace, membership, preferences } : null;
  }

  async findWorkspaceById(workspaceId: string): Promise<WorkspaceRecord | null> {
    return this.workspaces.get(workspaceId) ?? null;
  }

  async findMemberContextBySlug(
    slug: string,
    userId: string,
  ): Promise<WorkspaceMemberContext | null> {
    const workspace = [...this.workspaces.values()].find((candidate) => candidate.slug === slug);
    return workspace ? this.findMemberContext(workspace.id, userId) : null;
  }

  async findDefaultMemberContext(userId: string): Promise<WorkspaceMemberContext | null> {
    const workspaceId = [...this.memberships.values()]
      .filter((membership) => membership.userId === userId)
      .map((membership) => this.workspaces.get(membership.workspaceId))
      .filter((workspace): workspace is WorkspaceRecord => Boolean(workspace))
      .sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
      )[0]?.id;
    return workspaceId ? this.findMemberContext(workspaceId, userId) : null;
  }

  async listWorkspacesForUser(userId: string): Promise<WorkspaceRecord[]> {
    return [...this.memberships.values()]
      .filter((membership) => membership.userId === userId)
      .map((membership) => this.workspaces.get(membership.workspaceId))
      .filter((workspace): workspace is WorkspaceRecord => Boolean(workspace));
  }

  async countMembers(workspaceId: string): Promise<number> {
    return [...this.memberships.values()].filter((membership) => membership.workspaceId === workspaceId).length;
  }

  async hasActiveInvitations(workspaceId: string): Promise<boolean> {
    const now = new Date();
    return [...this.invitations.values()].some(
      (invitation) =>
        invitation.workspaceId === workspaceId &&
        !invitation.revokedAt &&
        !invitation.usedAt &&
        invitation.expiresAt > now,
    );
  }

  async findInvitationById(invitationId: string): Promise<WorkspaceInvitationRecord | null> {
    const invitation = this.invitations.get(invitationId);
    return invitation ? this.toInvitationRecord(invitation) : null;
  }

  async findInvitationForJoin(
    matcher: "token" | "code",
    hash: string,
  ): Promise<WorkspaceInvitationLookup | null> {
    const invitation = [...this.invitations.values()].find((candidate) =>
      (matcher === "token" ? candidate.tokenHash : candidate.codeHash) === hash,
    );
    const workspace = invitation ? this.workspaces.get(invitation.workspaceId) : null;

    return invitation && workspace
      ? {
          invitation: this.toInvitationRecord(invitation),
          workspace,
          invitedByName: null,
        }
      : null;
  }

  async updateWorkspace(
    workspaceId: string,
    values: Pick<WorkspaceRecord, "name" | "type">,
  ): Promise<WorkspaceRecord> {
    const current = this.workspaces.get(workspaceId);
    if (!current) throw new Error("Workspace does not exist.");
    const updated = { ...current, ...values, updatedAt: new Date() };
    this.workspaces.set(workspaceId, updated);
    return updated;
  }

  async updatePreferences(
    workspaceId: string,
    preferences: Partial<WorkspacePreferenceRecord>,
  ): Promise<WorkspacePreferenceRecord> {
    const current = this.preferences.get(workspaceId);
    if (!current) throw new Error("Workspace preferences do not exist.");
    const updated = { ...current, ...preferences, updatedAt: new Date() };
    this.preferences.set(workspaceId, updated);
    return updated;
  }

  async createInvitation(input: CreateInvitationRecordInput): Promise<WorkspaceInvitationRecord> {
    const stored = {
      ...input,
      acceptedByUserId: null,
      usedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.invitations.set(input.id, stored);
    return this.toInvitationRecord(stored);
  }

  async revokeInvitation(workspaceId: string, invitationId: string): Promise<boolean> {
    const invitation = this.invitations.get(invitationId);
    if (!invitation || invitation.workspaceId !== workspaceId) return false;
    invitation.revokedAt = new Date();
    return true;
  }

  async consumeInvitation(input: ConsumeInvitationInput): Promise<ConsumedInvitation | null> {
    const invitation = [...this.invitations.values()].find((candidate) => {
      const hash = input.matcher === "token" ? candidate.tokenHash : candidate.codeHash;
      return hash === input.hash;
    });
    const workspace = invitation ? this.workspaces.get(invitation.workspaceId) : null;
    if (!invitation || !workspace ||
      (invitation.invitedEmail !== null && invitation.invitedEmail !== input.email) ||
      invitation.revokedAt ||
      workspace.type === "PERSONAL") {
      return null;
    }

    const key = this.membershipKey(invitation.workspaceId, input.userId);
    const existingMembership = this.memberships.get(key);
    if (existingMembership) {
      return {
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
        role: existingMembership.role,
        alreadyMember: true,
      };
    }

    if (invitation.usedAt || invitation.expiresAt <= new Date()) return null;

    this.memberships.set(key, {
      workspaceId: invitation.workspaceId,
      userId: input.userId,
      role: invitation.role,
      invitedByUserId: invitation.invitedByUserId,
      joinedAt: new Date(),
    });
    invitation.usedAt = new Date();
    invitation.acceptedByUserId = input.userId;
    this.invitationAuditEvents.push({
      invitationId: invitation.id,
      workspaceId: invitation.workspaceId,
      acceptedByUserId: input.userId,
    });
    return {
      workspaceId: invitation.workspaceId,
      workspaceSlug: workspace.slug,
      role: invitation.role,
      alreadyMember: false,
    };
  }

  addMembership(record: WorkspaceMembershipRecord): void {
    this.memberships.set(this.membershipKey(record.workspaceId, record.userId), record);
  }

  private membershipKey(workspaceId: string, userId: string): string {
    return `${workspaceId}:${userId}`;
  }

  private toInvitationRecord(
    invitation: CreateInvitationRecordInput & {
      acceptedByUserId: string | null;
      usedAt: Date | null;
      revokedAt: Date | null;
      createdAt: Date;
    },
  ): WorkspaceInvitationRecord {
    return {
      id: invitation.id,
      workspaceId: invitation.workspaceId,
      invitedEmail: invitation.invitedEmail,
      role: invitation.role,
      invitedByUserId: invitation.invitedByUserId,
      acceptedByUserId: invitation.acceptedByUserId,
      expiresAt: invitation.expiresAt,
      usedAt: invitation.usedAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
    };
  }
}
