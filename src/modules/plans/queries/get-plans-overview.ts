import "server-only";

import type { AuthenticatedActor } from "@/authorization/session";
import { getLedgerService } from "@/modules/ledger/server";

import { getPlansService } from "../server";

export type PlansOverview = {
  readonly budgets: Awaited<ReturnType<ReturnType<typeof getPlansService>["listBudgetSummaries"]>>;
  readonly savingsGoals: Awaited<ReturnType<ReturnType<typeof getPlansService>["listSavingsGoalSummaries"]>>;
  readonly categoryNames: ReadonlyMap<string, string>;
};

export async function getPlansOverview({
  actor,
  workspaceId,
  now,
}: {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly now: Date;
}): Promise<PlansOverview> {
  const plans = getPlansService();
  const ledger = getLedgerService();
  const [budgets, savingsGoals, categories] = await Promise.all([
    plans.listBudgetSummaries(actor, workspaceId, now),
    plans.listSavingsGoalSummaries(actor, workspaceId, now),
    ledger.listCategories(actor, workspaceId),
  ]);

  return {
    budgets,
    savingsGoals,
    categoryNames: new Map(categories.map((category) => [category.id, category.name])),
  };
}
