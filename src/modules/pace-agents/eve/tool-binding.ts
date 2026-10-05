import { ConflictError } from "@/authorization/errors";
import { requirePaceEveScope } from "@/modules/agent-actions/eve-context";

import type { PaceContextEnvelope } from "../domain";
import { invokePaceCapability, requestPaceApproval, resolvePaceApproval, type PaceInvocationOutcome } from "../gateway";
import { paceSubAgentRegistry } from "../registry";
import { getPaceGatewayDependencies, resolveServerPaceContextEnvelope } from "../server";

type EveAuth = Parameters<typeof requirePaceEveScope>[0]["session"]["auth"]["current"];

interface EveExecuteContext {
  readonly session: { readonly id: string; readonly auth: { readonly current: EveAuth } };
  readonly callId: string;
}

interface EveApprovalRequestContext extends EveExecuteContext {
  readonly toolInput?: unknown;
}

interface EveApprovalResponseContext {
  readonly responder: EveAuth;
  readonly session: { readonly id: string };
  readonly request: { readonly callId: string; readonly toolInput?: unknown };
}


export function bindPaceEveTool(tool: string) {
  const owner = paceSubAgentRegistry.ownerOf(tool);
  if (!owner) throw new Error(`No Pace sub-agent owns the tool "${tool}".`);
  const { agent, capability } = owner;

  const invocation = (envelope: PaceContextEnvelope, callId: string, input: unknown) => ({
    agentId: agent.id,
    tool: capability.tool,
    input,
    envelope,
    callId,
  });

  return {
    agentId: agent.id,
    description: capability.description,
    inputSchema: capability.inputSchema,

    async execute(input: unknown, ctx: EveExecuteContext): Promise<unknown> {
      const envelope = await eveEnvelope(ctx.session.id, ctx.session.auth.current);
      const outcome = await invokePaceCapability(
        getPaceGatewayDependencies(),
        invocation(envelope, ctx.callId, input),
      );
      if (outcome.result.status === "approval_required") {
        throw new ConflictError("Only an approved action can be executed.");
      }
      return unwrap(outcome).data;
    },

    async requestApproval(
      ctx: EveApprovalRequestContext,
      deniedReason: string,
    ): Promise<"user-approval" | { readonly type: "denied"; readonly reason: string }> {
      try {
        const envelope = await eveEnvelope(ctx.session.id, ctx.session.auth.current);
        unwrap(
          await requestPaceApproval(getPaceGatewayDependencies(), invocation(envelope, ctx.callId, ctx.toolInput)),
          "approval_required",
        );
        return "user-approval";
      } catch (error) {
        return { type: "denied", reason: error instanceof Error ? error.message : deniedReason };
      }
    },

    async respondToApproval(
      ctx: EveApprovalResponseContext,
    ): Promise<{ readonly status: "allowed" } | { readonly status: "rejected"; readonly reason: string }> {
      try {
        const envelope = await eveEnvelope(ctx.session.id, ctx.responder);
        unwrap(
          await resolvePaceApproval(
            getPaceGatewayDependencies(),
            invocation(envelope, ctx.request.callId, ctx.request.toolInput),
            "approve",
          ),
        );
        return { status: "allowed" };
      } catch (error) {
        return {
          status: "rejected",
          reason: error instanceof Error ? error.message : "Approval could not be authorized.",
        };
      }
    },
  };
}

async function eveEnvelope(sessionId: string, auth: EveAuth): Promise<PaceContextEnvelope> {
  const scope = requirePaceEveScope({ session: { auth: { current: auth } } });
  const language = auth?.attributes?.preferredLanguage;
  return resolveServerPaceContextEnvelope({
    actor: scope.actor,
    workspaceId: scope.workspaceId,
    language: typeof language === "string" ? language : null,
    session: { runtime: "eve", id: sessionId },
  });
}

function unwrap(outcome: PaceInvocationOutcome, expected: "ok" | "approval_required" = "ok") {
  if (outcome.result.status === expected) return outcome.result;
  if (outcome.cause instanceof Error) throw outcome.cause;
  throw new Error(outcome.result.error?.message ?? "The tool could not complete.");
}
