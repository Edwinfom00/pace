"use server";

import { requireAuthenticatedActor } from "@/authorization/session";
import { persistWorkspaceStep, persistYourPaceStep } from "@/modules/onboarding/server";
import {
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
  | { ok: false; errors: Partial<Record<keyof ValidatedWorkspaceStep, string>>; message: string };

/** The action resolves the actor again; browser-provided workspace ids are never accepted. */
export async function submitWorkspaceStep(input: unknown): Promise<SubmitWorkspaceResult> {
  const actor = await requireAuthenticatedActor();
  const parsed = workspaceStepSchema.safeParse(input);

  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      errors: { type: fields.type?.[0], name: fields.name?.[0] },
      message: "Workspace details need attention.",
    };
  }

  const persisted = await persistWorkspaceStep(actor, parsed.data);
  return {
    ok: true,
    data: persisted.data,
    currentStep: (persisted.profile.onboardingStep ?? 3) as OnboardingStep,
  };
}
