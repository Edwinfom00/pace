import { deepseek } from "@ai-sdk/deepseek";

import { createAccountsAgent } from "@/modules/accounts/agent/accounts-agent";
import { buildAccountsOverview } from "@/modules/accounts/domain/accounts-overview";
import {
  checkServerAgentAccountSpendability,
  compareServerAgentAccountMovements,
  getServerAgentAccount,
  getServerAgentAccountMovements,
} from "@/modules/accounts/server/agent-account-reads";
import { getAgentActionService } from "@/modules/agent-actions/server";
import { createInboxAgent } from "@/modules/financial-inbox/agent/inbox-agent";
import {
  getServerAgentInboxItem,
  listServerAgentInbox,
} from "@/modules/financial-inbox/server/agent-inbox-reads";
import { createInsightsAgent } from "@/modules/insights/agent/insights-agent";
import {
  createServerAgentInsightChart,
  generateServerAgentFinancialReport,
  getServerAgentAccountInsights,
  getServerAgentCategoryInsights,
  getServerAgentInsightsAnalytics,
  getServerAgentInsightsTrends,
  getServerAgentRecurringInsights,
} from "@/modules/insights/agent-insights-server";
import { presentInsight } from "@/modules/insights/presenters";
import { getInsightService } from "@/modules/insights/server";
import { getLedgerService } from "@/modules/ledger/server";
import {
  getAssistantExpenses,
  getAssistantOverviewSummary,
  getAssistantRecentTransactions,
} from "@/modules/pace-assistant/server/read-tools";
import { createPlansAgent } from "@/modules/plans/agent/plans-agent";
import {
  getServerAgentBudget,
  getServerAgentForecast,
  getServerAgentGoal,
  getServerAgentRule,
  listServerAgentBudgets,
  listServerAgentGoals,
  listServerAgentRules,
} from "@/modules/plans/server/agent-plans-reads";
import { createRecurringAgent } from "@/modules/recurring/agent/recurring-agent";
import {
  getServerAgentRecurring,
  getServerAgentRecurringSpending,
  getServerAgentUpcomingRecurring,
  listServerAgentRecurring,
} from "@/modules/recurring/server/agent-recurring-reads";
import { createTransactionsAgent } from "@/modules/transactions/agent/transactions-agent";
import {
  getServerAgentTransactionDetail,
  searchServerAgentTransactions,
} from "@/modules/transactions/server/agent-transaction-reads";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  resolvePaceContextEnvelope,
  type ResolvePaceContextInput,
} from "./context";
import {
  createAgentActionDomainServices,
  type PaceDomainServices,
} from "./domain-services";
import type { PaceGatewayDependencies } from "./gateway";
import { createPaceOrchestrator } from "./orchestrator";
import { paceSubAgentRegistry } from "./registry";
import { createConsolePaceTraceSink, type PaceTraceSink } from "./trace";

let traceSink: PaceTraceSink = createConsolePaceTraceSink();

export function setPaceTraceSink(sink: PaceTraceSink): void {
  traceSink = sink;
}

/** Server-only composition root; sub-agent capabilities reach data through these services and nothing else. */
export function getPaceDomainServices(): PaceDomainServices {
  return {
    ...createAgentActionDomainServices(getAgentActionService()),
    getRecentTransactions: (scope, limit) =>
      getAssistantRecentTransactions(scope, limit),
    getExpenses: (scope, input) => getAssistantExpenses(scope, input),
    searchTransactions: (scope, query) =>
      searchServerAgentTransactions(scope, query),
    getTransactionDetail: (scope, transactionId) =>
      getServerAgentTransactionDetail(scope, transactionId),
    getOverviewSummary: (scope, period) =>
      getAssistantOverviewSummary(scope, period),
    getRecurringPayments: (scope, query) =>
      listServerAgentRecurring(scope, query),
    getRecurringPayment: (scope, reference) =>
      getServerAgentRecurring(scope, reference),
    getRecurringSpending: (scope, query) =>
      getServerAgentRecurringSpending(scope, query),
    getUpcomingRecurring: (scope, query) =>
      getServerAgentUpcomingRecurring(scope, query),
    getInboxItems: (scope, query) => listServerAgentInbox(scope, query),
    getInboxItem: (scope, reference) =>
      getServerAgentInboxItem(scope, reference),
    getBudgets: (scope, query) => listServerAgentBudgets(scope, query),
    getBudget: (scope, reference) => getServerAgentBudget(scope, reference),
    getSavingsGoals: (scope, query) => listServerAgentGoals(scope, query),
    getSavingsGoal: (scope, reference) => getServerAgentGoal(scope, reference),
    getForecast: (scope, query) => getServerAgentForecast(scope, query),
    getRules: (scope, query) => listServerAgentRules(scope, query),
    getRule: (scope, reference) => getServerAgentRule(scope, reference),
    async getAccounts(scope) {
      const ledger = getLedgerService();
      const [accounts, balances] = await Promise.all([
        ledger.listAccounts(scope.actor, scope.workspaceId),
        ledger.getWorkspaceAccountBalances(scope.actor, {
          workspaceId: scope.workspaceId,
        }),
      ]);
      return buildAccountsOverview({ accounts, balances, filter: "ALL" });
    },
    getAccount: (scope, reference) => getServerAgentAccount(scope, reference),
    getAccountMovements: (scope, query) =>
      getServerAgentAccountMovements(scope, query),
    compareAccountMovements: (scope, query) =>
      compareServerAgentAccountMovements(scope, query),
    checkAccountSpendability: (scope, query) =>
      checkServerAgentAccountSpendability(scope, query),
    getInsightsAnalytics: (scope, query, context) =>
      getServerAgentInsightsAnalytics(scope, query, context),
    getCategoryInsights: (scope, query, context) =>
      getServerAgentCategoryInsights(scope, query, context),
    getAccountInsights: (scope, query, context) =>
      getServerAgentAccountInsights(scope, query, context),
    getInsightsTrends: (scope, query, context) =>
      getServerAgentInsightsTrends(scope, query, context),
    getRecurringInsights: (scope, query, context) =>
      getServerAgentRecurringInsights(scope, query, context),
    createInsightChart: (scope, query, context) =>
      createServerAgentInsightChart(scope, query, context),
    generateFinancialReport: (scope, query, context) =>
      generateServerAgentFinancialReport(scope, query, context),
    async getInsightContext(scope, language) {
      const refreshed = await getInsightService().refreshForMember(
        scope.actor,
        scope.workspaceId,
      );
      return {
        workspaceId: scope.workspaceId,
        insights: refreshed.insights.map((insight) =>
          presentInsight(insight, language),
        ),
        mutationLifecycle: [
          "get_budgets",
          "create_budget_draft",
          "submit_plan_draft",
        ],
      };
    },
  };
}

export function getPaceGatewayDependencies(): PaceGatewayDependencies {
  return {
    registry: paceSubAgentRegistry,
    services: getPaceDomainServices(),
    trace: traceSink,
  };
}

export function getPaceOrchestrator() {
  const model = deepseek("deepseek-v4-flash");
  return createPaceOrchestrator({
    ...getPaceGatewayDependencies(),
    executors: {
      transactions: createTransactionsAgent({ model }),
      accounts: createAccountsAgent({ model }),
      recurring: createRecurringAgent({ model }),
      inbox: createInboxAgent({ model }),
      plans: createPlansAgent({ model }),
      insights: createInsightsAgent({ model }),
    },
  });
}

export function resolveServerPaceContextEnvelope(
  input: ResolvePaceContextInput,
) {
  return resolvePaceContextEnvelope(new DatabaseWorkspaceRepository(), input);
}
