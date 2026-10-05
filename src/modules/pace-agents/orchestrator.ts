import type { PaceDomainServices } from "./domain-services";
import type {
  PaceAgentError,
  PaceContextEnvelope,
  PaceOrchestratorResult,
  PaceOrchestratorStatus,
  PacePendingApproval,
  PaceRejectedToolResult,
  PaceRoute,
  PaceRoutePlan,
  PaceSubAgentId,
  PaceSubAgentResult,
  PaceSubAgentStatus,
  PaceToolResult,
} from "./domain";
import { invokePaceCapability } from "./gateway";
import { describeSubAgent, type PaceCapabilityMetadata, type PaceSubAgentRegistry } from "./registry";
import { routePaceRequest } from "./routing";
import {
  combinePaceTraceSinks,
  createInMemoryPaceTraceSink,
  createPaceTraceEvent,
  digestPaceData,
  recordPaceTrace,
  type PaceTraceEvent,
  type PaceTraceSink,
} from "./trace";

export interface PaceSubAgentTask {
  readonly agentId: PaceSubAgentId;
  readonly request: string;
  readonly route: PaceRoute;
  readonly envelope: PaceContextEnvelope;
  readonly instructions: string;
}

export interface PaceSubAgentToolbox {
  readonly capabilities: readonly PaceCapabilityMetadata[];
  call(tool: string, input: unknown): Promise<PaceToolResult>;
}

export interface PaceSubAgentReply {
  readonly summary?: string | null;
  readonly needsInput?: boolean;
}

/** The reasoning step of a sub-agent. It can only act through the toolbox it is handed. */
export type PaceSubAgentExecutor = (
  task: PaceSubAgentTask,
  toolbox: PaceSubAgentToolbox,
) => Promise<PaceSubAgentReply | void>;

export interface PaceOrchestratorDependencies {
  readonly registry: PaceSubAgentRegistry;
  readonly services: PaceDomainServices;
  readonly trace: PaceTraceSink;
  readonly executors: Partial<Record<PaceSubAgentId, PaceSubAgentExecutor>>;
  readonly now?: () => Date;
}

export interface PaceOrchestratorRequest {
  readonly request: string;
  readonly envelope: PaceContextEnvelope;
  readonly preferredAgent?: PaceSubAgentId | null;
}

export function createPaceOrchestrator(deps: PaceOrchestratorDependencies) {
  const now = deps.now ?? (() => new Date());

  return {
    async handle(input: PaceOrchestratorRequest): Promise<PaceOrchestratorResult> {
      const collected = createInMemoryPaceTraceSink();
      const trace = combinePaceTraceSinks(collected, deps.trace);
      const emit = (detail: Parameters<typeof createPaceTraceEvent>[1]) =>
        recordPaceTrace(trace, createPaceTraceEvent(input.envelope, detail, now()));

      const plan = routePaceRequest(deps.registry, input.request, { preferredAgent: input.preferredAgent });
      await emit({
        type: "route.planned",
        status: plan.status,
        composition: plan.composition,
        intent: plan.intent,
        routes: plan.routes,
      });

      const results: PaceSubAgentResult[] = [];
      for (const route of plan.routes) {
        const result = await runPaceSubAgent(
          { ...deps, trace, now },
          { route, request: input.request, envelope: input.envelope },
          deps.executors[route.agentId],
        );
        await emit({
          type: "subagent.completed",
          agentId: result.agentId,
          status: result.status,
          callIds: result.toolResults.map((toolResult) => toolResult.callId),
        });
        results.push(result);
      }

      const composed = composePaceResults(plan, results, collected.events);
      await emit({
        type: "orchestration.completed",
        status: composed.status,
        agents: composed.results.map((result) => result.agentId),
        rejectedToolResults: composed.rejected.length,
      });
      return composed;
    },
  };
}

export async function runPaceSubAgent(
  deps: Omit<PaceOrchestratorDependencies, "executors">,
  input: { readonly route: PaceRoute; readonly request: string; readonly envelope: PaceContextEnvelope },
  executor: PaceSubAgentExecutor | undefined,
): Promise<PaceSubAgentResult> {
  const agent = deps.registry.get(input.route.agentId);
  if (!agent) throw new Error(`Unknown Pace sub-agent "${input.route.agentId}".`);
  if (!executor) {
    return subAgentResult(agent.id, [], null, {
      code: "EXECUTOR_UNAVAILABLE",
      message: `The ${agent.label} sub-agent is not available.`,
    });
  }

  const toolResults: PaceToolResult[] = [];
  const toolbox: PaceSubAgentToolbox = {
    capabilities: describeSubAgent(agent).capabilities,
    async call(tool, toolInput) {
      const { result } = await invokePaceCapability(deps, {
        agentId: agent.id,
        tool,
        input: toolInput,
        envelope: input.envelope,
        callId: `${agent.id}:${toolResults.length + 1}`,
      });
      toolResults.push(result);
      return result;
    },
  };

  try {
    const reply = await executor(
      { agentId: agent.id, request: input.request, route: input.route, envelope: input.envelope, instructions: agent.instructions },
      toolbox,
    );
    return subAgentResult(agent.id, toolResults, reply?.summary ?? null, null, reply?.needsInput === true);
  } catch {
    return subAgentResult(agent.id, toolResults, null, {
      code: "EXECUTION_FAILED",
      message: `The ${agent.label} sub-agent could not complete.`,
    });
  }
}

/**
 * Combines sub-agent results by reference. A tool result survives only if the
 * gateway traced that exact call for that sub-agent with the same output
 * fingerprint, so nothing a sub-agent merely claims can reach the answer.
 */
export function composePaceResults(
  plan: PaceRoutePlan,
  results: readonly PaceSubAgentResult[],
  trace: readonly PaceTraceEvent[],
): PaceOrchestratorResult {
  const tracedCalls = new Map<string, Extract<PaceTraceEvent, { type: "tool.completed" }>>();
  for (const event of trace) {
    if (event.type === "tool.completed") tracedCalls.set(event.callId, event);
  }

  const rejected: PaceRejectedToolResult[] = [];
  const verified = results.map((result) => {
    const toolResults = result.toolResults.filter((toolResult) => {
      const reason = rejectionReason(result.agentId, toolResult, tracedCalls.get(toolResult.callId));
      if (reason) {
        rejected.push({ agentId: result.agentId, tool: toolResult.tool, callId: toolResult.callId, reason });
      }
      return !reason;
    });
    const pendingApprovals = result.pendingApprovals.filter((pending) =>
      toolResults.some(
        (toolResult) =>
          toolResult.status === "approval_required" &&
          toolResult.tool === pending.tool &&
          toolResult.actionId === pending.actionId,
      ),
    );
    return Object.freeze({ ...result, toolResults, pendingApprovals });
  });

  const pendingApprovals = verified.flatMap((result) => result.pendingApprovals);
  return Object.freeze({
    status: orchestratorStatus(plan, verified, pendingApprovals, rejected),
    plan,
    results: Object.freeze(verified),
    pendingApprovals: Object.freeze(pendingApprovals),
    rejected: Object.freeze(rejected),
    toolsUsed: Object.freeze(
      verified.flatMap((result) =>
        result.toolResults.map((toolResult) => ({
          agentId: result.agentId,
          tool: toolResult.tool,
          callId: toolResult.callId,
        })),
      ),
    ),
  });
}

function rejectionReason(
  agentId: PaceSubAgentId,
  toolResult: PaceToolResult,
  traced: Extract<PaceTraceEvent, { type: "tool.completed" }> | undefined,
): PaceRejectedToolResult["reason"] | null {
  if (!traced || traced.tool !== toolResult.tool || traced.status !== toolResult.status) {
    return "UNTRACED_TOOL_RESULT";
  }
  if (traced.agentId !== agentId || toolResult.agentId !== agentId) return "FOREIGN_SUB_AGENT";
  const digest = toolResult.status === "ok" ? digestPaceData(toolResult.data) : null;
  if (digest !== traced.digest || toolResult.digest !== traced.digest) return "DIGEST_MISMATCH";
  return null;
}

function orchestratorStatus(
  plan: PaceRoutePlan,
  results: readonly PaceSubAgentResult[],
  pendingApprovals: readonly PacePendingApproval[],
  rejected: readonly PaceRejectedToolResult[],
): PaceOrchestratorStatus {
  if (plan.status === "fallback") return "clarification_required";
  if (pendingApprovals.length > 0) return "approval_required";
  const completed = results.filter((result) => result.status === "completed").length;
  if (completed === results.length && rejected.length === 0) return "completed";
  return completed === 0 ? "failed" : "partial";
}

function subAgentResult(
  agentId: PaceSubAgentId,
  toolResults: readonly PaceToolResult[],
  summary: string | null,
  error: PaceAgentError | null,
  needsInput = false,
): PaceSubAgentResult {
  const pendingApprovals = toolResults
    .filter((toolResult) => toolResult.status === "approval_required" && toolResult.actionId)
    .map((toolResult) => ({ agentId, tool: toolResult.tool, actionId: toolResult.actionId! }));
  const status = subAgentStatus(toolResults, pendingApprovals.length > 0, error, needsInput);
  const toolError = toolResults.find(
    (toolResult) => toolResult.status === "failed" || toolResult.status === "refused",
  )?.error;

  return {
    agentId,
    status,
    summary,
    toolResults: [...toolResults],
    pendingApprovals,
    error: status === "failed" || status === "refused" ? (error ?? toolError ?? null) : null,
  };
}

function subAgentStatus(
  toolResults: readonly PaceToolResult[],
  awaitingApproval: boolean,
  error: PaceAgentError | null,
  needsInput: boolean,
): PaceSubAgentStatus {
  if (error) return error.code === "EXECUTOR_UNAVAILABLE" ? "refused" : "failed";
  if (awaitingApproval) return "approval_required";
  if (toolResults.some((toolResult) => toolResult.status === "failed")) return "failed";
  if (toolResults.length > 0 && toolResults.every((toolResult) => toolResult.status === "refused")) return "refused";
  if (needsInput) return "needs_input";
  return "completed";
}
