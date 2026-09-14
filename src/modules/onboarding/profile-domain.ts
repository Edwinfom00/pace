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
import { WORKSPACE_TYPES, type WorkspaceType } from "../workspaces/domain";

export const ONBOARDING_STEPS = [1, 2, 3, 4, 5] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type YourPaceDraft = {
  country: string;
  language: OnboardingLanguage;
  currency: string;
  timezone: string;
};

export type WorkspaceDraft = {
  type: WorkspaceType | "";
  name: string;
  /** Kept in the browser draft so changing a card never erases a chosen name. */
  nameManuallyEdited: boolean;
};

export const ONBOARDING_INVITE_METHODS = ["email", "link"] as const;
export type OnboardingInviteMethod = (typeof ONBOARDING_INVITE_METHODS)[number];

export const WORKSPACE_NAME_SUGGESTIONS: Record<WorkspaceType, string> = {
  PERSONAL: "Personal",
  COUPLE: "House",
  FAMILY: "Family",
  CUSTOM: "My Workspace",
};

export function suggestedWorkspaceName(type: WorkspaceType): string {
  return WORKSPACE_NAME_SUGGESTIONS[type];
}

export function withSelectedWorkspaceType(draft: WorkspaceDraft, type: WorkspaceType): WorkspaceDraft {
  return {
    ...draft,
    type,
    name: draft.nameManuallyEdited ? draft.name : suggestedWorkspaceName(type),
  };
}

export const yourPaceSchema = z.object({
  country: z.string().refine(isSupportedCountry, "Select a valid country or region."),
  language: z.enum(ONBOARDING_LANGUAGES),
  currency: z.string().refine(isSupportedCurrency, "Select a valid currency."),
  timezone: z.string().refine(isSupportedTimezone, "Select a valid timezone."),
});

export type ValidatedYourPace = z.infer<typeof yourPaceSchema>;

/** The Step 2 payload contains only server-owned domain values, never a slug. */
export const workspaceStepSchema = z.object({
  type: z.enum(WORKSPACE_TYPES),
  name: z.string().trim().min(1, "Enter a workspace name.").max(120, "Workspace names can contain at most 120 characters."),
});

export type ValidatedWorkspaceStep = z.infer<typeof workspaceStepSchema>;

/** Browser input for Step 3. Workspace identity and role are server-resolved. */
export const onboardingInvitationSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("email"),
    email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  }),
  z.object({ method: z.literal("link") }),
]);

export type ValidatedOnboardingInvitation = z.infer<typeof onboardingInvitationSchema>;

/** Pace-owned, resumable product state; never an authentication claim. */
export interface PaceUserProfileRecord {
  userId: string;
  onboardingStatus: OnboardingStatus;
  onboardingStep: number | null;
  onboardingCompletedAt: Date | null;
  countryCode: string | null;
  currency: string | null;
  timezone: string | null;
  /** Server-issued idempotency key for the workspace created during Step 2. */
  onboardingWorkspaceId: string | null;
  /** Server-owned progress metadata for deliberately skipped/not-applicable steps. */
  onboardingSkippedSteps: number[];
  /** A non-secret reference; raw invitation credentials are never persisted. */
  onboardingInvitationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
