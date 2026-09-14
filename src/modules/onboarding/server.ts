import { DatabasePaceUserProfileRepository } from "./repositories/pace-user-profile-repository";
import { randomUUID } from "node:crypto";

import type { AuthenticatedActor } from "@/authorization/session";
import { getWorkspaceService } from "@/modules/workspaces/server";
import {
  PersonalWorkspaceInviteError,
  type WorkspaceService,
} from "@/modules/workspaces/workspace-service";

import {
  connectionMethodSchema,
  isConnectionMethodAvailable,
  onboardingInvitationSchema,
  workspaceStepSchema,
  yourPaceSchema,
  type PaceUserProfileRecord,
  type OnboardingConnectionMethod,
  type ValidatedWorkspaceStep,
} from "./profile-domain";
import type { PaceUserProfileRepository } from "./repositories/pace-user-profile-repository";
import { getFinancialConnectionCapabilities } from "../financial-connections/capabilities";

export function getPaceUserProfileRepository(): DatabasePaceUserProfileRepository {
  return new DatabasePaceUserProfileRepository();
}


export async function persistYourPaceStep(
  userId: string,
  input: unknown,
  repository: PaceUserProfileRepository = getPaceUserProfileRepository(),
): Promise<PaceUserProfileRecord> {
  const validated = yourPaceSchema.parse(input);
  return repository.saveYourPaceStep(userId, validated);
}

type WorkspaceOnboardingService = Pick<
  WorkspaceService,
  "createInvitation" | "createOrUpdateOnboardingWorkspace" | "getWorkspaceForMember" | "revokeInvitation"
>;

export type PersistedWorkspaceStep = {
  data: ValidatedWorkspaceStep;
  profile: PaceUserProfileRecord;
};


export async function persistWorkspaceStep(
  actor: AuthenticatedActor,
  input: unknown,
  repository: PaceUserProfileRepository = getPaceUserProfileRepository(),
  workspaceService: WorkspaceOnboardingService = getWorkspaceService(),
): Promise<PersistedWorkspaceStep> {
  const data = workspaceStepSchema.parse(input);
  const reservedProfile = await repository.claimOnboardingWorkspaceId(actor.userId, randomUUID());

  if (!reservedProfile.onboardingWorkspaceId) {
    throw new Error("A workspace could not be reserved for onboarding.");
  }

  await workspaceService.createOrUpdateOnboardingWorkspace(
    actor,
    reservedProfile.onboardingWorkspaceId,
    data,
  );

  return {
    data,
    profile: await repository.saveWorkspaceStep(actor.userId, reservedProfile.onboardingWorkspaceId, {
      nextStep: data.type === "PERSONAL" ? 4 : 3,
      skipTogether: data.type === "PERSONAL",
    }),
  };
}

export type OnboardingInvitationCreation =
  | { kind: "created"; inviteUrlToken: string; shortCode: string }
  | { kind: "rotation-required" };

/**
 * Creates one invitation for the canonical onboarding workspace. A compare-
 * and-set profile reference makes duplicate UI submissions idempotent while
 * keeping the raw token ephemeral in this one response.
 */
export async function createOnboardingInvitation(
  actor: AuthenticatedActor,
  input: unknown,
  repository: PaceUserProfileRepository = getPaceUserProfileRepository(),
  workspaceService: WorkspaceOnboardingService = getWorkspaceService(),
  createId: () => string = randomUUID,
  rotate = false,
): Promise<OnboardingInvitationCreation> {
  const data = onboardingInvitationSchema.parse(input);
  let profile = await repository.getOrCreate(actor.userId);

  if (!profile.onboardingWorkspaceId) {
    throw new Error("An onboarding workspace is required before inviting someone.");
  }

  const workspace = await workspaceService.getWorkspaceForMember(actor, profile.onboardingWorkspaceId);
  if (!workspace) {
    throw new Error("The onboarding workspace is unavailable.");
  }

  if (workspace.type === "PERSONAL") {
    throw new PersonalWorkspaceInviteError();
  }

  if (profile.onboardingInvitationId) {
    if (!rotate) {
      return { kind: "rotation-required" };
    }

    // Revoking an already consumed/expired invitation is harmless for this
    // flow; if the record vanished, clearing the non-secret reference still
    // lets the owner deliberately issue a fresh credential.
    try {
      await workspaceService.revokeInvitation(actor, workspace.id, profile.onboardingInvitationId);
    } catch {
      // The following compare-and-set protects against clearing a newer id.
    }
    profile = await repository.clearOnboardingInvitationId(actor.userId, profile.onboardingInvitationId);
  }

  const candidateInvitationId = createId();
  const claimedProfile = await repository.claimOnboardingInvitationId(actor.userId, candidateInvitationId);

  if (claimedProfile.onboardingInvitationId !== candidateInvitationId) {
    return { kind: "rotation-required" };
  }

  try {
    const created = await workspaceService.createInvitation(
      actor,
      workspace.id,
      {
        ...(data.method === "email" ? { email: data.email } : {}),
        role: "MEMBER",
        expiresInHours: 24 * 7,
      },
      candidateInvitationId,
    );

    return {
      kind: "created",
      inviteUrlToken: created.inviteUrlToken,
      shortCode: created.shortCode,
    };
  } catch (error) {
    await repository.clearOnboardingInvitationId(actor.userId, candidateInvitationId);
    throw error;
  }
}

/** Completes Step 3 without accepting browser-supplied workspace state. */
export async function persistTogetherStep(
  actor: AuthenticatedActor,
  repository: PaceUserProfileRepository = getPaceUserProfileRepository(),
  workspaceService: Pick<WorkspaceService, "getWorkspaceForMember"> = getWorkspaceService(),
): Promise<PaceUserProfileRecord> {
  const profile = await repository.getOrCreate(actor.userId);
  const workspace = profile.onboardingWorkspaceId
    ? await workspaceService.getWorkspaceForMember(actor, profile.onboardingWorkspaceId)
    : null;

  if (!workspace) {
    throw new Error("The onboarding workspace is unavailable.");
  }

  // PERSONAL never renders Step 3, but this keeps a forged server-action call
  // safely not-applicable as well.
  const skipped = workspace.type === "PERSONAL" || !profile.onboardingInvitationId;
  return repository.saveTogetherStep(actor.userId, skipped);
}

export class ConnectionMethodUnavailableError extends Error {
  readonly code = "CONNECTION_METHOD_UNAVAILABLE";

  constructor() {
    super("The selected connection method is not available for this profile.");
  }
}

export class OnboardingConnectStepUnavailableError extends Error {
  readonly code = "ONBOARDING_CONNECT_STEP_UNAVAILABLE";

  constructor() {
    super("The connection step is not available yet.");
  }
}

type ConnectOnboardingService = Pick<WorkspaceService, "getWorkspaceForMember">;

/**
 * Completes Step 4 using only canonical profile and workspace state. The
 * browser's selected enum is revalidated against freshly resolved provider
 * capabilities before it can ever be persisted.
 */
export async function persistConnectStep(
  actor: AuthenticatedActor,
  input: unknown,
  repository: PaceUserProfileRepository = getPaceUserProfileRepository(),
  workspaceService: ConnectOnboardingService = getWorkspaceService(),
): Promise<PaceUserProfileRecord> {
  const method = connectionMethodSchema.parse(input) as OnboardingConnectionMethod;
  const profile = await repository.getOrCreate(actor.userId);

  if (profile.onboardingStep !== 4 && profile.onboardingStep !== 5) {
    throw new OnboardingConnectStepUnavailableError();
  }

  if (!profile.onboardingWorkspaceId) {
    throw new OnboardingConnectStepUnavailableError();
  }

  const workspace = await workspaceService.getWorkspaceForMember(actor, profile.onboardingWorkspaceId);
  if (!workspace) {
    throw new OnboardingConnectStepUnavailableError();
  }

  const capabilities = getFinancialConnectionCapabilities({ country: profile.countryCode });
  if (!isConnectionMethodAvailable(method, capabilities)) {
    throw new ConnectionMethodUnavailableError();
  }

  return repository.saveConnectStep(actor.userId, method);
}
