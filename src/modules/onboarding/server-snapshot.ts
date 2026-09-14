import type { OnboardingLanguage } from "./metadata";
import type { WorkspaceRecord } from "../workspaces/domain";
import { getFinancialConnectionCapabilities, type FinancialConnectionCapabilities } from "../financial-connections/capabilities";
import {
  DEFAULT_ONBOARDING_PREFERENCES,
  reconcileConnectionMethod,
  type ConnectDraft,
  type OnboardingStep,
  type PaceUserProfileRecord,
  type PreferencesDraft,
  type WorkspaceDraft,
  type YourPaceDraft,
} from "./profile-domain";

export type OnboardingServerSnapshot = {
  currentStep: OnboardingStep;
  yourPace: YourPaceDraft;
  workspace: WorkspaceDraft;
  together: { skipped: boolean; hasExistingInvitation: boolean };
  connect: ConnectDraft & { capabilities: FinancialConnectionCapabilities };
  /** Optional for backwards-compatible Step 1–4 snapshot call sites. */
  preferences?: PreferencesDraft;
  preferencesPersisted?: boolean;
};

export function createOnboardingServerSnapshot(
  profile: PaceUserProfileRecord,
  language: OnboardingLanguage,
  workspace: WorkspaceRecord | null = null,
  preferences: PreferencesDraft | null = null,
): OnboardingServerSnapshot {
  const currentStep =
    profile.onboardingStatus === "IN_PROGRESS" && profile.onboardingStep
      ? (profile.onboardingStep as OnboardingStep)
      : 1;
  const capabilities = getFinancialConnectionCapabilities({ country: profile.countryCode });

  return {
    currentStep,
    yourPace: {
      country: profile.countryCode ?? "",
      language,
      currency: profile.currency ?? "",
      timezone: profile.timezone ?? "",
    },
    workspace: workspace
      ? { type: workspace.type, name: workspace.name, nameManuallyEdited: true }
      : { type: "", name: "", nameManuallyEdited: false },
    together: {
      skipped: profile.onboardingSkippedSteps.includes(3),
      hasExistingInvitation: Boolean(profile.onboardingInvitationId),
    },
    connect: {
      selectedMethod: reconcileConnectionMethod(profile.onboardingStartingMethod, capabilities),
      capabilities,
    },
    preferences: preferences ?? DEFAULT_ONBOARDING_PREFERENCES,
    preferencesPersisted: Boolean(preferences),
  };
}
