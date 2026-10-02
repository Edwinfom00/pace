import { DatabaseFinancialInboxRepository } from "@/modules/financial-inbox/repositories/financial-inbox-repository";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getInsightsTrendsWithReaders,
  type GetInsightsTrendsInput,
} from "./get-insights-trends";
import type { InsightsTrends } from "./insights-trends.types";

export function getInsightsTrends(
  input: GetInsightsTrendsInput,
): Promise<InsightsTrends> {
  const ledger = new DatabaseLedgerRepository();
  const workspaces = new DatabaseWorkspaceRepository();
  const inbox = new DatabaseFinancialInboxRepository();
  return getInsightsTrendsWithReaders(input, {
    findMembership: (workspaceId, userId) =>
      workspaces.findMembership(workspaceId, userId),
    listTransactions: (workspaceId) => ledger.listTransactions(workspaceId),
    listCategories: (workspaceId) => ledger.listCategories(workspaceId),
    listMerchants: (workspaceId) => ledger.listMerchants(workspaceId),
    listAccounts: (workspaceId) => ledger.listAccounts(workspaceId),
    listRecurringPayments: (workspaceId) =>
      inbox.listRecurringPayments(workspaceId),
  });
}
