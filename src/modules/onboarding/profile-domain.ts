export const ONBOARDING_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

/** Pace-owned, resumable product state; never an authentication claim. */
export interface PaceUserProfileRecord {
  userId: string;
  onboardingStatus: OnboardingStatus;
  onboardingStep: number | null;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
