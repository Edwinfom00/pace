import type { AuthenticatedActor } from "@/authorization/session";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import {
  getLedgerService,
  getLocalizedLedgerService,
} from "@/modules/ledger/server";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type {
  AgentBudgetFilter,
  AgentForecastQuery,
  AgentGoalFilter,
  AgentPlanListQuery,
  AgentRuleListQuery,
  BudgetReference,
  GoalReference,
  RuleReference,
} from "../agent-plans-view";
import {
  getAgentBudget,
  getAgentForecast,
  getAgentGoal,
  getAgentRule,
  listAgentBudgets,
  listAgentGoals,
  listAgentRules,
  type AgentPlansReadDependencies,
} from "../queries/agent-plans-reads";
import { getRulesService } from "../rules/server";
import { getPlansService } from "../server";

type Scope = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
};

async function readDependencies(
  scope: Scope,
): Promise<AgentPlansReadDependencies> {
  const localizedLedger = await getLocalizedLedgerService(scope.actor.userId);
  const ledger = getLedgerService();
  const ledgerRecords = new DatabaseLedgerRepository();
  const rules = getRulesService();
  const recurring = getFinancialInboxService();
  const workspaces = new DatabaseWorkspaceRepository();
  return {
    plans: getPlansService(),
    rules: {
      listRules: (actor, workspaceId) =>
        rules.listRules(actor, workspaceId, { includeArchived: true }),
      listExecutions: (actor, workspaceId) =>
        rules.listRuleExecutions(actor, workspaceId),
      listCategories: (actor, workspaceId) =>
        localizedLedger.listCategories(actor, workspaceId),
      listAccounts: (actor, workspaceId) =>
        localizedLedger.listAccounts(actor, workspaceId),
      findTransaction: (workspaceId, transactionId) =>
        ledgerRecords.findTransaction(workspaceId, transactionId),
      findMerchant: (workspaceId, merchantId) =>
        ledgerRecords.findMerchant(workspaceId, merchantId),
    },
    forecast: {
      findMembership: (workspaceId, userId) =>
        workspaces.findMembership(workspaceId, userId),
      getBalances: (actor, workspaceId) =>
        ledger.getWorkspaceAccountBalances(actor, { workspaceId }),
      listAccounts: (actor, workspaceId) =>
        ledger.listAccounts(actor, workspaceId),
      listRecurring: (actor, workspaceId) =>
        recurring.listRecurring(actor, workspaceId),
    },
    workspaces,
  };
}

export async function listServerAgentBudgets(
  scope: Scope,
  query: AgentPlanListQuery<AgentBudgetFilter>,
) {
  return listAgentBudgets({ ...scope, query }, await readDependencies(scope));
}

export async function getServerAgentBudget(
  scope: Scope,
  reference: BudgetReference,
) {
  return getAgentBudget({ ...scope, reference }, await readDependencies(scope));
}

export async function listServerAgentGoals(
  scope: Scope,
  query: AgentPlanListQuery<AgentGoalFilter>,
) {
  return listAgentGoals({ ...scope, query }, await readDependencies(scope));
}

export async function getServerAgentGoal(
  scope: Scope,
  reference: GoalReference,
) {
  return getAgentGoal({ ...scope, reference }, await readDependencies(scope));
}

export async function getServerAgentForecast(
  scope: Scope,
  query: AgentForecastQuery,
) {
  return getAgentForecast({ ...scope, query }, await readDependencies(scope));
}

export async function listServerAgentRules(
  scope: Scope,
  query: AgentRuleListQuery,
) {
  return listAgentRules({ ...scope, query }, await readDependencies(scope));
}

export async function getServerAgentRule(
  scope: Scope,
  reference: RuleReference,
) {
  return getAgentRule({ ...scope, reference }, await readDependencies(scope));
}
