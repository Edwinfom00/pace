import { DatabaseFinancialInboxRepository } from "@/modules/financial-inbox/repositories/financial-inbox-repository";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabasePlansRepository } from "@/modules/plans/repositories/plans-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { InsightService } from "./insight-service";
import { DatabaseInsightRepository } from "./repositories/insight-repository";


export function getInsightService(): InsightService {
  const ledger = new DatabaseLedgerRepository();
  return new InsightService(
    new DatabaseInsightRepository(),
    ledger,
    new DatabasePlansRepository(),
    new DatabaseFinancialInboxRepository(),
    new DatabaseWorkspaceRepository(),
  );
}
