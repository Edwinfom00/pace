import type { AuthenticatedActor } from "@/authorization/session";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { AgentInboxListQuery, AgentInboxReference } from "../agent-inbox-query";
import {
  createAgentInboxStateReader,
  getAgentInboxItem,
  listAgentInbox,
  type AgentInboxReadDependencies,
  type AgentInboxStateReader,
} from "../queries/agent-inbox-reads";
import { DatabaseFinancialInboxRepository } from "../repositories/financial-inbox-repository";

type Scope = { readonly actor: AuthenticatedActor; readonly workspaceId: string };

function readDependencies(): AgentInboxReadDependencies {
  return {
    inbox: new DatabaseFinancialInboxRepository(),
    ledger: new DatabaseLedgerRepository(),
    workspaces: new DatabaseWorkspaceRepository(),
  };
}

export function listServerAgentInbox(scope: Scope, query: AgentInboxListQuery) {
  return listAgentInbox({ ...scope, query }, readDependencies());
}

export function getServerAgentInboxItem(scope: Scope, reference: AgentInboxReference) {
  return getAgentInboxItem({ ...scope, reference }, readDependencies());
}

export function getServerAgentInboxStateReader(): AgentInboxStateReader {
  return createAgentInboxStateReader(readDependencies());
}
