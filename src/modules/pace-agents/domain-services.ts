import type { AuthenticatedActor } from "@/authorization/session";
import type { AgentActionService } from "@/modules/agent-actions/agent-action-service";
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
  | "getPlanContext"
  | "getPlanStatus"
  | "createPlanDraft"
  | "editPlanDraft"
  | "executeApprovedPlan"
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
  getRecurringPayments(scope: PaceServiceScope, limit: number): Promise<unknown>;
  getInboxItems(scope: PaceServiceScope, limit: number): Promise<unknown>;
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
    getPlanContext: (scope) => actions.getPlanContext(scope.actor, scope.workspaceId),
    getPlanStatus: (scope) => actions.getPlanStatus(scope.actor, scope.workspaceId),
    createPlanDraft: (scope, input) => actions.createPlanDraft(scope.actor, scope.workspaceId, input),
    editPlanDraft: (scope, actionId, input) => actions.editPlanDraft(scope.actor, scope.workspaceId, actionId, input),
    executeApprovedPlan: (scope, actionId) => actions.executeApprovedPlan(scope.actor, scope.workspaceId, actionId),
    requestApproval: (scope, actionId) => actions.requestApproval(scope.actor, scope.workspaceId, actionId),
    approveAction: (scope, actionId) => actions.approveAction(scope.actor, scope.workspaceId, actionId),
    rejectAction: (scope, actionId) => actions.rejectAction(scope.actor, scope.workspaceId, actionId),
    getActionDetail: (scope, actionId) => actions.getActionDetail(scope.actor, scope.workspaceId, actionId),
  };
}
