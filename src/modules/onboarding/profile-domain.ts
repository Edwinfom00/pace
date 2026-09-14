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
import type { FinancialConnectionCapabilities } from "../financial-connections/capabilities";

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

export const ONBOARDING_CONNECTION_METHODS = [
  "MANUAL",
  "IMPORT_STATEMENT",
  "BANK_CONNECTION",
  "MOBILE_MONEY",
] as const;
export type OnboardingConnectionMethod = (typeof ONBOARDING_CONNECTION_METHODS)[number];

export type ConnectDraft = {
  selectedMethod: OnboardingConnectionMethod;
};

/** The browser may only submit stable domain values, never translated labels. */
export const connectionMethodSchema = z.enum(ONBOARDING_CONNECTION_METHODS);

export function isConnectionMethodAvailable(
  method: OnboardingConnectionMethod,
  capabilities: FinancialConnectionCapabilities,
): boolean {
  return (
    (method === "MANUAL" && capabilities.manual)
    || (method === "IMPORT_STATEMENT" && capabilities.importStatement)
    || (method === "BANK_CONNECTION" && capabilities.bankConnection)
    || (method === "MOBILE_MONEY" && capabilities.mobileMoney)
  );
}

/** Local drafts are helpful, but never allowed to outlive server capabilities. */
export function reconcileConnectionMethod(
  candidate: string | null | undefined,
  capabilities: FinancialConnectionCapabilities,
): OnboardingConnectionMethod {
  const parsed = connectionMethodSchema.safeParse(candidate);
  return parsed.success && isConnectionMethodAvailable(parsed.data, capabilities) ? parsed.data : "MANUAL";
}

/** Pace-owned, resumable product state; never an authentication claim. */
export interface PaceUserProfileRecord {
  userId: string;
  onboardingStatus: OnboardingStatus;
  onboardingStep: number | null;
  onboardingCompletedAt: Date | null;
  countryCode: string | null;
  currency: string | null;
  timezone: string | null;
  onboardingWorkspaceId: string | null;
  onboardingSkippedSteps: number[];
  onboardingInvitationId: string | null;
  onboardingStartingMethod: OnboardingConnectionMethod | null;
  createdAt: Date;
  updatedAt: Date;
}
