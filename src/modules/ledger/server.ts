import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { DatabaseLedgerRepository } from "./repositories/ledger-repository";
import { LedgerService } from "./ledger-service";

/** Server-only composition root. Client code never imports the database or repositories. */
export function getLedgerService(): LedgerService {
  return new LedgerService(new DatabaseLedgerRepository(), new DatabaseWorkspaceRepository());
}
