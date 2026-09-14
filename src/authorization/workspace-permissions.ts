import { AuthorizationError } from "./errors";

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_ACTIONS = [
  "read",
  "update_preferences",
  "create_invitation",
  "revoke_invitation",
] as const;
export type WorkspaceAction = (typeof WORKSPACE_ACTIONS)[number];

const ROLE_PERMISSIONS: Readonly<Record<WorkspaceRole, readonly WorkspaceAction[]>> = {
  OWNER: ["read", "update_preferences", "create_invitation", "revoke_invitation"],
  ADMIN: ["read", "update_preferences", "create_invitation", "revoke_invitation"],
  MEMBER: ["read"],
  VIEWER: ["read"],
};

export function canPerformWorkspaceAction(
  role: WorkspaceRole,
  action: WorkspaceAction,
): boolean {
  return ROLE_PERMISSIONS[role].includes(action);
}

export function assertWorkspacePermission(
  role: WorkspaceRole,
  action: WorkspaceAction,
): void {
  if (!canPerformWorkspaceAction(role, action)) {
    throw new AuthorizationError();
  }
}

export function canAssignInvitationRole(
  actorRole: WorkspaceRole,
  invitedRole: WorkspaceRole,
): boolean {
  if (invitedRole === "OWNER") {
    return false;
  }

  if (actorRole === "OWNER") {
    return true;
  }

  return actorRole === "ADMIN" && (invitedRole === "MEMBER" || invitedRole === "VIEWER");
}
