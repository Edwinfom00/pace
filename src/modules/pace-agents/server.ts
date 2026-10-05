import { buildAccountsOverview } from "@/modules/accounts/domain/accounts-overview";
import { getAgentActionService } from "@/modules/agent-actions/server";
import { presentInsight } from "@/modules/insights/presenters";
import { getInsightService } from "@/modules/insights/server";
import { getLedgerService } from "@/modules/ledger/server";
import {
  getAssistantExpenses,
  getAssistantInboxItems,
  getAssistantOverviewSummary,
  getAssistantRecentTransactions,
  getAssistantRecurringPayments,
} from "@/modules/pace-assistant/server/read-tools";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { resolvePaceContextEnvelope, type ResolvePaceContextInput } from "./context";
import { createAgentActionDomainServices, type PaceDomainServices } from "./domain-services";
import type { PaceGatewayDependencies } from "./gateway";
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
    getOverviewSummary: (scope, period) => getAssistantOverviewSummary(scope, period),
    getRecurringPayments: (scope, limit) => getAssistantRecurringPayments(scope, limit),
    getInboxItems: (scope, limit) => getAssistantInboxItems(scope, limit),
    async getAccounts(scope) {
      const ledger = getLedgerService();
      const [accounts, balances] = await Promise.all([
        ledger.listAccounts(scope.actor, scope.workspaceId),
        ledger.getWorkspaceAccountBalances(scope.actor, { workspaceId: scope.workspaceId }),
      ]);
      return buildAccountsOverview({ accounts, balances, filter: "ALL" });
    },
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

export function resolveServerPaceContextEnvelope(input: ResolvePaceContextInput) {
  return resolvePaceContextEnvelope(new DatabaseWorkspaceRepository(), input);
}
