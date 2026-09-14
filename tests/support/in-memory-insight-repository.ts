import type { InsightCandidate } from "@/money/insights";
import type {
  InsightRecord,
  InsightStatus,
  MemberNotificationPreference,
  MemberNotificationRecord,
  NotificationRecipient,
} from "@/modules/insights/domain";
import type { PaceGoal, PaceProactivity } from "@/modules/onboarding/profile-domain";
import type {
  CreateMemberNotificationInput,
  InsightRepository,
  WorkspaceInsightSettings,
} from "@/modules/insights/repositories/insight-repository";

export class InMemoryInsightRepository implements InsightRepository {
  readonly settings = new Map<string, WorkspaceInsightSettings>();
  readonly records = new Map<string, InsightRecord>();
  readonly preferences = new Map<string, MemberNotificationPreference>();
  readonly recipients = new Map<string, NotificationRecipient[]>();
  readonly notifications = new Map<string, MemberNotificationRecord>();

  async listWorkspaceIds(): Promise<string[]> {
    return [...this.settings.keys()].sort();
  }

  async findWorkspaceSettings(workspaceId: string): Promise<WorkspaceInsightSettings | null> {
    return this.settings.get(workspaceId) ?? null;
  }

  async findInsight(workspaceId: string, insightId: string): Promise<InsightRecord | null> {
    const record = this.records.get(insightId);
    return record?.workspaceId === workspaceId ? record : null;
  }

  async findInsightByFingerprint(workspaceId: string, fingerprint: string): Promise<InsightRecord | null> {
    return [...this.records.values()].find(
      (record) => record.workspaceId === workspaceId && record.fingerprint === fingerprint,
    ) ?? null;
  }

  async listInsights(workspaceId: string, statuses?: readonly InsightStatus[]): Promise<InsightRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.workspaceId === workspaceId && (!statuses || statuses.includes(record.status)))
      .sort((left, right) => right.lastDetectedAt.getTime() - left.lastDetectedAt.getTime());
  }

  async createInsight(
    workspaceId: string,
    id: string,
    candidate: InsightCandidate,
    now: Date,
  ): Promise<InsightRecord> {
    const record: InsightRecord = {
      id,
      workspaceId,
      type: candidate.type,
      severity: candidate.severity,
      data: { ...candidate.data },
      periodStart: candidate.period.start,
      periodEnd: candidate.period.end,
      source: candidate.source,
      fingerprint: candidate.fingerprint,
      expiresAt: candidate.expiresAt,
      status: "ACTIVE",
      readAt: null,
      dismissedAt: null,
      resolvedAt: null,
      lastDetectedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(id, record);
    return record;
  }

  async updateInsightFromCandidate(
    existing: InsightRecord,
    candidate: InsightCandidate,
    now: Date,
  ): Promise<InsightRecord> {
    const status = existing.status === "RESOLVED" ? "ACTIVE" : existing.status;
    const record: InsightRecord = {
      ...existing,
      type: candidate.type,
      severity: candidate.severity,
      data: { ...candidate.data },
      periodStart: candidate.period.start,
      periodEnd: candidate.period.end,
      expiresAt: candidate.expiresAt,
      status,
      resolvedAt: status === "ACTIVE" ? null : existing.resolvedAt,
      lastDetectedAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
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
    const record: InsightRecord = {
      ...current,
      status: to,
      readAt: to === "READ" ? now : current.readAt,
      dismissedAt: to === "DISMISSED" ? now : current.dismissedAt,
      resolvedAt: to === "RESOLVED" ? now : current.resolvedAt,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    return record;
  }

  async findPreference(workspaceId: string, userId: string): Promise<MemberNotificationPreference | null> {
    return this.preferences.get(this.memberKey(workspaceId, userId)) ?? null;
  }

  async upsertPreference(
    workspaceId: string,
    userId: string,
    input: Pick<MemberNotificationPreference, "dailyEnabled" | "weeklyEnabled" | "monthlyEnabled" | "minimumSeverity">,
  ): Promise<MemberNotificationPreference> {
    const current = await this.findPreference(workspaceId, userId);
    const now = new Date();
    const record: MemberNotificationPreference = {
      workspaceId,
      userId,
      paceGoals: current?.paceGoals ?? [],
      proactivity: current?.proactivity ?? "BALANCED",
      ...input,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    this.preferences.set(this.memberKey(workspaceId, userId), record);
    this.recipients.set(
      workspaceId,
      (this.recipients.get(workspaceId) ?? []).map((recipient) =>
        recipient.userId === userId ? { ...recipient, ...record } : recipient,
      ),
    );
    return record;
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
      minimumSeverity: MemberNotificationPreference["minimumSeverity"];
    },
  ): Promise<MemberNotificationPreference> {
    const current = await this.findPreference(workspaceId, userId);
    const now = new Date();
    const record: MemberNotificationPreference = {
      workspaceId,
      userId,
      paceGoals: [...input.goals],
      proactivity: input.proactivity,
      dailyEnabled: input.dailyEnabled,
      weeklyEnabled: input.weeklyEnabled,
      monthlyEnabled: input.monthlyEnabled,
      minimumSeverity: input.minimumSeverity,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    this.preferences.set(this.memberKey(workspaceId, userId), record);
    this.recipients.set(
      workspaceId,
      (this.recipients.get(workspaceId) ?? []).map((recipient) =>
        recipient.userId === userId ? { ...recipient, ...record } : recipient,
      ),
    );
    return record;
  }

  async listRecipients(workspaceId: string): Promise<NotificationRecipient[]> {
    return this.recipients.get(workspaceId) ?? [];
  }

  async createNotification(input: CreateMemberNotificationInput): Promise<MemberNotificationRecord | null> {
    const exists = [...this.notifications.values()].some(
      (record) =>
        record.workspaceId === input.workspaceId &&
        record.userId === input.userId &&
        record.fingerprint === input.fingerprint,
    );
    if (exists) return null;
    const record: MemberNotificationRecord = { ...input, status: "UNREAD", readAt: null, createdAt: new Date() };
    this.notifications.set(record.id, record);
    return record;
  }

  async listNotifications(workspaceId: string, userId: string): Promise<MemberNotificationRecord[]> {
    return [...this.notifications.values()].filter(
      (record) => record.workspaceId === workspaceId && record.userId === userId,
    );
  }

  async markNotificationRead(
    workspaceId: string,
    userId: string,
    notificationId: string,
    now: Date,
  ): Promise<MemberNotificationRecord | null> {
    const current = this.notifications.get(notificationId);
    if (!current || current.workspaceId !== workspaceId || current.userId !== userId) return null;
    const record: MemberNotificationRecord = { ...current, status: "READ", readAt: now };
    this.notifications.set(record.id, record);
    return record;
  }

  setRecipients(workspaceId: string, recipients: NotificationRecipient[]): void {
    this.recipients.set(workspaceId, recipients);
  }

  private memberKey(workspaceId: string, userId: string): string {
    return `${workspaceId}:${userId}`;
  }
}
