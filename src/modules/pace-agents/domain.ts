import { z } from "zod";

import type { AuthenticatedActor } from "@/authorization/session";
import type { WorkspaceAction, WorkspaceRole } from "@/authorization/workspace-permissions";

import type { PaceDomainServices } from "./domain-services";

export const PACE_ORCHESTRATOR_ID = "pace";

export const PACE_SUB_AGENT_IDS = [
  "transactions",
  "accounts",
  "recurring",
  "inbox",
  "plans",
  "insights",
] as const;
export type PaceSubAgentId = (typeof PACE_SUB_AGENT_IDS)[number];

export const PACE_LIFECYCLE_STAGES = [
  "UNDERSTAND",
  "PREPARE_ACTION",
  "VALIDATE",
  "APPROVAL",
  "EXECUTE",
  "VERIFY",
  "AUDIT",
] as const;
export type PaceLifecycleStage = (typeof PACE_LIFECYCLE_STAGES)[number];

export const PACE_CAPABILITY_ACCESS = ["read", "prepare", "commit"] as const;
export type PaceCapabilityAccess = (typeof PACE_CAPABILITY_ACCESS)[number];

export type PaceAgentRuntime = "eve" | "local";

export interface PaceContextEnvelope {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly role: WorkspaceRole;
  readonly permissions: readonly WorkspaceAction[];
  readonly currency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly language: string | null;
  readonly session: { readonly runtime: PaceAgentRuntime; readonly id: string };
}

export interface PaceCapabilityCall {
  readonly envelope: PaceContextEnvelope;
  readonly services: PaceDomainServices;
  readonly callId: string;
  readonly idempotencyKey: string;
}

export interface PaceCapability {
  readonly tool: string;
  readonly description: string;
  readonly inputSchema: z.ZodType;
  readonly access: PaceCapabilityAccess;
  readonly stages: readonly PaceLifecycleStage[];
  readonly requiredPermission: WorkspaceAction;
  readonly approval: "none" | "required";
  readonly domainServices: readonly (keyof PaceDomainServices)[];
  readonly run: (input: never, call: PaceCapabilityCall) => Promise<unknown>;
  readonly actionRef?: (input: never, output: unknown) => string | null;
}

export interface PaceIntentSignals {
  readonly en: readonly string[];
  readonly fr: readonly string[];
  readonly de: readonly string[];
}

export interface PaceSubAgentDefinition {
  readonly id: PaceSubAgentId;
  readonly label: string;
  readonly description: string;
  readonly instructions: string;
  readonly intents: PaceIntentSignals;
  readonly capabilities: readonly PaceCapability[];
}

export const PACE_TOOL_RESULT_STATUSES = ["ok", "approval_required", "refused", "failed"] as const;
export type PaceToolResultStatus = (typeof PACE_TOOL_RESULT_STATUSES)[number];

export const PACE_REFUSAL_CODES = [
  "CAPABILITY_NOT_OWNED",
  "PERMISSION_DENIED",
  "INVALID_INPUT",
  "APPROVAL_REQUIRED",
  "DOMAIN_REJECTED",
  "EXECUTOR_UNAVAILABLE",
  "EXECUTION_FAILED",
] as const;
export type PaceRefusalCode = (typeof PACE_REFUSAL_CODES)[number];

const paceErrorSchema = z.object({ code: z.enum(PACE_REFUSAL_CODES), message: z.string() }).strict();
const pacePendingApprovalSchema = z
  .object({ agentId: z.enum(PACE_SUB_AGENT_IDS), tool: z.string(), actionId: z.string() })
  .strict();

export const paceToolResultSchema = z
  .object({
    agentId: z.enum(PACE_SUB_AGENT_IDS),
    tool: z.string(),
    callId: z.string(),
    access: z.enum(PACE_CAPABILITY_ACCESS),
    status: z.enum(PACE_TOOL_RESULT_STATUSES),
    data: z.unknown(),
    digest: z.string().nullable(),
    actionId: z.string().nullable(),
    error: paceErrorSchema.nullable(),
  })
  .strict();
export type PaceToolResult = z.infer<typeof paceToolResultSchema>;
export type PacePendingApproval = z.infer<typeof pacePendingApprovalSchema>;
export type PaceAgentError = z.infer<typeof paceErrorSchema>;

export const PACE_SUB_AGENT_STATUSES = [
  "completed",
  "approval_required",
  "needs_input",
  "refused",
  "failed",
] as const;
export type PaceSubAgentStatus = (typeof PACE_SUB_AGENT_STATUSES)[number];

export const paceSubAgentResultSchema = z
  .object({
    agentId: z.enum(PACE_SUB_AGENT_IDS),
    status: z.enum(PACE_SUB_AGENT_STATUSES),
    summary: z.string().nullable(),
    toolResults: z.array(paceToolResultSchema),
    pendingApprovals: z.array(pacePendingApprovalSchema),
    error: paceErrorSchema.nullable(),
  })
  .strict();
export type PaceSubAgentResult = z.infer<typeof paceSubAgentResultSchema>;

export interface PaceRoute {
  readonly agentId: PaceSubAgentId;
  readonly score: number;
  readonly matched: readonly string[];
  readonly reason: "intent" | "context";
}

export interface PaceRoutePlan {
  readonly status: "routed" | "fallback";
  readonly composition: "none" | "single" | "multi";
  readonly intent: "read" | "write";
  readonly routes: readonly PaceRoute[];
  readonly fallback: { readonly kind: "clarify"; readonly availableAgents: readonly PaceSubAgentId[] } | null;
}

export const PACE_ORCHESTRATOR_STATUSES = [
  "completed",
  "approval_required",
  "clarification_required",
  "partial",
  "failed",
] as const;
export type PaceOrchestratorStatus = (typeof PACE_ORCHESTRATOR_STATUSES)[number];

export interface PaceRejectedToolResult {
  readonly agentId: PaceSubAgentId;
  readonly tool: string;
  readonly callId: string;
  readonly reason: "UNTRACED_TOOL_RESULT" | "DIGEST_MISMATCH" | "FOREIGN_SUB_AGENT";
}

export interface PaceOrchestratorResult {
  readonly status: PaceOrchestratorStatus;
  readonly plan: PaceRoutePlan;
  readonly results: readonly PaceSubAgentResult[];
  readonly pendingApprovals: readonly PacePendingApproval[];
  readonly rejected: readonly PaceRejectedToolResult[];
  readonly toolsUsed: readonly { readonly agentId: PaceSubAgentId; readonly tool: string; readonly callId: string }[];
}
