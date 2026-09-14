import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import { getPlansService } from "@/modules/plans/server";

import { AgentActionService } from "./agent-action-service";
import { DatabaseAgentActionRepository } from "./repositories/agent-action-repository";

/** Server-only composition root; Eve tools import this rather than Drizzle. */
export function getAgentActionService(): AgentActionService {
  const workspaces = new DatabaseWorkspaceRepository();
  const ledgerRecords = new DatabaseLedgerRepository();
  return new AgentActionService(
    new DatabaseAgentActionRepository(),
    new LedgerService(ledgerRecords, workspaces),
    ledgerRecords,
    workspaces,
    getFinancialInboxService(),
    getPlansService(),
  );
}
