import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { paceUserProfiles, users } from "@/db/schema";

import type { PaceUserProfileRecord, ValidatedYourPace } from "../profile-domain";

export interface PaceUserProfileRepository {
  getOrCreate(userId: string): Promise<PaceUserProfileRecord>;
  saveYourPaceStep(userId: string, input: ValidatedYourPace): Promise<PaceUserProfileRecord>;
}

/**
 * The profile is intentionally created when Pace needs product state, rather
 * than through a Better Auth hook. This keeps the two ownership boundaries
 * explicit and supports existing Better Auth accounts.
 */
export class DatabasePaceUserProfileRepository implements PaceUserProfileRepository {
  async getOrCreate(userId: string): Promise<PaceUserProfileRecord> {
    await db.insert(paceUserProfiles).values({ userId }).onConflictDoNothing();

    const [profile] = await db
      .select()
      .from(paceUserProfiles)
      .where(eq(paceUserProfiles.userId, userId))
      .limit(1);

    if (!profile) {
      throw new Error("Pace user profile could not be initialized.");
    }

    return profile;
  }

  async saveYourPaceStep(
    userId: string,
    input: ValidatedYourPace,
  ): Promise<PaceUserProfileRecord> {
    const [, , profiles] = await db.batch([
      db.insert(paceUserProfiles).values({ userId }).onConflictDoNothing(),
      db.update(users).set({ preferredLanguage: input.language }).where(eq(users.id, userId)),
      db
        .update(paceUserProfiles)
        .set({
          countryCode: input.country,
          currency: input.currency,
          timezone: input.timezone,
          onboardingStatus: "IN_PROGRESS",
          onboardingStep: 2,
          onboardingCompletedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(paceUserProfiles.userId, userId))
        .returning(),
    ]);

    const [profile] = profiles;

    if (!profile) {
      throw new Error("Pace user profile could not be updated.");
    }

    return profile;
  }
}
