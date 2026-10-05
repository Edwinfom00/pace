import type { AuthenticatedActor } from "@/authorization/session";
import { getInsightsRecurring } from "@/modules/insights/recurring/insights-recurring-server";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type {
  AgentRecurringListQuery,
  AgentRecurringSpendingQuery,
  AgentUpcomingRecurringQuery,
} from "../domain/agent-recurring-query";
import type { RecurringReference } from "../domain/recurring-reference";
import {
  getAgentRecurring,
  getAgentRecurringSpending,
  getAgentUpcomingRecurring,
  listAgentRecurring,
  type AgentRecurringReadDependencies,
} from "../queries/agent-recurring-reads";
import { createRecurringDetailReaders } from "../queries/get-recurring-detail";

type Scope = { readonly actor: AuthenticatedActor; readonly workspaceId: string };

async function readDependencies(scope: Scope): Promise<AgentRecurringReadDependencies> {
  return {
    readers: await createRecurringDetailReaders(scope.actor.userId),
    readAnalytics: getInsightsRecurring,
    workspaces: new DatabaseWorkspaceRepository(),
  };
}

export async function listServerAgentRecurring(scope: Scope, query: AgentRecurringListQuery) {
  return listAgentRecurring({ ...scope, query }, await readDependencies(scope));
}

export async function getServerAgentRecurring(scope: Scope, reference: RecurringReference) {
  return getAgentRecurring({ ...scope, reference }, await readDependencies(scope));
}

export async function getServerAgentRecurringSpending(scope: Scope, query: AgentRecurringSpendingQuery) {
  return getAgentRecurringSpending({ ...scope, query }, await readDependencies(scope));
}

export async function getServerAgentUpcomingRecurring(scope: Scope, query: AgentUpcomingRecurringQuery) {
  return getAgentUpcomingRecurring({ ...scope, query }, await readDependencies(scope));
}
