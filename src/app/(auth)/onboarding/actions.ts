"use server";

import { requireAuthenticatedActor } from "@/authorization/session";
import { DomainConflictError } from "@/authorization/errors";
import {
  createOnboardingInvitation,
  persistTogetherStep,
  persistWorkspaceStep,
  persistYourPaceStep,
} from "@/modules/onboarding/server";
import {
  onboardingInvitationSchema,
  workspaceStepSchema,
  yourPaceSchema,
  type OnboardingStep,
  type ValidatedWorkspaceStep,
  type ValidatedYourPace,
} from "@/modules/onboarding/profile-domain";

export type SubmitYourPaceResult =
  | { ok: true; data: ValidatedYourPace; currentStep: OnboardingStep }
  | { ok: false; errors: Partial<Record<keyof ValidatedYourPace, string>>; message: string };

/** The server action authenticates and re-validates; browser draft state is never trusted. */
export async function submitYourPaceStep(input: unknown): Promise<SubmitYourPaceResult> {
  const actor = await requireAuthenticatedActor();
  const parsed = yourPaceSchema.safeParse(input);

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      errors: {
        country: flattened.country?.[0],
        language: flattened.language?.[0],
        currency: flattened.currency?.[0],
        timezone: flattened.timezone?.[0],
      },
      message: "Your Pace settings need attention.",
    };
  }

  const profile = await persistYourPaceStep(actor.userId, parsed.data);

  return { ok: true, data: parsed.data, currentStep: (profile.onboardingStep ?? 2) as OnboardingStep };
}

export type SubmitWorkspaceResult =
  | { ok: true; data: ValidatedWorkspaceStep; currentStep: OnboardingStep }
  | { ok: false; errors: Partial<Record<keyof ValidatedWorkspaceStep, string>>; code: string };

/** The action resolves the actor again; browser-provided workspace ids are never accepted. */
export async function submitWorkspaceStep(input: unknown): Promise<SubmitWorkspaceResult> {
  const actor = await requireAuthenticatedActor();
  const parsed = workspaceStepSchema.safeParse(input);

  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      errors: { type: fields.type?.[0], name: fields.name?.[0] },
      code: "VALIDATION_ERROR",
    };
  }

  try {
    const persisted = await persistWorkspaceStep(actor, parsed.data);
    return {
      ok: true,
      data: persisted.data,
      currentStep: (persisted.profile.onboardingStep ?? 3) as OnboardingStep,
    };
  } catch (error) {
    return {
      ok: false,
      errors: {},
      code: error instanceof DomainConflictError ? error.code : "WORKSPACE_SAVE_FAILED",
    };
  }
}

export type CreateOnboardingInvitationResult =
  | { ok: true; inviteUrlToken: string; shortCode: string }
  | { ok: false; code: "VALIDATION_ERROR" | "ROTATION_REQUIRED" | string };

/** No workspace ID, role, raw token, or persistence key is ever accepted from the browser. */
export async function submitOnboardingInvitation(
  input: unknown,
  options: { rotate?: boolean } = {},
): Promise<CreateOnboardingInvitationResult> {
  const actor = await requireAuthenticatedActor();
  const parsed = onboardingInvitationSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR" };
  }

  try {
    const result = await createOnboardingInvitation(actor, parsed.data, undefined, undefined, undefined, options.rotate);
    return result.kind === "created"
      ? { ok: true, inviteUrlToken: result.inviteUrlToken, shortCode: result.shortCode }
      : { ok: false, code: "ROTATION_REQUIRED" };
  } catch (error) {
    return { ok: false, code: error instanceof DomainConflictError ? error.code : "INVITATION_CREATE_FAILED" };
  }
}

export type CompleteTogetherResult =
  | { ok: true; currentStep: OnboardingStep; skipped: boolean }
  | { ok: false; code: string };

export async function completeTogetherOnboarding(): Promise<CompleteTogetherResult> {
  const actor = await requireAuthenticatedActor();

  try {
    const profile = await persistTogetherStep(actor);
    return {
      ok: true,
      currentStep: (profile.onboardingStep ?? 4) as OnboardingStep,
      skipped: profile.onboardingSkippedSteps.includes(3),
    };
  } catch (error) {
    return { ok: false, code: error instanceof DomainConflictError ? error.code : "TOGETHER_SAVE_FAILED" };
  }
}
