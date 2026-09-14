export const ONBOARDING_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

import { z } from "zod";

import {
  ONBOARDING_LANGUAGES,
  isSupportedCurrency,
  isSupportedCountry,
  isSupportedTimezone,
  type OnboardingLanguage,
} from "./metadata";

export const ONBOARDING_STEPS = [1, 2, 3, 4, 5] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type YourPaceDraft = {
  country: string;
  language: OnboardingLanguage;
  currency: string;
  timezone: string;
};

export const yourPaceSchema = z.object({
  country: z.string().refine(isSupportedCountry, "Select a valid country or region."),
  language: z.enum(ONBOARDING_LANGUAGES),
  currency: z.string().refine(isSupportedCurrency, "Select a valid currency."),
  timezone: z.string().refine(isSupportedTimezone, "Select a valid timezone."),
});

export type ValidatedYourPace = z.infer<typeof yourPaceSchema>;

/** Pace-owned, resumable product state; never an authentication claim. */
export interface PaceUserProfileRecord {
  userId: string;
  onboardingStatus: OnboardingStatus;
  onboardingStep: number | null;
  onboardingCompletedAt: Date | null;
  countryCode: string | null;
  currency: string | null;
  timezone: string | null;
  createdAt: Date;
  updatedAt: Date;
}
