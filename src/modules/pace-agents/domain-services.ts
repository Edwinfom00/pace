import type { AuthenticatedActor } from "@/authorization/session";
import type { AccountReference } from "@/modules/accounts/domain/account-reference";
import type {
  AgentAccountComparisonQuery,
  AgentAccountMovementsQuery,
  AgentAccountSpendabilityQuery,
} from "@/modules/accounts/domain/agent-account-query";
import type { AgentActionService } from "@/modules/agent-actions/agent-action-service";
import type { AgentInboxListQuery, AgentInboxReference } from "@/modules/financial-inbox/agent-inbox-query";
import type {
  AgentBudgetFilter,
  AgentForecastQuery,
  AgentGoalFilter,
  AgentPlanListQuery,
  AgentRuleListQuery,
  BudgetReference,
  GoalReference,
  RuleReference,
} from "@/modules/plans/agent-plans-view";
import type {
  AgentRecurringListQuery,
  AgentRecurringSpendingQuery,
  AgentUpcomingRecurringQuery,
} from "@/modules/recurring/domain/agent-recurring-query";
import type { RecurringReference } from "@/modules/recurring/domain/recurring-reference";
import type { AgentTransactionSearchQuery } from "@/modules/transactions/domain/agent-transaction-query";

export interface PaceServiceScope {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
}

export type PaceReadPeriod = "CURRENT_MONTH" | "PREVIOUS_MONTH";

type Scoped<TMethod> = TMethod extends (
  actor: AuthenticatedActor,
  workspaceId: string,
  ...rest: infer TRest
) => infer TOutput
  ? (scope: PaceServiceScope, ...rest: TRest) => TOutput
  : never;

type AgentActionMethod =
  | "getTransactionContext"
  | "createTransactionDraft"
  | "createTransactionChangeDraft"
  | "editTransactionDraft"
  | "executeApprovedTransaction"
  | "createPlanningDraft"
  | "executeApprovedPlanning"
  | "createAccountDraft"
  | "executeApprovedAccount"
  | "createRecurringDraft"
  | "executeApprovedRecurring"
  | "createInboxDraft"
  | "executeApprovedInbox"
  | "requestApproval"
  | "approveAction"
  | "rejectAction"
  | "getActionDetail";

export type PaceAgentActionDomainServices = {
  [TMethod in AgentActionMethod]: Scoped<AgentActionService[TMethod]>;
};

/**
 * The only door from a sub-agent capability to Financial Truth. Every method is
 * backed by an existing canonical service that re-checks workspace membership
 * and permissions itself; capabilities receive nothing else to reach data with.
 */
export interface PaceDomainServices extends PaceAgentActionDomainServices {
  getRecentTransactions(scope: PaceServiceScope, limit: number): Promise<unknown>;
  getExpenses(scope: PaceServiceScope, input: { period: PaceReadPeriod; limit: number }): Promise<unknown>;
  searchTransactions(scope: PaceServiceScope, query: AgentTransactionSearchQuery): Promise<unknown>;
  getTransactionDetail(scope: PaceServiceScope, transactionId: string): Promise<unknown>;
  getOverviewSummary(scope: PaceServiceScope, period: PaceReadPeriod): Promise<unknown>;
  getAccounts(scope: PaceServiceScope): Promise<unknown>;
  getAccount(scope: PaceServiceScope, reference: AccountReference): Promise<unknown>;
  getAccountMovements(scope: PaceServiceScope, query: AgentAccountMovementsQuery): Promise<unknown>;
  compareAccountMovements(scope: PaceServiceScope, query: AgentAccountComparisonQuery): Promise<unknown>;
  checkAccountSpendability(scope: PaceServiceScope, query: AgentAccountSpendabilityQuery): Promise<unknown>;
  getRecurringPayments(scope: PaceServiceScope, query: AgentRecurringListQuery): Promise<unknown>;
  getRecurringPayment(scope: PaceServiceScope, reference: RecurringReference): Promise<unknown>;
  getRecurringSpending(scope: PaceServiceScope, query: AgentRecurringSpendingQuery): Promise<unknown>;
  getUpcomingRecurring(scope: PaceServiceScope, query: AgentUpcomingRecurringQuery): Promise<unknown>;
  getInboxItems(scope: PaceServiceScope, query: AgentInboxListQuery): Promise<unknown>;
  getInboxItem(scope: PaceServiceScope, reference: AgentInboxReference): Promise<unknown>;
  getBudgets(scope: PaceServiceScope, query: AgentPlanListQuery<AgentBudgetFilter>): Promise<unknown>;
  getBudget(scope: PaceServiceScope, reference: BudgetReference): Promise<unknown>;
  getSavingsGoals(scope: PaceServiceScope, query: AgentPlanListQuery<AgentGoalFilter>): Promise<unknown>;
  getSavingsGoal(scope: PaceServiceScope, reference: GoalReference): Promise<unknown>;
  getForecast(scope: PaceServiceScope, query: AgentForecastQuery): Promise<unknown>;
  getRules(scope: PaceServiceScope, query: AgentRuleListQuery): Promise<unknown>;
  getRule(scope: PaceServiceScope, reference: RuleReference): Promise<unknown>;
  getInsightContext(scope: PaceServiceScope, language: string | null): Promise<unknown>;
}

export function createAgentActionDomainServices(actions: AgentActionService): PaceAgentActionDomainServices {
  return {
    getTransactionContext: (scope) => actions.getTransactionContext(scope.actor, scope.workspaceId),
    createTransactionDraft: (scope, input) => actions.createTransactionDraft(scope.actor, scope.workspaceId, input),
    createTransactionChangeDraft: (scope, input) =>
      actions.createTransactionChangeDraft(scope.actor, scope.workspaceId, input),
    editTransactionDraft: (scope, actionId, input) =>
      actions.editTransactionDraft(scope.actor, scope.workspaceId, actionId, input),
    executeApprovedTransaction: (scope, actionId) =>
      actions.executeApprovedTransaction(scope.actor, scope.workspaceId, actionId),
    createPlanningDraft: (scope, input) => actions.createPlanningDraft(scope.actor, scope.workspaceId, input),
    executeApprovedPlanning: (scope, actionId) =>
      actions.executeApprovedPlanning(scope.actor, scope.workspaceId, actionId),
    createAccountDraft: (scope, input) => actions.createAccountDraft(scope.actor, scope.workspaceId, input),
    executeApprovedAccount: (scope, actionId) =>
      actions.executeApprovedAccount(scope.actor, scope.workspaceId, actionId),
    createRecurringDraft: (scope, input) => actions.createRecurringDraft(scope.actor, scope.workspaceId, input),
    executeApprovedRecurring: (scope, actionId) =>
      actions.executeApprovedRecurring(scope.actor, scope.workspaceId, actionId),
    createInboxDraft: (scope, input) => actions.createInboxDraft(scope.actor, scope.workspaceId, input),
    executeApprovedInbox: (scope, actionId) => actions.executeApprovedInbox(scope.actor, scope.workspaceId, actionId),
    requestApproval: (scope, actionId) => actions.requestApproval(scope.actor, scope.workspaceId, actionId),
    approveAction: (scope, actionId) => actions.approveAction(scope.actor, scope.workspaceId, actionId),
    rejectAction: (scope, actionId) => actions.rejectAction(scope.actor, scope.workspaceId, actionId),
    getActionDetail: (scope, actionId) => actions.getActionDetail(scope.actor, scope.workspaceId, actionId),
  };
}
