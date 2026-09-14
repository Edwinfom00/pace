import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  insights,
  memberNotificationPreferences,
  memberNotifications,
  users,
  workspaceMembers,
  workspacePreferences,
  workspaces,
} from "@/db/schema";
import type { InsightCandidate, InsightSeverity } from "@/money/insights";

import type {
  InsightRecord,
  InsightStatus,
  MemberNotificationPreference,
  MemberNotificationRecord,
  NotificationCadence,
  NotificationRecipient,
} from "../domain";
import {
  PACE_GOALS,
  PACE_PROACTIVITY,
  type PaceGoal,
  type PaceProactivity,
} from "@/modules/onboarding/profile-domain";

export interface WorkspaceInsightSettings {
  readonly workspaceId: string;
  readonly currency: string;
  readonly timezone: string;
}

export interface CreateMemberNotificationInput {
  id: string;
  workspaceId: string;
  userId: string;
  insightId: string | null;
  cadence: NotificationCadence;
  language: string;
  payload: Record<string, string | number | boolean | null>;
  fingerprint: string;
}

function toPaceGoals(goals: readonly string[] | null | undefined): PaceGoal[] {
  return (goals ?? []).filter((goal): goal is PaceGoal => PACE_GOALS.includes(goal as PaceGoal));
}

function toPaceProactivity(value: string | null | undefined): PaceProactivity {
  return PACE_PROACTIVITY.includes(value as PaceProactivity) ? value as PaceProactivity : "BALANCED";
}

function toMemberNotificationPreference(
  record: Omit<MemberNotificationPreference, "paceGoals" | "proactivity"> & { paceGoals: string[]; proactivity: string },
): MemberNotificationPreference {
  return { ...record, paceGoals: toPaceGoals(record.paceGoals), proactivity: toPaceProactivity(record.proactivity) };
}

export interface InsightRepository {
  listWorkspaceIds(): Promise<string[]>;
  findWorkspaceSettings(workspaceId: string): Promise<WorkspaceInsightSettings | null>;
  findInsight(workspaceId: string, insightId: string): Promise<InsightRecord | null>;
  findInsightByFingerprint(workspaceId: string, fingerprint: string): Promise<InsightRecord | null>;
  listInsights(workspaceId: string, statuses?: readonly InsightStatus[]): Promise<InsightRecord[]>;
  createInsight(workspaceId: string, id: string, candidate: InsightCandidate, now: Date): Promise<InsightRecord>;
  updateInsightFromCandidate(
    existing: InsightRecord,
    candidate: InsightCandidate,
    now: Date,
  ): Promise<InsightRecord>;
  transitionInsight(
    workspaceId: string,
    insightId: string,
    from: readonly InsightStatus[],
    to: InsightStatus,
    now: Date,
  ): Promise<InsightRecord | null>;
  findPreference(workspaceId: string, userId: string): Promise<MemberNotificationPreference | null>;
  upsertPreference(
    workspaceId: string,
    userId: string,
    input: Pick<
      MemberNotificationPreference,
      "dailyEnabled" | "weeklyEnabled" | "monthlyEnabled" | "minimumSeverity"
    >,
  ): Promise<MemberNotificationPreference>;
  saveOnboardingPreference(
    workspaceId: string,
    userId: string,
    input: {
      goals: readonly PaceGoal[];
      proactivity: PaceProactivity;
      dailyEnabled: boolean;
      weeklyEnabled: boolean;
      monthlyEnabled: boolean;
      minimumSeverity: InsightSeverity;
    },
  ): Promise<MemberNotificationPreference>;
  listRecipients(workspaceId: string): Promise<NotificationRecipient[]>;
  createNotification(input: CreateMemberNotificationInput): Promise<MemberNotificationRecord | null>;
  listNotifications(workspaceId: string, userId: string): Promise<MemberNotificationRecord[]>;
  markNotificationRead(
    workspaceId: string,
    userId: string,
    notificationId: string,
    now: Date,
  ): Promise<MemberNotificationRecord | null>;
}

export class DatabaseInsightRepository implements InsightRepository {
  async listWorkspaceIds(): Promise<string[]> {
    const records = await db.select({ id: workspaces.id }).from(workspaces).orderBy(asc(workspaces.id));
    return records.map((record) => record.id);
  }

  async findWorkspaceSettings(workspaceId: string): Promise<WorkspaceInsightSettings | null> {
    const [record] = await db
      .select({ workspaceId: workspaces.id, currency: workspacePreferences.currency, timezone: workspacePreferences.timezone })
      .from(workspaces)
      .innerJoin(workspacePreferences, eq(workspacePreferences.workspaceId, workspaces.id))
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return record ?? null;
  }

  async findInsight(workspaceId: string, insightId: string): Promise<InsightRecord | null> {
    const [record] = await db
      .select()
      .from(insights)
      .where(and(eq(insights.workspaceId, workspaceId), eq(insights.id, insightId)))
      .limit(1);
    return record ?? null;
  }

  async findInsightByFingerprint(workspaceId: string, fingerprint: string): Promise<InsightRecord | null> {
    const [record] = await db
      .select()
      .from(insights)
      .where(and(eq(insights.workspaceId, workspaceId), eq(insights.fingerprint, fingerprint)))
      .limit(1);
    return record ?? null;
  }

  async listInsights(workspaceId: string, statuses?: readonly InsightStatus[]): Promise<InsightRecord[]> {
    const records = await db
      .select()
      .from(insights)
      .where(eq(insights.workspaceId, workspaceId))
      .orderBy(desc(insights.lastDetectedAt), desc(insights.createdAt));
    return statuses ? records.filter((record) => statuses.includes(record.status)) : records;
  }

  async createInsight(
    workspaceId: string,
    id: string,
    candidate: InsightCandidate,
    now: Date,
  ): Promise<InsightRecord> {
    const [record] = await db
      .insert(insights)
      .values({
        id,
        workspaceId,
        type: candidate.type,
        severity: candidate.severity,
        data: { ...candidate.data },
        periodStart: candidate.period.start,
        periodEnd: candidate.period.end,
        status: "ACTIVE",
        source: candidate.source,
        fingerprint: candidate.fingerprint,
        expiresAt: candidate.expiresAt,
        lastDetectedAt: now,
      })
      .onConflictDoNothing({ target: [insights.workspaceId, insights.fingerprint] })
      .returning();
    if (record) return record;
    const concurrent = await this.findInsightByFingerprint(workspaceId, candidate.fingerprint);
    if (concurrent) return concurrent;
    throw new Error("Failed to create an insight.");
  }

  async updateInsightFromCandidate(
    existing: InsightRecord,
    candidate: InsightCandidate,
    now: Date,
  ): Promise<InsightRecord> {
    // A dismissed insight remains dismissed; a resolved condition is reactivated
    // only if the exact deterministic fingerprint appears again.
    const status: InsightStatus = existing.status === "RESOLVED" ? "ACTIVE" : existing.status;
    const [record] = await db
      .update(insights)
      .set({
        type: candidate.type,
        severity: candidate.severity,
        data: { ...candidate.data },
        periodStart: candidate.period.start,
        periodEnd: candidate.period.end,
        status,
        expiresAt: candidate.expiresAt,
        resolvedAt: status === "ACTIVE" ? null : existing.resolvedAt,
        lastDetectedAt: now,
        updatedAt: now,
      })
      .where(and(eq(insights.workspaceId, existing.workspaceId), eq(insights.id, existing.id)))
      .returning();
    if (!record) throw new Error("Insight disappeared while it was being updated.");
    return record;
  }

  async transitionInsight(
    workspaceId: string,
    insightId: string,
    from: readonly InsightStatus[],
    to: InsightStatus,
    now: Date,
  ): Promise<InsightRecord | null> {
    const current = await this.findInsight(workspaceId, insightId);
    if (!current || !from.includes(current.status)) return null;
    const [record] = await db
      .update(insights)
      .set({
        status: to,
        readAt: to === "READ" ? now : current.readAt,
        dismissedAt: to === "DISMISSED" ? now : current.dismissedAt,
        resolvedAt: to === "RESOLVED" ? now : current.resolvedAt,
        updatedAt: now,
      })
      .where(and(eq(insights.workspaceId, workspaceId), eq(insights.id, insightId), eq(insights.status, current.status)))
      .returning();
    return record ?? null;
  }

  async findPreference(workspaceId: string, userId: string): Promise<MemberNotificationPreference | null> {
    const [record] = await db
      .select()
      .from(memberNotificationPreferences)
      .where(
        and(
          eq(memberNotificationPreferences.workspaceId, workspaceId),
          eq(memberNotificationPreferences.userId, userId),
        ),
      )
      .limit(1);
    return record ? toMemberNotificationPreference(record) : null;
  }

  async upsertPreference(
    workspaceId: string,
    userId: string,
    input: Pick<
      MemberNotificationPreference,
      "dailyEnabled" | "weeklyEnabled" | "monthlyEnabled" | "minimumSeverity"
    >,
  ): Promise<MemberNotificationPreference> {
    const [record] = await db
      .insert(memberNotificationPreferences)
      .values({ workspaceId, userId, ...input })
      .onConflictDoUpdate({
        target: [memberNotificationPreferences.workspaceId, memberNotificationPreferences.userId],
        set: { ...input, updatedAt: new Date() },
      })
      .returning();
    if (!record) throw new Error("Failed to save notification preferences.");
    return toMemberNotificationPreference(record);
  }

  async saveOnboardingPreference(
    workspaceId: string,
    userId: string,
    input: {
      goals: readonly PaceGoal[];
      proactivity: PaceProactivity;
      dailyEnabled: boolean;
      weeklyEnabled: boolean;
      monthlyEnabled: boolean;
      minimumSeverity: InsightSeverity;
    },
  ): Promise<MemberNotificationPreference> {
    const [record] = await db
      .insert(memberNotificationPreferences)
      .values({
        workspaceId,
        userId,
        paceGoals: [...input.goals],
        proactivity: input.proactivity,
        dailyEnabled: input.dailyEnabled,
        weeklyEnabled: input.weeklyEnabled,
        monthlyEnabled: input.monthlyEnabled,
        minimumSeverity: input.minimumSeverity,
      })
      .onConflictDoUpdate({
        target: [memberNotificationPreferences.workspaceId, memberNotificationPreferences.userId],
        set: {
          paceGoals: [...input.goals],
          proactivity: input.proactivity,
          dailyEnabled: input.dailyEnabled,
          weeklyEnabled: input.weeklyEnabled,
          monthlyEnabled: input.monthlyEnabled,
          minimumSeverity: input.minimumSeverity,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!record) throw new Error("Failed to save onboarding preferences.");
    return toMemberNotificationPreference(record);
  }

  async listRecipients(workspaceId: string): Promise<NotificationRecipient[]> {
    const records = await db
      .select({ member: workspaceMembers, user: users, preference: memberNotificationPreferences })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .leftJoin(
        memberNotificationPreferences,
        and(
          eq(memberNotificationPreferences.workspaceId, workspaceMembers.workspaceId),
          eq(memberNotificationPreferences.userId, workspaceMembers.userId),
        ),
      )
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    const now = new Date();
    return records.map(({ member, user, preference }) => ({
      workspaceId: member.workspaceId,
      userId: member.userId,
      language: user.preferredLanguage,
      dailyEnabled: preference?.dailyEnabled ?? true,
      weeklyEnabled: preference?.weeklyEnabled ?? true,
      monthlyEnabled: preference?.monthlyEnabled ?? true,
      minimumSeverity: (preference?.minimumSeverity ?? "INFO") as InsightSeverity,
      paceGoals: toPaceGoals(preference?.paceGoals),
      proactivity: toPaceProactivity(preference?.proactivity),
      createdAt: preference?.createdAt ?? now,
      updatedAt: preference?.updatedAt ?? now,
    }));
  }

  async createNotification(input: CreateMemberNotificationInput): Promise<MemberNotificationRecord | null> {
    const [record] = await db
      .insert(memberNotifications)
      .values(input)
      .onConflictDoNothing({
        target: [memberNotifications.workspaceId, memberNotifications.userId, memberNotifications.fingerprint],
      })
      .returning();
    return record ?? null;
  }

  async listNotifications(workspaceId: string, userId: string): Promise<MemberNotificationRecord[]> {
    return db
      .select()
      .from(memberNotifications)
      .where(and(eq(memberNotifications.workspaceId, workspaceId), eq(memberNotifications.userId, userId)))
      .orderBy(desc(memberNotifications.createdAt));
  }

  async markNotificationRead(
    workspaceId: string,
    userId: string,
    notificationId: string,
    now: Date,
  ): Promise<MemberNotificationRecord | null> {
    const [record] = await db
      .update(memberNotifications)
      .set({ status: "READ", readAt: now })
      .where(
        and(
          eq(memberNotifications.workspaceId, workspaceId),
          eq(memberNotifications.userId, userId),
          eq(memberNotifications.id, notificationId),
        ),
      )
      .returning();
    return record ?? null;
  }
}
