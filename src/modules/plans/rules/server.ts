import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import { DatabaseFinancialInboxRepository } from "@/modules/financial-inbox/repositories/financial-inbox-repository";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { DatabaseRulesRepository } from "./repositories/rules-repository";
import { RulesService } from "./rule-service";

export function getRulesService(): RulesService {
  const ledgerRecords = new DatabaseLedgerRepository();
  const workspaces = new DatabaseWorkspaceRepository();
  const ledger = new LedgerService(ledgerRecords, workspaces);
  return new RulesService(
    new DatabaseRulesRepository(),
    ledgerRecords,
    ledger,
    new FinancialInboxService(new DatabaseFinancialInboxRepository(), ledgerRecords, workspaces, ledger),
    workspaces,
  );
}
