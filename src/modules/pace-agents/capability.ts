import type { z } from "zod";

import type { WorkspaceAction } from "@/authorization/workspace-permissions";

import type { PaceDomainServices } from "./domain-services";
import type {
  PaceCapability,
  PaceCapabilityAccess,
  PaceCapabilityCall,
  PaceLifecycleStage,
  PaceSubAgentDefinition,
} from "./domain";

export function definePaceCapability<TSchema extends z.ZodType>(config: {
  readonly tool: string;
  readonly description: string;
  readonly inputSchema: TSchema;
  readonly access: PaceCapabilityAccess;
  readonly stages: readonly PaceLifecycleStage[];
  readonly requiredPermission: WorkspaceAction;
  readonly domainServices: readonly (keyof PaceDomainServices)[];
  readonly run: (input: z.output<TSchema>, call: PaceCapabilityCall) => Promise<unknown>;
  readonly actionRef?: (input: z.output<TSchema>, output: unknown) => string | null;
}): PaceCapability {
  return { ...config, approval: config.access === "commit" ? "required" : "none" };
}

export function definePaceSubAgent(definition: PaceSubAgentDefinition): PaceSubAgentDefinition {
  return definition;
}

export function scopeOf(call: PaceCapabilityCall) {
  return { actor: call.envelope.actor, workspaceId: call.envelope.workspaceId };
}

export function eveCallReference(call: PaceCapabilityCall) {
  return {
    idempotencyKey: call.idempotencyKey,
    eveSessionId: call.envelope.session.runtime === "eve" ? call.envelope.session.id : null,
    eveCallId: call.envelope.session.runtime === "eve" ? call.callId : null,
  };
}

export function actionIdOfOutput(_input: unknown, output: unknown): string | null {
  if (typeof output !== "object" || output === null) return null;
  const actionId = (output as { actionId?: unknown }).actionId;
  return typeof actionId === "string" ? actionId : null;
}
