"use server";

import { requireAuthenticatedActor } from "@/authorization/session";
import { persistYourPaceStep } from "@/modules/onboarding/server";
import { yourPaceSchema, type ValidatedYourPace } from "@/modules/onboarding/profile-domain";

export type SubmitYourPaceResult =
  | { ok: true; data: ValidatedYourPace; currentStep: 2 }
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

  await persistYourPaceStep(actor.userId, parsed.data);

  return { ok: true, data: parsed.data, currentStep: 2 };
}
