import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";

import type { PaceDomainServices } from "./domain-services";
import type {
  PaceAgentError,
  PaceCapability,
  PaceContextEnvelope,
  PaceRefusalCode,
  PaceSubAgentId,
  PaceToolResult,
  PaceToolResultStatus,
} from "./domain";
import type { PaceSubAgentRegistry } from "./registry";
import {
  createPaceTraceEvent,
  digestPaceData,
  recordPaceTrace,
  type PaceTraceDetail,
  type PaceTraceSink,
} from "./trace";

export interface PaceGatewayDependencies {
  readonly registry: PaceSubAgentRegistry;
  readonly services: PaceDomainServices;
  readonly trace: PaceTraceSink;
  readonly now?: () => Date;
}

export interface PaceInvocation {
  readonly agentId: PaceSubAgentId;
  readonly tool: string;
  readonly input: unknown;
  readonly envelope: PaceContextEnvelope;
  readonly callId: string;
}

export interface PaceInvocationOutcome {
  readonly result: PaceToolResult;
  readonly cause: unknown;
}

type Admission =
  | { readonly admitted: true; readonly agentId: PaceSubAgentId; readonly capability: PaceCapability; readonly input: unknown }
  | { readonly admitted: false; readonly outcome: PaceInvocationOutcome };

const APPROVED_STATUSES = ["APPROVED", "EXECUTING", "COMPLETED"];

/**
 * The single path from a sub-agent to a domain service. It decides nothing
 * financial: it checks tool ownership, the member's permission, the input
 * shape, and — for a commit — that the action was approved, then delegates.
 */
export async function invokePaceCapability(
  deps: PaceGatewayDependencies,
  invocation: PaceInvocation,
): Promise<PaceInvocationOutcome> {
  const admission = admit(deps, invocation);
  if (!admission.admitted) return traced(deps, invocation, admission.outcome);
  const { agentId, capability, input } = admission;

  try {
    if (capability.access === "commit") {
      const pending = await holdUnapprovedCommit(deps, invocation, agentId, capability, input);
      if (pending) return traced(deps, invocation, pending);
    }
    const data = await capability.run(input as never, {
      envelope: invocation.envelope,
      services: deps.services,
      callId: invocation.callId,
      idempotencyKey: `${invocation.envelope.session.runtime}:${invocation.envelope.session.id}:${invocation.callId}`,
    });
    return traced(deps, invocation, {
      cause: null,
      result: {
        agentId,
        tool: capability.tool,
        callId: invocation.callId,
        access: capability.access,
        status: "ok",
        data,
        digest: digestPaceData(data),
        actionId: capability.actionRef?.(input as never, data) ?? null,
        error: null,
      },
    });
  } catch (cause) {
    return traced(deps, invocation, failure(agentId, capability, invocation, input, cause));
  }
}

/** VALIDATE → APPROVAL: asks the action service to park a complete draft for a human decision. */
export async function requestPaceApproval(
  deps: PaceGatewayDependencies,
  invocation: PaceInvocation,
): Promise<PaceInvocationOutcome> {
  const admission = admitCommit(deps, invocation);
  if (!admission.admitted) return tracedApproval(deps, invocation, "approval.denied", admission.outcome);
  const { agentId, capability, input } = admission;
  try {
    const actionId = capability.actionRef!(input as never, null) ?? "";
    await deps.services.requestApproval(scopeOf(invocation.envelope), actionId);
    return tracedApproval(deps, invocation, "approval.requested", {
      cause: null,
      result: approvalRequired(agentId, capability, invocation, actionId),
    });
  } catch (cause) {
    return tracedApproval(deps, invocation, "approval.denied", failure(agentId, capability, invocation, input, cause));
  }
}

/** APPROVAL: records the human decision. The responder's own envelope is authorized, not the requester's. */
export async function resolvePaceApproval(
  deps: PaceGatewayDependencies,
  invocation: PaceInvocation,
  decision: "approve" | "reject",
): Promise<PaceInvocationOutcome> {
  const admission = admitCommit(deps, invocation);
  if (!admission.admitted) return tracedApproval(deps, invocation, "approval.denied", admission.outcome);
  const { agentId, capability, input } = admission;
  try {
    const actionId = capability.actionRef!(input as never, null) ?? "";
    const scope = scopeOf(invocation.envelope);
    const action =
      decision === "approve"
        ? await deps.services.approveAction(scope, actionId)
        : await deps.services.rejectAction(scope, actionId);
    const data = { actionId: action.id, status: action.status };
    return tracedApproval(deps, invocation, decision === "approve" ? "approval.granted" : "approval.rejected", {
      cause: null,
      result: {
        agentId,
        tool: capability.tool,
        callId: invocation.callId,
        access: capability.access,
        status: "ok",
        data,
        digest: digestPaceData(data),
        actionId,
        error: null,
      },
    });
  } catch (cause) {
    return tracedApproval(deps, invocation, "approval.denied", failure(agentId, capability, invocation, input, cause));
  }
}

function admit(deps: PaceGatewayDependencies, invocation: PaceInvocation): Admission {
  const agent = deps.registry.get(invocation.agentId);
  if (!agent) throw new Error(`Unknown Pace sub-agent "${invocation.agentId}".`);
  const capability = deps.registry.findCapability(agent.id, invocation.tool);
  if (!capability) {
    return refuse(invocation, agent.id, "CAPABILITY_NOT_OWNED", `The ${agent.label} sub-agent does not own "${invocation.tool}".`);
  }
  if (!invocation.envelope.permissions.includes(capability.requiredPermission)) {
    return refuse(invocation, agent.id, "PERMISSION_DENIED", "You do not have permission to perform this action.", capability);
  }
  const parsed = capability.inputSchema.safeParse(invocation.input);
  if (!parsed.success) {
    return refuse(invocation, agent.id, "INVALID_INPUT", `Invalid input for "${capability.tool}".`, capability);
  }
  return { admitted: true, agentId: agent.id, capability, input: parsed.data };
}

function admitCommit(deps: PaceGatewayDependencies, invocation: PaceInvocation): Admission {
  const admission = admit(deps, invocation);
  if (!admission.admitted || admission.capability.access === "commit") return admission;
  return refuse(
    invocation,
    admission.agentId,
    "INVALID_INPUT",
    `"${admission.capability.tool}" does not take an approval.`,
    admission.capability,
  );
}

async function holdUnapprovedCommit(
  deps: PaceGatewayDependencies,
  invocation: PaceInvocation,
  agentId: PaceSubAgentId,
  capability: PaceCapability,
  input: unknown,
): Promise<PaceInvocationOutcome | null> {
  const actionId = capability.actionRef!(input as never, null) ?? "";
  const scope = scopeOf(invocation.envelope);
  const { action } = await deps.services.getActionDetail(scope, actionId);
  if (APPROVED_STATUSES.includes(action.status)) return null;
  if (action.status === "DRAFT") await deps.services.requestApproval(scope, actionId);
  else if (action.status !== "WAITING_APPROVAL") {
    throw new ConflictError(`This action was ${action.status.toLowerCase()} and cannot be executed.`);
  }
  return { cause: null, result: approvalRequired(agentId, capability, invocation, actionId) };
}

function approvalRequired(
  agentId: PaceSubAgentId,
  capability: PaceCapability,
  invocation: PaceInvocation,
  actionId: string,
): PaceToolResult {
  return {
    agentId,
    tool: capability.tool,
    callId: invocation.callId,
    access: capability.access,
    status: "approval_required",
    data: null,
    digest: null,
    actionId,
    error: { code: "APPROVAL_REQUIRED", message: "A workspace member must approve this action before it runs." },
  };
}

function refuse(
  invocation: PaceInvocation,
  agentId: PaceSubAgentId,
  code: PaceRefusalCode,
  message: string,
  capability?: PaceCapability,
): Admission {
  const cause = code === "PERMISSION_DENIED" ? new AuthorizationError(message) : new ConflictError(message);
  return {
    admitted: false,
    outcome: { cause, result: errorResult(agentId, invocation, capability?.access ?? "read", "refused", { code, message }) },
  };
}

function failure(
  agentId: PaceSubAgentId,
  capability: PaceCapability,
  invocation: PaceInvocation,
  input: unknown,
  cause: unknown,
): PaceInvocationOutcome {
  const [status, error] = classify(cause);
  const result = errorResult(agentId, invocation, capability.access, status, error);
  return { cause, result: { ...result, tool: capability.tool, actionId: safeActionRef(capability, input) } };
}

function classify(cause: unknown): readonly [PaceToolResultStatus, PaceAgentError] {
  if (cause instanceof AuthorizationError) {
    return ["refused", { code: "PERMISSION_DENIED", message: cause.message }];
  }
  if (cause instanceof ConflictError || cause instanceof NotFoundError) {
    return ["refused", { code: "DOMAIN_REJECTED", message: cause.message }];
  }
  return ["failed", { code: "EXECUTION_FAILED", message: "The tool could not complete." }];
}

function errorResult(
  agentId: PaceSubAgentId,
  invocation: PaceInvocation,
  access: PaceToolResult["access"],
  status: PaceToolResultStatus,
  error: PaceAgentError,
): PaceToolResult {
  return {
    agentId,
    tool: invocation.tool,
    callId: invocation.callId,
    access,
    status,
    data: null,
    digest: null,
    actionId: null,
    error,
  };
}

function safeActionRef(capability: PaceCapability, input: unknown): string | null {
  try {
    return capability.access === "commit" ? (capability.actionRef?.(input as never, null) ?? null) : null;
  } catch {
    return null;
  }
}

function scopeOf(envelope: PaceContextEnvelope) {
  return { actor: envelope.actor, workspaceId: envelope.workspaceId };
}

async function traced(
  deps: PaceGatewayDependencies,
  invocation: PaceInvocation,
  outcome: PaceInvocationOutcome,
): Promise<PaceInvocationOutcome> {
  const { result } = outcome;
  const capability = deps.registry.findCapability(result.agentId, result.tool);
  await emit(deps, invocation, {
    type: "tool.completed",
    agentId: result.agentId,
    tool: result.tool,
    callId: result.callId,
    access: result.access,
    stages: capability?.stages ?? [],
    status: result.status,
    digest: result.digest,
    actionId: result.actionId,
    errorCode: result.error?.code ?? null,
  });
  return outcome;
}

async function tracedApproval(
  deps: PaceGatewayDependencies,
  invocation: PaceInvocation,
  type: "approval.requested" | "approval.granted" | "approval.rejected" | "approval.denied",
  outcome: PaceInvocationOutcome,
): Promise<PaceInvocationOutcome> {
  const { result } = outcome;
  await emit(deps, invocation, {
    type,
    agentId: result.agentId,
    tool: result.tool,
    callId: result.callId,
    actionId: result.actionId,
    errorCode: type === "approval.denied" ? (result.error?.code ?? null) : null,
  });
  return outcome;
}

function emit(deps: PaceGatewayDependencies, invocation: PaceInvocation, detail: PaceTraceDetail): Promise<void> {
  return recordPaceTrace(deps.trace, createPaceTraceEvent(invocation.envelope, detail, (deps.now ?? (() => new Date()))()));
}
