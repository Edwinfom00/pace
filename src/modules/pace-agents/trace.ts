import { createHash } from "node:crypto";

import {
  PACE_ORCHESTRATOR_ID,
  type PaceCapabilityAccess,
  type PaceContextEnvelope,
  type PaceLifecycleStage,
  type PaceOrchestratorStatus,
  type PaceRefusalCode,
  type PaceRoute,
  type PaceRoutePlan,
  type PaceSubAgentId,
  type PaceSubAgentStatus,
  type PaceToolResultStatus,
} from "./domain";

interface PaceTraceBase {
  readonly at: string;
  readonly orchestrator: typeof PACE_ORCHESTRATOR_ID;
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: string;
  readonly runtime: string;
  readonly sessionId: string;
}

export type PaceTraceDetail =
  | {
      readonly type: "route.planned";
      readonly status: PaceRoutePlan["status"];
      readonly composition: PaceRoutePlan["composition"];
      readonly intent: PaceRoutePlan["intent"];
      readonly routes: readonly PaceRoute[];
    }
  | {
      readonly type: "tool.completed";
      readonly agentId: PaceSubAgentId;
      readonly tool: string;
      readonly callId: string;
      readonly access: PaceCapabilityAccess;
      readonly stages: readonly PaceLifecycleStage[];
      readonly status: PaceToolResultStatus;
      readonly digest: string | null;
      readonly actionId: string | null;
      readonly errorCode: PaceRefusalCode | null;
    }
  | {
      readonly type: "approval.requested" | "approval.granted" | "approval.rejected" | "approval.denied";
      readonly agentId: PaceSubAgentId;
      readonly tool: string;
      readonly callId: string;
      readonly actionId: string | null;
      readonly errorCode: PaceRefusalCode | null;
    }
  | {
      readonly type: "subagent.completed";
      readonly agentId: PaceSubAgentId;
      readonly status: PaceSubAgentStatus;
      readonly callIds: readonly string[];
    }
  | {
      readonly type: "orchestration.completed";
      readonly status: PaceOrchestratorStatus;
      readonly agents: readonly PaceSubAgentId[];
      readonly rejectedToolResults: number;
    };

export type PaceTraceEvent = PaceTraceBase & PaceTraceDetail;

export interface PaceTraceSink {
  record(event: PaceTraceEvent): void | Promise<void>;
}

export const noopPaceTraceSink: PaceTraceSink = { record() {} };

export function createInMemoryPaceTraceSink(): PaceTraceSink & { readonly events: PaceTraceEvent[] } {
  const events: PaceTraceEvent[] = [];
  return {
    events,
    record(event) {
      events.push(event);
    },
  };
}

export function createConsolePaceTraceSink(): PaceTraceSink {
  return {
    record(event) {
      console.info(`[pace-agent] ${JSON.stringify(event)}`);
    },
  };
}

export function combinePaceTraceSinks(...sinks: readonly PaceTraceSink[]): PaceTraceSink {
  return {
    async record(event) {
      for (const sink of sinks) await recordPaceTrace(sink, event);
    },
  };
}

export async function recordPaceTrace(sink: PaceTraceSink, event: PaceTraceEvent): Promise<void> {
  try {
    await sink.record(event);
  } catch {
    // Observability must never change what a tool returns or whether a write is refused.
  }
}

export function createPaceTraceEvent(
  envelope: PaceContextEnvelope,
  detail: PaceTraceDetail,
  now: Date,
): PaceTraceEvent {
  return {
    at: now.toISOString(),
    orchestrator: PACE_ORCHESTRATOR_ID,
    workspaceId: envelope.workspaceId,
    userId: envelope.actor.userId,
    role: envelope.role,
    runtime: envelope.session.runtime,
    sessionId: envelope.session.id,
    ...detail,
  };
}

/** A stable fingerprint of tool output, so a result can be matched to its trace without storing financial data. */
export function digestPaceData(data: unknown): string {
  return createHash("sha256").update(canonicalJson(data)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}
