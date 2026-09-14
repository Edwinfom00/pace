import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import { getInsightService } from "@/modules/insights/server";
import { getLedgerService } from "@/modules/ledger/server";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { ImportService } from "./import-service";
import { DatabaseImportRepository } from "./repositories/import-repository";

/** Server-only composition root; browser code and Eve never receive repository access. */
export function getImportService(): ImportService {
  const ledgerRecords = new DatabaseLedgerRepository();
  return new ImportService(
    new DatabaseImportRepository(),
    getLedgerService(),
    ledgerRecords,
    new DatabaseWorkspaceRepository(),
    getFinancialInboxService(),
    getInsightService(),
  );
}
