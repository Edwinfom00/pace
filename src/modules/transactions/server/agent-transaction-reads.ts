import type { AuthenticatedActor } from "@/authorization/session";
import { getLocalizedLedgerRepository } from "@/modules/ledger/server";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { AgentTransactionSearchQuery } from "../domain/agent-transaction-query";
import { getAgentTransactionDetail, searchAgentTransactions } from "../queries/agent-transaction-reads";

type Scope = { readonly actor: AuthenticatedActor; readonly workspaceId: string };

export async function searchServerAgentTransactions(scope: Scope, query: AgentTransactionSearchQuery) {
  return searchAgentTransactions(
    { ...scope, query },
    { ledger: await getLocalizedLedgerRepository(scope.actor.userId), workspaces: new DatabaseWorkspaceRepository() },
  );
}

export async function getServerAgentTransactionDetail(scope: Scope, transactionId: string) {
  return getAgentTransactionDetail(
    { ...scope, transactionId },
    { ledger: await getLocalizedLedgerRepository(scope.actor.userId), workspaces: new DatabaseWorkspaceRepository() },
  );
}
