import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";

type EveAuth = {
  principalId: string;
  principalType: string;
  attributes?: Record<string, unknown>;
};

export interface PaceEveScope {
  actor: AuthenticatedActor;
  workspaceId: string;
}

/** Converts only server-stamped Eve auth attributes into application identity. */
export function requirePaceEveScope(input: { session: { auth: { current: EveAuth | null } } }): PaceEveScope {
  const principal = input.session.auth.current;
  const workspaceId = principal?.attributes?.workspaceId;

  if (principal?.principalType !== "user" || typeof workspaceId !== "string") {
    throw new AuthorizationError("An authenticated workspace member is required.");
  }

  return {
    actor: {
      userId: principal.principalId,
      email: readString(principal.attributes?.email),
      name: readString(principal.attributes?.name),
    },
    workspaceId,
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
