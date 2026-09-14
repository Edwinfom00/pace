import type { InsightCandidate, InsightSeverity } from "@/money/insights";
import type { PaceGoal, PaceProactivity } from "@/modules/onboarding/profile-domain";

export const INSIGHT_STATUSES = ["ACTIVE", "READ", "DISMISSED", "RESOLVED"] as const;
export type InsightStatus = (typeof INSIGHT_STATUSES)[number];

export const NOTIFICATION_CADENCES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type NotificationCadence = (typeof NOTIFICATION_CADENCES)[number];

export interface InsightRecord extends Omit<InsightCandidate, "period"> {
  readonly id: string;
  readonly workspaceId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly status: InsightStatus;
  readonly readAt: Date | null;
  readonly dismissedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly lastDetectedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MemberNotificationPreference {
  readonly workspaceId: string;
  readonly userId: string;
  readonly dailyEnabled: boolean;
  readonly weeklyEnabled: boolean;
  readonly monthlyEnabled: boolean;
  readonly minimumSeverity: InsightSeverity;
  readonly paceGoals: readonly PaceGoal[];
  readonly proactivity: PaceProactivity;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NotificationRecipient extends MemberNotificationPreference {
  readonly language: string;
}

export interface MemberNotificationRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly insightId: string | null;
  readonly cadence: NotificationCadence;
  readonly language: string;
  readonly payload: Record<string, string | number | boolean | null>;
  readonly fingerprint: string;
  readonly status: "UNREAD" | "READ";
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface InsightRefreshResult {
  readonly insights: readonly InsightRecord[];
  readonly newlyActive: readonly InsightRecord[];
  readonly resolvedCount: number;
}
