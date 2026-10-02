import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getAccountAnalysisWithReaders,
  type GetAccountAnalysisInput,
} from "./get-account-analysis";
import type { AccountAnalysis } from "./account-analysis.types";

export function getAccountAnalysis(
  input: GetAccountAnalysisInput,
): Promise<AccountAnalysis | null> {
  const ledger = new DatabaseLedgerRepository();
  const workspaces = new DatabaseWorkspaceRepository();
  return getAccountAnalysisWithReaders(input, {
    findMembership: (workspaceId, userId) =>
      workspaces.findMembership(workspaceId, userId),
    listAccounts: (workspaceId) => ledger.listAccounts(workspaceId),
    getAccountBalance: (workspaceId, accountId) =>
      ledger.getAccountBalance(workspaceId, accountId),
    findOpeningBalance: (workspaceId, accountId) =>
      ledger.findOpeningBalance(workspaceId, accountId),
    listTransactions: (workspaceId) => ledger.listTransactions(workspaceId),
    listCategories: (workspaceId) => ledger.listCategories(workspaceId),
    listMerchants: (workspaceId) => ledger.listMerchants(workspaceId),
  });
}
