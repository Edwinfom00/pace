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
  isPaceGoalAvailableInWorkspace,
  onboardingPreferencesSchema,
  onboardingInvitationSchema,
  workspaceStepSchema,
  yourPaceSchema,
  type PaceUserProfileRecord,
  type OnboardingConnectionMethod,
  type PaceProactivity,
  type ValidatedWorkspaceStep,
  isOnboardingReady,
} from "./profile-domain";
import type { PaceUserProfileRepository } from "./repositories/pace-user-profile-repository";
import { getFinancialConnectionCapabilities } from "../financial-connections/capabilities";
import {
  DatabaseInsightRepository,
  type InsightRepository,
} from "../insights/repositories/insight-repository";
import type { MemberNotificationPreference } from "../insights/domain";

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

export class OnboardingPreferencesStepUnavailableError extends Error {
  readonly code = "ONBOARDING_PREFERENCES_STEP_UNAVAILABLE";

  constructor() {
    super("The preferences step is not available yet.");
  }
}

export class PersonalWorkspaceGoalError extends Error {
  readonly code = "PERSONAL_WORKSPACE_GOAL_UNAVAILABLE";

  constructor() {
    super("Manage money together is not available in a personal workspace.");
  }
}

export class OnboardingFinalizationUnavailableError extends Error {
  readonly code = "ONBOARDING_FINALIZATION_UNAVAILABLE";

  constructor() {
    super("Onboarding is not ready to be finalized.");
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

type PreferencesOnboardingService = Pick<WorkspaceService, "getWorkspaceForMember">;
type PreferencesRepository = Pick<InsightRepository, "saveOnboardingPreference">;

export async function getOnboardingMemberPreferences(
  workspaceId: string | null,
  userId: string,
  preferencesRepository: Pick<InsightRepository, "findPreference"> = new DatabaseInsightRepository(),
) {
  if (!workspaceId) return null;
  const preference = await preferencesRepository.findPreference(workspaceId, userId);
  return preference
    ? { goals: [...preference.paceGoals], proactivity: preference.proactivity }
    : null;
}

function notificationPolicyFor(proactivity: PaceProactivity): Pick<
  MemberNotificationPreference,
  "dailyEnabled" | "weeklyEnabled" | "monthlyEnabled" | "minimumSeverity"
> {
  if (proactivity === "QUIET") {
    return { dailyEnabled: false, weeklyEnabled: true, monthlyEnabled: true, minimumSeverity: "WARNING" };
  }

  return { dailyEnabled: true, weeklyEnabled: true, monthlyEnabled: true, minimumSeverity: "INFO" };
}


export async function persistPreferencesStep(
  actor: AuthenticatedActor,
  input: unknown,
  repository: PaceUserProfileRepository = getPaceUserProfileRepository(),
  workspaceService: PreferencesOnboardingService = getWorkspaceService(),
  preferencesRepository: PreferencesRepository = new DatabaseInsightRepository(),
): Promise<{ profile: PaceUserProfileRecord; preferences: Pick<MemberNotificationPreference, "paceGoals" | "proactivity"> }> {
  const preferences = onboardingPreferencesSchema.parse(input);
  const profile = await repository.getOrCreate(actor.userId);

  if (
    profile.onboardingStatus !== "IN_PROGRESS" ||
    profile.onboardingStep !== 5 ||
    !profile.countryCode ||
    !profile.currency ||
    !profile.timezone ||
    !profile.onboardingWorkspaceId
  ) {
    throw new OnboardingPreferencesStepUnavailableError();
  }

  const workspace = await workspaceService.getWorkspaceForMember(actor, profile.onboardingWorkspaceId);
  if (!workspace) {
    throw new OnboardingPreferencesStepUnavailableError();
  }

  const method = connectionMethodSchema.safeParse(profile.onboardingStartingMethod);
  const capabilities = getFinancialConnectionCapabilities({ country: profile.countryCode });
  if (!method.success || !isConnectionMethodAvailable(method.data, capabilities)) {
    throw new OnboardingPreferencesStepUnavailableError();
  }

  if (preferences.goals.some((goal) => !isPaceGoalAvailableInWorkspace(goal, workspace.type))) {
    throw new PersonalWorkspaceGoalError();
  }

  const savedPreferences = await preferencesRepository.saveOnboardingPreference(
    workspace.id,
    actor.userId,
    { goals: preferences.goals, proactivity: preferences.proactivity, ...notificationPolicyFor(preferences.proactivity) },
  );
  const readyProfile = await repository.markOnboardingReady(actor.userId);

  return {
    profile: readyProfile,
    preferences: { paceGoals: [...savedPreferences.paceGoals], proactivity: savedPreferences.proactivity },
  };
}

type FinalizeOnboardingService = Pick<WorkspaceService, "getWorkspaceForMember">;
type FinalizePreferencesRepository = Pick<InsightRepository, "findPreference">;

export type FinalizedOnboarding = {
  profile: PaceUserProfileRecord;
  workspaceSlug: string;
};


export async function finalizeOnboarding(
  actor: AuthenticatedActor,
  repository: PaceUserProfileRepository = getPaceUserProfileRepository(),
  workspaceService: FinalizeOnboardingService = getWorkspaceService(),
  preferencesRepository: FinalizePreferencesRepository = new DatabaseInsightRepository(),
): Promise<FinalizedOnboarding> {
  const profile = await repository.getOrCreate(actor.userId);

  if (!profile.onboardingWorkspaceId) {
    throw new OnboardingFinalizationUnavailableError();
  }

  const workspace = await workspaceService.getWorkspaceForMember(actor, profile.onboardingWorkspaceId);
  if (!workspace) {
    throw new OnboardingFinalizationUnavailableError();
  }

  // A repeat request after success safely resolves the same server-owned
  // workspace without creating any onboarding data again.
  if (profile.onboardingStatus === "COMPLETED") {
    return { profile, workspaceSlug: workspace.slug };
  }

  if (
    !isOnboardingReady(profile) ||
    !profile.countryCode ||
    !profile.currency ||
    !profile.timezone
  ) {
    throw new OnboardingFinalizationUnavailableError();
  }

  const method = connectionMethodSchema.safeParse(profile.onboardingStartingMethod);
  const capabilities = getFinancialConnectionCapabilities({ country: profile.countryCode });
  if (!method.success || !isConnectionMethodAvailable(method.data, capabilities)) {
    throw new OnboardingFinalizationUnavailableError();
  }

  if (workspace.type === "PERSONAL" && !profile.onboardingSkippedSteps.includes(3)) {
    throw new OnboardingFinalizationUnavailableError();
  }

  const preferences = await preferencesRepository.findPreference(workspace.id, actor.userId);
  if (
    !preferences ||
    preferences.paceGoals.length === 0 ||
    preferences.paceGoals.some((goal) => !isPaceGoalAvailableInWorkspace(goal, workspace.type))
  ) {
    throw new OnboardingFinalizationUnavailableError();
  }

  const completedProfile = await repository.completeOnboarding(actor.userId);
  return { profile: completedProfile, workspaceSlug: workspace.slug };
}
