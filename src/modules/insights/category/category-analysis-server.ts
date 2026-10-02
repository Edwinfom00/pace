import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getCategoryAnalysisWithReaders,
  type GetCategoryAnalysisInput,
} from "./get-category-analysis";
import type { CategoryAnalysis } from "./category-analysis.types";

export function getCategoryAnalysis(
  input: GetCategoryAnalysisInput,
): Promise<CategoryAnalysis | null> {
  const ledger = new DatabaseLedgerRepository();
  const workspaces = new DatabaseWorkspaceRepository();
  return getCategoryAnalysisWithReaders(input, {
    findMembership: (workspaceId, userId) =>
      workspaces.findMembership(workspaceId, userId),
    listTransactions: (workspaceId) => ledger.listTransactions(workspaceId),
    listCategories: (workspaceId) => ledger.listCategories(workspaceId),
    listMerchants: (workspaceId) => ledger.listMerchants(workspaceId),
  });
}
