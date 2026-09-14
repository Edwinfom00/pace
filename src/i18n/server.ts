import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { isSupportedOnboardingLanguage, type OnboardingLanguage } from "@/modules/onboarding/metadata";

import { toSupportedLanguage, type SupportedLanguage } from "./messages";

export async function getPersistedUserLanguage(userId: string): Promise<SupportedLanguage> {
  const [user] = await db
    .select({ preferredLanguage: users.preferredLanguage })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return toSupportedLanguage(user?.preferredLanguage);
}

export async function setPersistedUserLanguage(
  userId: string,
  language: SupportedLanguage,
): Promise<SupportedLanguage> {
  const [user] = await db
    .update(users)
    .set({ preferredLanguage: language })
    .where(eq(users.id, userId))
    .returning({ preferredLanguage: users.preferredLanguage });
  return toSupportedLanguage(user?.preferredLanguage);
}

/**
 * Onboarding supports German before the broader product catalogue does. Keep
 * this narrow accessor so that a saved `de` preference is never downgraded to
 * English while the user is completing the multilingual onboarding flow.
 */
export async function getPersistedOnboardingLanguage(
  userId: string,
): Promise<OnboardingLanguage> {
  const [user] = await db
    .select({ preferredLanguage: users.preferredLanguage })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const language = user?.preferredLanguage ?? "";
  return isSupportedOnboardingLanguage(language) ? language : "en";
}
