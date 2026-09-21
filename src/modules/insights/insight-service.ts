import { createHash, randomUUID } from "node:crypto";

import { AuthorizationError, NotFoundError } from "@/authorization/errors";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { AuthenticatedActor } from "@/authorization/session";
import { deriveInsightCandidates, type InsightSeverity } from "@/money/insights";
import { calendarMonthPeriod } from "@/money/period";
import type { FinancialInboxRepository } from "@/modules/financial-inbox/repositories/financial-inbox-repository";
import { isUserFacingLedgerTransaction } from "@/modules/ledger/domain";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { PlansRepository } from "@/modules/plans/repositories/plans-repository";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type {
  InsightRecord,
  InsightRefreshResult,
  MemberNotificationPreference,
  MemberNotificationRecord,
  NotificationCadence,
} from "./domain";
import type { InsightRepository } from "./repositories/insight-repository";

const SEVERITY_RANK: Readonly<Record<InsightSeverity, number>> = {
  INFO: 0,
  WARNING: 1,
  CRITICAL: 2,
};


export class InsightService {
  constructor(
    private readonly insights: InsightRepository,
    private readonly ledger: Pick<LedgerRepository, "listTransactions" | "listMerchants">,
    private readonly plans: Pick<PlansRepository, "listBudgets" | "listSavingsGoals">,
    private readonly inbox: Pick<FinancialInboxRepository, "listRecurringPayments">,
    private readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">,
  ) {}

  async listInsights(actor: AuthenticatedActor, workspaceId: string): Promise<InsightRecord[]> {
    await this.requireReadContext(actor, workspaceId);
    return this.insights.listInsights(workspaceId);
  }

  async refreshForMember(
    actor: AuthenticatedActor,
    workspaceId: string,
    now = new Date(),
  ): Promise<InsightRefreshResult> {
    await this.requireReadContext(actor, workspaceId);
    return this.refreshWorkspace(workspaceId, now);
  }

  async markRead(actor: AuthenticatedActor, workspaceId: string, insightId: string): Promise<InsightRecord> {
    await this.requireReadContext(actor, workspaceId);
    const updated = await this.insights.transitionInsight(
      workspaceId,
      insightId,
      ["ACTIVE"],
      "READ",
      new Date(),
    );
    if (!updated) throw new NotFoundError("Active insight not found in this workspace.");
    return updated;
  }

  async dismiss(actor: AuthenticatedActor, workspaceId: string, insightId: string): Promise<InsightRecord> {
    await this.requireReadContext(actor, workspaceId);
    const updated = await this.insights.transitionInsight(
      workspaceId,
      insightId,
      ["ACTIVE", "READ"],
      "DISMISSED",
      new Date(),
    );
    if (!updated) throw new NotFoundError("Dismissible insight not found in this workspace.");
    return updated;
  }

  async getNotificationPreference(
    actor: AuthenticatedActor,
    workspaceId: string,
  ): Promise<MemberNotificationPreference> {
    await this.requireReadContext(actor, workspaceId);
    return (await this.insights.findPreference(workspaceId, actor.userId)) ?? defaultPreference(workspaceId, actor.userId);
  }

  async updateNotificationPreference(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: Pick<
      MemberNotificationPreference,
      "dailyEnabled" | "weeklyEnabled" | "monthlyEnabled" | "minimumSeverity"
    >,
  ): Promise<MemberNotificationPreference> {
    await this.requireReadContext(actor, workspaceId);
    return this.insights.upsertPreference(workspaceId, actor.userId, input);
  }

  async listNotifications(
    actor: AuthenticatedActor,
    workspaceId: string,
  ): Promise<MemberNotificationRecord[]> {
    await this.requireReadContext(actor, workspaceId);
    return this.insights.listNotifications(workspaceId, actor.userId);
  }

  async markNotificationRead(
    actor: AuthenticatedActor,
    workspaceId: string,
    notificationId: string,
  ): Promise<MemberNotificationRecord> {
    await this.requireReadContext(actor, workspaceId);
    const updated = await this.insights.markNotificationRead(
      workspaceId,
      actor.userId,
      notificationId,
      new Date(),
    );
    if (!updated) throw new NotFoundError("Notification not found in this workspace.");
    return updated;
  }

  /** Trusted scheduler entry point. No member identity or model input is accepted. */
  async runProactiveReview(cadence: NotificationCadence, now = new Date()): Promise<{
    workspaceCount: number;
    notificationCount: number;
  }> {
    const workspaceIds = await this.insights.listWorkspaceIds();
    let notificationCount = 0;
    for (const workspaceId of workspaceIds) {
      const settings = await this.insights.findWorkspaceSettings(workspaceId);
      if (!settings) continue;
      // A monthly close describes the whole local calendar month that just ended,
      // not the first few hours of the new month.
      const effectiveNow = cadence === "MONTHLY"
        ? new Date(calendarMonthPeriod(now, settings.timezone).start.getTime() - 1)
        : now;
      const result = await this.refreshWorkspace(workspaceId, effectiveNow);
      notificationCount += await this.createRelevantNotifications(workspaceId, cadence, result.insights);
    }
    return { workspaceCount: workspaceIds.length, notificationCount };
  }

  /** Trusted, deterministic refresh used by schedules and guarded HTTP reads. */
  async refreshWorkspace(workspaceId: string, now = new Date()): Promise<InsightRefreshResult> {
    const settings = await this.insights.findWorkspaceSettings(workspaceId);
    if (!settings) throw new NotFoundError("Workspace preferences not found.");
    const [transactions, merchants, budgets, goals, recurringPayments, existing] = await Promise.all([
      this.ledger.listTransactions(workspaceId),
      this.ledger.listMerchants(workspaceId),
      this.plans.listBudgets(workspaceId),
      this.plans.listSavingsGoals(workspaceId),
      this.inbox.listRecurringPayments(workspaceId),
      this.insights.listInsights(workspaceId),
    ]);
    const merchantNames = Object.fromEntries(merchants.map((merchant) => [merchant.id, merchant.name]));
    const candidates = deriveInsightCandidates({
      currency: settings.currency,
      timeZone: settings.timezone,
      now,
      transactions: transactions.filter(isUserFacingLedgerTransaction),
      budgets,
      goals,
      recurringPayments,
      merchantNames,
    });
    const byFingerprint = new Map(existing.map((insight) => [insight.fingerprint, insight]));
    const detected = new Set(candidates.map((candidate) => candidate.fingerprint));
    const persisted: InsightRecord[] = [];
    const newlyActive: InsightRecord[] = [];

    for (const candidate of candidates) {
      const prior = byFingerprint.get(candidate.fingerprint);
      const record = prior
        ? await this.insights.updateInsightFromCandidate(prior, candidate, now)
        : await this.insights.createInsight(workspaceId, randomUUID(), candidate, now);
      persisted.push(record);
      if (!prior || prior.status === "RESOLVED") newlyActive.push(record);
    }

    let resolvedCount = 0;
    for (const prior of existing) {
      if (!detected.has(prior.fingerprint) && (prior.status === "ACTIVE" || prior.status === "READ")) {
        const resolved = await this.insights.transitionInsight(
          workspaceId,
          prior.id,
          [prior.status],
          "RESOLVED",
          now,
        );
        if (resolved) resolvedCount += 1;
      }
    }

    return { insights: persisted, newlyActive, resolvedCount };
  }

  private async createRelevantNotifications(
    workspaceId: string,
    cadence: NotificationCadence,
    insights: readonly InsightRecord[],
  ): Promise<number> {
    const recipients = await this.insights.listRecipients(workspaceId);
    let created = 0;
    for (const recipient of recipients) {
      for (const insight of insights.filter((candidate) => shouldNotify(recipient, cadence, candidate))) {
        const notification = await this.insights.createNotification({
          id: randomUUID(),
          workspaceId,
          userId: recipient.userId,
          insightId: insight.id,
          cadence,
          language: recipient.language,
          payload: {
            insightId: insight.id,
            insightType: insight.type,
            severity: insight.severity,
            translationKey: `insights.type.${insight.type}`,
            periodStart: insight.periodStart.toISOString(),
            periodEnd: insight.periodEnd.toISOString(),
          },
          fingerprint: notificationFingerprint(cadence, insight.fingerprint),
        });
        if (notification) created += 1;
      }
    }
    return created;
  }

  private async requireReadContext(actor: AuthenticatedActor, workspaceId: string): Promise<void> {
    const context = await this.workspaces.findMemberContext(workspaceId, actor.userId);
    if (!context) throw new AuthorizationError("You are not a member of this workspace.");
    assertWorkspacePermission(context.membership.role, "read");
  }
}

function defaultPreference(workspaceId: string, userId: string): MemberNotificationPreference {
  const now = new Date();
  return {
    workspaceId,
    userId,
    dailyEnabled: true,
    weeklyEnabled: true,
    monthlyEnabled: true,
    minimumSeverity: "INFO",
    paceGoals: [],
    proactivity: "BALANCED",
    createdAt: now,
    updatedAt: now,
  };
}

function shouldNotify(
  preference: MemberNotificationPreference,
  cadence: NotificationCadence,
  insight: InsightRecord,
): boolean {
  const enabled = cadence === "DAILY"
    ? preference.dailyEnabled
    : cadence === "WEEKLY"
      ? preference.weeklyEnabled
      : preference.monthlyEnabled;
  if (!enabled || insight.status !== "ACTIVE") return false;
  if (SEVERITY_RANK[insight.severity] < SEVERITY_RANK[preference.minimumSeverity]) return false;
  // Daily delivery deliberately stays high-signal. Summaries can include INFO facts.
  return preference.proactivity === "PROACTIVE" || cadence !== "DAILY" ||
    insight.severity !== "INFO" ||
    insight.type === "NEW_RECURRING_PAYMENT" ||
    insight.type === "UNUSUAL_TRANSACTION";
}

function notificationFingerprint(cadence: NotificationCadence, insightFingerprint: string): string {
  return createHash("sha256").update(`pace-notification-v1|${cadence}|${insightFingerprint}`).digest("hex");
}
