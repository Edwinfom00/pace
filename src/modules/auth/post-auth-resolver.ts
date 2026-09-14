import type { PaceUserProfileRepository } from "@/modules/onboarding/repositories/pace-user-profile-repository";
import { getPaceUserProfileRepository } from "@/modules/onboarding/server";
import {
  DatabaseWorkspaceRepository,
  type WorkspaceRepository,
} from "@/modules/workspaces/repositories/workspace-repository";

const SAFE_RETURN_URL_ORIGIN = "https://pace.internal";
const WORKSPACE_OVERVIEW_PATH = /^\/w\/([a-z0-9]+(?:-[a-z0-9]+)*)\/overview$/;
const JOIN_INVITATION_PATH = /^\/join\/[A-Za-z0-9_-]{43,128}$/;

export const ONBOARDING_DESTINATION = "/onboarding";
export const WORKSPACE_RECOVERY_DESTINATION = "/onboarding?recovery=workspace";

export interface PostAuthResolverDependencies {
  profiles: PaceUserProfileRepository;
  workspaces: Pick<WorkspaceRepository, "findDefaultMemberContext" | "findMemberContextBySlug">;
}

const defaultDependencies: PostAuthResolverDependencies = {
  profiles: getPaceUserProfileRepository(),
  workspaces: new DatabaseWorkspaceRepository(),
};


export async function resolvePostAuthDestination(
  userId: string,
  returnTo: string | null | undefined,
  dependencies: PostAuthResolverDependencies = defaultDependencies,
): Promise<string> {
  const profile = await dependencies.profiles.getOrCreate(userId);

  const requestedJoinDestination = getSafeJoinReturnTo(returnTo);
  if (requestedJoinDestination) {
    return requestedJoinDestination;
  }

  if (profile.onboardingStatus !== "COMPLETED") {
    return ONBOARDING_DESTINATION;
  }

  const requestedDestination = await resolveAuthorizedReturnTo(
    userId,
    returnTo,
    dependencies.workspaces,
  );
  if (requestedDestination) {
    return requestedDestination;
  }

  const workspace = await dependencies.workspaces.findDefaultMemberContext(userId);
  if (!workspace) {
    return WORKSPACE_RECOVERY_DESTINATION;
  }

  return workspaceOverviewPath(workspace.workspace.slug);
}

export function workspaceOverviewPath(workspaceSlug: string): string {
  return `/w/${workspaceSlug}/overview`;
}

export function loginPathForReturnTo(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getSafeInternalReturnTo(returnTo: string | null | undefined): string | null {
  if (
    !returnTo ||
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.startsWith("/\\") ||
    /%2f|%5c/i.test(returnTo)
  ) {
    return null;
  }

  try {
    const parsed = new URL(returnTo, SAFE_RETURN_URL_ORIGIN);
    return parsed.origin === SAFE_RETURN_URL_ORIGIN ? `${parsed.pathname}${parsed.search}` : null;
  } catch {
    return null;
  }
}

function getSafeJoinReturnTo(returnTo: string | null | undefined): string | null {
  const safeReturnTo = getSafeInternalReturnTo(returnTo);
  if (!safeReturnTo) return null;

  const pathname = new URL(safeReturnTo, SAFE_RETURN_URL_ORIGIN).pathname;
  return JOIN_INVITATION_PATH.test(pathname) ? safeReturnTo : null;
}

async function resolveAuthorizedReturnTo(
  userId: string,
  returnTo: string | null | undefined,
  workspaces: Pick<WorkspaceRepository, "findMemberContextBySlug">,
): Promise<string | null> {
  const path = getSafeInternalReturnTo(returnTo);
  const pathname = path ? new URL(path, SAFE_RETURN_URL_ORIGIN).pathname : null;
  const match = pathname?.match(WORKSPACE_OVERVIEW_PATH);

  if (!match) {
    return null;
  }

  const workspace = await workspaces.findMemberContextBySlug(match[1], userId);
  return workspace ? workspaceOverviewPath(workspace.workspace.slug) : null;
}
