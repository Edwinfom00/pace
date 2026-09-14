import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { paceUserProfiles } from "@/db/schema";

import type { PaceUserProfileRecord } from "../profile-domain";

export interface PaceUserProfileRepository {
  getOrCreate(userId: string): Promise<PaceUserProfileRecord>;
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
}
