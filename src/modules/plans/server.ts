import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { PlansService } from "./plan-service";
import { DatabasePlansRepository } from "./repositories/plans-repository";

/** Server-only composition root. Agent tools never access Drizzle directly. */
export function getPlansService(): PlansService {
  return new PlansService(
    new DatabasePlansRepository(),
    new DatabaseLedgerRepository(),
    new DatabaseWorkspaceRepository(),
  );
}
