import type { WorkspaceRole } from "@/authorization/workspace-permissions";

export const WORKSPACE_TYPES = ["PERSONAL", "COUPLE", "FAMILY", "CUSTOM"] as const;
export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

export interface WorkspacePreferencesInput {
  currency: string;
  locale: string;
  timezone: string;
  weekStartsOn: number;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  type: WorkspaceType;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspacePreferenceRecord extends WorkspacePreferencesInput {
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMembershipRecord {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  invitedByUserId: string | null;
  joinedAt: Date;
}

/** A server-resolved tenant context. Never construct this from browser input. */
export interface WorkspaceMemberContext {
  workspace: WorkspaceRecord;
  membership: WorkspaceMembershipRecord;
  preferences: WorkspacePreferenceRecord;
}

export interface WorkspaceInvitationRecord {
  id: string;
  workspaceId: string;
  invitedEmail: string;
  role: WorkspaceRole;
  invitedByUserId: string;
  acceptedByUserId: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface InvitationSecrets {
  token: string;
  shortCode: string;
}
