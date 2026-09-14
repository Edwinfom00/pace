import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { FinancialInboxService } from "./financial-inbox-service";
import { DatabaseFinancialInboxRepository } from "./repositories/financial-inbox-repository";


export function getFinancialInboxService(): FinancialInboxService {
  const ledger = new DatabaseLedgerRepository();
  return new FinancialInboxService(
    new DatabaseFinancialInboxRepository(),
    ledger,
    new DatabaseWorkspaceRepository(),
  );
}
