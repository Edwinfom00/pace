import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { WORKSPACE_ACTIONS, canPerformWorkspaceAction } from "@/authorization/workspace-permissions";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { PaceAgentRuntime, PaceContextEnvelope } from "./domain";

export interface ResolvePaceContextInput {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly language?: string | null;
  readonly session: { readonly runtime: PaceAgentRuntime; readonly id: string };
}

/**
 * Builds the one envelope the orchestrator and every sub-agent share. Role and
 * workspace preferences are always re-read from the membership record; nothing
 * the model or the client says can widen them.
 */
export async function resolvePaceContextEnvelope(
  workspaces: Pick<WorkspaceRepository, "findMemberContext">,
  input: ResolvePaceContextInput,
): Promise<PaceContextEnvelope> {
  const member = await workspaces.findMemberContext(input.workspaceId, input.actor.userId);
  if (!member) throw new AuthorizationError("You are not a member of this workspace.");

  const role = member.membership.role;
  return Object.freeze({
    actor: Object.freeze({ ...input.actor }),
    workspaceId: member.workspace.id,
    role,
    permissions: Object.freeze(WORKSPACE_ACTIONS.filter((action) => canPerformWorkspaceAction(role, action))),
    currency: member.preferences.currency,
    locale: member.preferences.locale,
    timeZone: member.preferences.timezone,
    language: input.language ?? null,
    session: Object.freeze({ ...input.session }),
  });
}
