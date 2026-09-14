import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { paceUserProfiles, users } from "@/db/schema";

import type { OnboardingConnectionMethod, PaceUserProfileRecord, ValidatedYourPace } from "../profile-domain";

export interface PaceUserProfileRepository {
  getOrCreate(userId: string): Promise<PaceUserProfileRecord>;
  saveYourPaceStep(userId: string, input: ValidatedYourPace): Promise<PaceUserProfileRecord>;
  claimOnboardingWorkspaceId(userId: string, candidateWorkspaceId: string): Promise<PaceUserProfileRecord>;
  saveWorkspaceStep(
    userId: string,
    workspaceId: string,
    progress: { nextStep: 3 | 4; skipTogether: boolean },
  ): Promise<PaceUserProfileRecord>;
  saveTogetherStep(userId: string, skipped: boolean): Promise<PaceUserProfileRecord>;
  saveConnectStep(userId: string, method: OnboardingConnectionMethod): Promise<PaceUserProfileRecord>;
  completeOnboarding(userId: string): Promise<PaceUserProfileRecord>;
  claimOnboardingInvitationId(userId: string, candidateInvitationId: string): Promise<PaceUserProfileRecord>;
  clearOnboardingInvitationId(userId: string, invitationId: string): Promise<PaceUserProfileRecord>;
}


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
          // Reviewing Step 1 must not send a resumable Step 2/3 flow backwards.
          onboardingStep: sql<number>`greatest(coalesce(${paceUserProfiles.onboardingStep}, 1), 2)`,
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

  async claimOnboardingWorkspaceId(
    userId: string,
    candidateWorkspaceId: string,
  ): Promise<PaceUserProfileRecord> {
    await db.insert(paceUserProfiles).values({ userId }).onConflictDoNothing();

    const [profile] = await db
      .update(paceUserProfiles)
      .set({
        // This compare-and-set is the idempotency boundary: every retry gets
        // the same server-issued workspace id, including concurrent requests.
        onboardingWorkspaceId: sql<string>`coalesce(${paceUserProfiles.onboardingWorkspaceId}, ${candidateWorkspaceId})`,
        updatedAt: new Date(),
      })
      .where(eq(paceUserProfiles.userId, userId))
      .returning();

    if (!profile) {
      throw new Error("Pace user profile could not reserve a workspace.");
    }

    return profile;
  }

  async saveWorkspaceStep(
    userId: string,
    workspaceId: string,
    progress: { nextStep: 3 | 4; skipTogether: boolean },
  ): Promise<PaceUserProfileRecord> {
    const [profile] = await db
      .update(paceUserProfiles)
      .set({
        onboardingWorkspaceId: workspaceId,
        onboardingStatus: "IN_PROGRESS",
        // Switching a workspace from PERSONAL back to shared reopens Step 3.
        onboardingStep: progress.nextStep,
        onboardingSkippedSteps: progress.skipTogether
          ? sql<number[]>`array_append(array_remove(coalesce(${paceUserProfiles.onboardingSkippedSteps}, '{}'::integer[]), 3), 3)`
          : sql<number[]>`array_remove(coalesce(${paceUserProfiles.onboardingSkippedSteps}, '{}'::integer[]), 3)`,
        onboardingCompletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(paceUserProfiles.userId, userId))
      .returning();

    if (!profile) {
      throw new Error("Pace user profile could not save workspace progress.");
    }

    return profile;
  }

  async saveTogetherStep(userId: string, skipped: boolean): Promise<PaceUserProfileRecord> {
    const [profile] = await db
      .update(paceUserProfiles)
      .set({
        onboardingStatus: "IN_PROGRESS",
        onboardingStep: 4,
        onboardingSkippedSteps: skipped
          ? sql<number[]>`array_append(array_remove(coalesce(${paceUserProfiles.onboardingSkippedSteps}, '{}'::integer[]), 3), 3)`
          : sql<number[]>`array_remove(coalesce(${paceUserProfiles.onboardingSkippedSteps}, '{}'::integer[]), 3)`,
        onboardingCompletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(paceUserProfiles.userId, userId))
      .returning();

    if (!profile) {
      throw new Error("Pace user profile could not save Together progress.");
    }

    return profile;
  }

  async saveConnectStep(
    userId: string,
    method: OnboardingConnectionMethod,
  ): Promise<PaceUserProfileRecord> {
    const [profile] = await db
      .update(paceUserProfiles)
      .set({
        onboardingStartingMethod: method,
        onboardingStatus: "IN_PROGRESS",
        onboardingStep: 5,
        onboardingCompletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(paceUserProfiles.userId, userId))
      .returning();

    if (!profile) {
      throw new Error("Pace user profile could not save connection preferences.");
    }

    return profile;
  }

  async completeOnboarding(userId: string): Promise<PaceUserProfileRecord> {
    const [profile] = await db
      .update(paceUserProfiles)
      .set({
        onboardingStatus: "COMPLETED",
        onboardingStep: null,
        onboardingCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paceUserProfiles.userId, userId))
      .returning();

    if (!profile) {
      throw new Error("Pace user profile could not complete onboarding.");
    }

    return profile;
  }

  async claimOnboardingInvitationId(
    userId: string,
    candidateInvitationId: string,
  ): Promise<PaceUserProfileRecord> {
    const [profile] = await db
      .update(paceUserProfiles)
      .set({
        // A compare-and-set leaves one server-owned invitation reference even
        // when duplicate clicks arrive concurrently. It never stores a secret.
        onboardingInvitationId: sql<string>`coalesce(${paceUserProfiles.onboardingInvitationId}, ${candidateInvitationId})`,
        updatedAt: new Date(),
      })
      .where(eq(paceUserProfiles.userId, userId))
      .returning();

    if (!profile) {
      throw new Error("Pace user profile could not reserve an invitation.");
    }

    return profile;
  }

  async clearOnboardingInvitationId(
    userId: string,
    invitationId: string,
  ): Promise<PaceUserProfileRecord> {
    const [profile] = await db
      .update(paceUserProfiles)
      .set({
        onboardingInvitationId: sql<string>`case when ${paceUserProfiles.onboardingInvitationId} = ${invitationId} then null else ${paceUserProfiles.onboardingInvitationId} end`,
        updatedAt: new Date(),
      })
      .where(eq(paceUserProfiles.userId, userId))
      .returning();

    if (!profile) {
      throw new Error("Pace user profile could not rotate its invitation.");
    }

    return profile;
  }
}
