import type { OnboardingLanguage } from "./metadata";
import type { WorkspaceRecord } from "../workspaces/domain";
import type { OnboardingStep, PaceUserProfileRecord, WorkspaceDraft, YourPaceDraft } from "./profile-domain";

export type OnboardingServerSnapshot = {
  currentStep: OnboardingStep;
  yourPace: YourPaceDraft;
  workspace: WorkspaceDraft;
};

export function createOnboardingServerSnapshot(
  profile: PaceUserProfileRecord,
  language: OnboardingLanguage,
  workspace: WorkspaceRecord | null = null,
): OnboardingServerSnapshot {
  const currentStep =
    profile.onboardingStatus === "IN_PROGRESS" && profile.onboardingStep
      ? (profile.onboardingStep as OnboardingStep)
      : 1;

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
  };
}
