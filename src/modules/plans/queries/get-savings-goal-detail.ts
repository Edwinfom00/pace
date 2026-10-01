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
  const summary = await getPlansService().getSavingsGoalSummary(
    actor,
    workspaceId,
    goalId,
    now,
  );
  if (!summary) return null;
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
    history: null,
    contributions: null,
    linkedAccount: null,
    capabilities: { actionsAvailable: false },
  } as const;
}
