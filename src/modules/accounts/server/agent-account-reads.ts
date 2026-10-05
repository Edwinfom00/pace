import type { AuthenticatedActor } from "@/authorization/session";
import { getLedgerService, getLocalizedLedgerRepository } from "@/modules/ledger/server";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { AccountReference } from "../domain/account-reference";
import type {
  AgentAccountComparisonQuery,
  AgentAccountMovementsQuery,
  AgentAccountSpendabilityQuery,
} from "../domain/agent-account-query";
import {
  checkAgentAccountSpendability,
  compareAgentAccountMovements,
  getAgentAccount,
  getAgentAccountMovements,
  type AgentAccountReadDependencies,
} from "../queries/agent-account-reads";

type Scope = { readonly actor: AuthenticatedActor; readonly workspaceId: string };

async function readDependencies(scope: Scope): Promise<AgentAccountReadDependencies> {
  return {
    ledger: getLedgerService(),
    records: await getLocalizedLedgerRepository(scope.actor.userId),
    workspaces: new DatabaseWorkspaceRepository(),
  };
}

export async function getServerAgentAccount(scope: Scope, reference: AccountReference) {
  return getAgentAccount({ ...scope, reference }, await readDependencies(scope));
}

export async function getServerAgentAccountMovements(scope: Scope, query: AgentAccountMovementsQuery) {
  return getAgentAccountMovements({ ...scope, query }, await readDependencies(scope));
}

export async function compareServerAgentAccountMovements(scope: Scope, query: AgentAccountComparisonQuery) {
  return compareAgentAccountMovements({ ...scope, query }, await readDependencies(scope));
}

export async function checkServerAgentAccountSpendability(scope: Scope, query: AgentAccountSpendabilityQuery) {
  return checkAgentAccountSpendability({ ...scope, query }, await readDependencies(scope));
}
