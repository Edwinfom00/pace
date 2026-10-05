import type { AuthenticatedActor } from "@/authorization/session";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { getFinancialReport } from "@/modules/reports/financial-report-server";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { getAccountAnalysis } from "./account/account-analysis-server";
import type {
  AgentAccountInsightsQuery,
  AgentCategoryInsightsQuery,
  AgentInsightChartQuery,
  AgentInsightsAnalyticsQuery,
  AgentInsightsContext,
  AgentRecurringInsightsQuery,
  AgentReportQuery,
  AgentTrendsQuery,
} from "./agent-insights-view";
import { getCategoryAnalysis } from "./category/category-analysis-server";
import { getInsightsOverview } from "./overview/insights-overview-server";
import {
  createAgentInsightChart,
  generateAgentFinancialReport,
  getAgentAccountInsights,
  getAgentCategoryInsights,
  getAgentInsightsAnalytics,
  getAgentInsightsTrends,
  getAgentRecurringInsights,
  type AgentInsightsReadDependencies,
} from "./queries/agent-insights-reads";
import { getInsightsRecurring } from "./recurring/insights-recurring-server";
import { getInsightsTrends } from "./trends/insights-trends-server";

type Scope = { readonly actor: AuthenticatedActor; readonly workspaceId: string };

function readDependencies(): AgentInsightsReadDependencies {
  const ledger = new DatabaseLedgerRepository();
  return {
    workspaces: new DatabaseWorkspaceRepository(),
    listCategories: (workspaceId) => ledger.listCategories(workspaceId),
    listAccounts: (workspaceId) => ledger.listAccounts(workspaceId),
    readOverview: getInsightsOverview,
    readCategoryAnalysis: getCategoryAnalysis,
    readAccountAnalysis: getAccountAnalysis,
    readTrends: getInsightsTrends,
    readRecurring: getInsightsRecurring,
    readReport: getFinancialReport,
  };
}

export function getServerAgentInsightsAnalytics(
  scope: Scope,
  query: AgentInsightsAnalyticsQuery,
  context: AgentInsightsContext,
) {
  return getAgentInsightsAnalytics({ ...scope, ...context, query }, readDependencies());
}

export function getServerAgentCategoryInsights(
  scope: Scope,
  query: AgentCategoryInsightsQuery,
  context: AgentInsightsContext,
) {
  return getAgentCategoryInsights({ ...scope, ...context, query }, readDependencies());
}

export function getServerAgentAccountInsights(
  scope: Scope,
  query: AgentAccountInsightsQuery,
  context: AgentInsightsContext,
) {
  return getAgentAccountInsights({ ...scope, ...context, query }, readDependencies());
}

export function getServerAgentInsightsTrends(scope: Scope, query: AgentTrendsQuery, context: AgentInsightsContext) {
  return getAgentInsightsTrends({ ...scope, ...context, query }, readDependencies());
}

export function getServerAgentRecurringInsights(
  scope: Scope,
  query: AgentRecurringInsightsQuery,
  context: AgentInsightsContext,
) {
  return getAgentRecurringInsights({ ...scope, ...context, query }, readDependencies());
}

export function createServerAgentInsightChart(
  scope: Scope,
  query: AgentInsightChartQuery,
  context: AgentInsightsContext,
) {
  return createAgentInsightChart({ ...scope, ...context, query }, readDependencies());
}

export function generateServerAgentFinancialReport(
  scope: Scope,
  query: AgentReportQuery,
  context: AgentInsightsContext,
) {
  return generateAgentFinancialReport({ ...scope, ...context, query }, readDependencies());
}
