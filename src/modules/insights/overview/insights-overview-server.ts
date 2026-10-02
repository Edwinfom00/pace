import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { getInsightService } from "../server";
import {
  getInsightsOverviewWithReaders,
  type GetInsightsOverviewInput,
  type InsightsOverviewResult,
} from "./get-insights-overview";

export function getInsightsOverview(input: GetInsightsOverviewInput): Promise<InsightsOverviewResult> {
  const ledger = new DatabaseLedgerRepository();
  const workspaces = new DatabaseWorkspaceRepository();
  const insights = getInsightService();
  return getInsightsOverviewWithReaders(input, {
    findMembership: (workspaceId, userId) => workspaces.findMembership(workspaceId, userId),
    listTransactions: (workspaceId) => ledger.listTransactions(workspaceId),
    listCategories: (workspaceId) => ledger.listCategories(workspaceId),
    listMerchants: (workspaceId) => ledger.listMerchants(workspaceId),
    previewInsights: (actor, workspaceId, preview) => insights.previewPeriodInsights(actor, workspaceId, preview),
  });
}
