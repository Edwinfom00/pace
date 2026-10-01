import "server-only";

import type { AuthenticatedActor } from "@/authorization/session";

import { getPlansService } from "../server";


export async function getSavingsGoalDetail({
  actor,
  workspaceId,
  goalId,
  now,
}: {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly goalId: string;
  readonly now: Date;
}) {
  const service = getPlansService();
  const summary = await service.getSavingsGoalSummary(
    actor,
    workspaceId,
    goalId,
    now,
  );
  if (!summary) return null;
  const contributions = await service.listSavingsGoalContributions(actor, workspaceId, goalId);
  return {
    goal: summary.goal,
    metrics: {
      targetAmountMinor: summary.goal.targetAmountMinor,
      savedAmountMinor: summary.goal.currentSavedMinor,
      remainingMinor: summary.remainingMinor,
      progressBps: summary.progressBps,
    },
    progress: { completed: summary.completed },
    targetDate: summary.goal.targetDate
      ? {
          date: summary.goal.targetDate,
          daysRemaining: summary.targetDateDaysRemaining!,
          requiredDailyMinor: summary.requiredDailyMinor,
        }
      : null,
    history: contributions,
    contributions: {
      items: contributions,
      latest: contributions.at(-1) ?? null,
    },
    linkedAccount: null,
    capabilities: {
      ...summary.capabilities,
      actionsAvailable:
        summary.capabilities.canEdit ||
        summary.capabilities.canArchive ||
        summary.capabilities.canComplete ||
        summary.capabilities.canReopen,
    },
  } as const;
}
