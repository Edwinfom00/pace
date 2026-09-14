import type { OnboardingLanguage } from "./metadata";
import type { OnboardingStep, PaceUserProfileRecord, YourPaceDraft } from "./profile-domain";

export type OnboardingServerSnapshot = {
  currentStep: OnboardingStep;
  yourPace: YourPaceDraft;
};

export function createOnboardingServerSnapshot(
  profile: PaceUserProfileRecord,
  language: OnboardingLanguage,
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
  };
}
