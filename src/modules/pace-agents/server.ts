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
import { getServerAgentInboxItem, listServerAgentInbox } from "@/modules/financial-inbox/server/agent-inbox-reads";
import { presentInsight } from "@/modules/insights/presenters";
import { getInsightService } from "@/modules/insights/server";
import { getLedgerService } from "@/modules/ledger/server";
import {
  getAssistantExpenses,
  getAssistantOverviewSummary,
  getAssistantRecentTransactions,
} from "@/modules/pace-assistant/server/read-tools";
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

import { resolvePaceContextEnvelope, type ResolvePaceContextInput } from "./context";
import { createAgentActionDomainServices, type PaceDomainServices } from "./domain-services";
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
    getRecentTransactions: (scope, limit) => getAssistantRecentTransactions(scope, limit),
    getExpenses: (scope, input) => getAssistantExpenses(scope, input),
    searchTransactions: (scope, query) => searchServerAgentTransactions(scope, query),
    getTransactionDetail: (scope, transactionId) => getServerAgentTransactionDetail(scope, transactionId),
    getOverviewSummary: (scope, period) => getAssistantOverviewSummary(scope, period),
    getRecurringPayments: (scope, query) => listServerAgentRecurring(scope, query),
    getRecurringPayment: (scope, reference) => getServerAgentRecurring(scope, reference),
    getRecurringSpending: (scope, query) => getServerAgentRecurringSpending(scope, query),
    getUpcomingRecurring: (scope, query) => getServerAgentUpcomingRecurring(scope, query),
    getInboxItems: (scope, query) => listServerAgentInbox(scope, query),
    getInboxItem: (scope, reference) => getServerAgentInboxItem(scope, reference),
    async getAccounts(scope) {
      const ledger = getLedgerService();
      const [accounts, balances] = await Promise.all([
        ledger.listAccounts(scope.actor, scope.workspaceId),
        ledger.getWorkspaceAccountBalances(scope.actor, { workspaceId: scope.workspaceId }),
      ]);
      return buildAccountsOverview({ accounts, balances, filter: "ALL" });
    },
    getAccount: (scope, reference) => getServerAgentAccount(scope, reference),
    getAccountMovements: (scope, query) => getServerAgentAccountMovements(scope, query),
    compareAccountMovements: (scope, query) => compareServerAgentAccountMovements(scope, query),
    checkAccountSpendability: (scope, query) => checkServerAgentAccountSpendability(scope, query),
    async getInsightContext(scope, language) {
      const refreshed = await getInsightService().refreshForMember(scope.actor, scope.workspaceId);
      return {
        workspaceId: scope.workspaceId,
        insights: refreshed.insights.map((insight) => presentInsight(insight, language)),
        mutationLifecycle: ["get_plan_context", "create_plan_draft", "submit_plan_draft"],
      };
    },
  };
}

export function getPaceGatewayDependencies(): PaceGatewayDependencies {
  return { registry: paceSubAgentRegistry, services: getPaceDomainServices(), trace: traceSink };
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
    },
  });
}

export function resolveServerPaceContextEnvelope(input: ResolvePaceContextInput) {
  return resolvePaceContextEnvelope(new DatabaseWorkspaceRepository(), input);
}
