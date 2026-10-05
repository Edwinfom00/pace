import { accountsSubAgent } from "@/modules/accounts/agent/accounts-sub-agent";
import { inboxSubAgent } from "@/modules/financial-inbox/agent/inbox-sub-agent";
import { insightsSubAgent } from "@/modules/insights/agent/insights-sub-agent";
import { plansSubAgent } from "@/modules/plans/agent/plans-sub-agent";
import { recurringSubAgent } from "@/modules/recurring/agent/recurring-sub-agent";
import { transactionsSubAgent } from "@/modules/transactions/agent/transactions-sub-agent";

import {
  PACE_SUB_AGENT_IDS,
  type PaceCapability,
  type PaceSubAgentDefinition,
  type PaceSubAgentId,
} from "./domain";

export type PaceCapabilityMetadata = Pick<
  PaceCapability,
  "tool" | "description" | "access" | "stages" | "requiredPermission" | "approval" | "domainServices"
>;

export interface PaceSubAgentMetadata {
  readonly id: PaceSubAgentId;
  readonly label: string;
  readonly description: string;
  readonly capabilities: readonly PaceCapabilityMetadata[];
}

export interface PaceCapabilityOwner {
  readonly agent: PaceSubAgentDefinition;
  readonly capability: PaceCapability;
}

export interface PaceSubAgentRegistry {
  readonly agents: readonly PaceSubAgentDefinition[];
  get(agentId: string): PaceSubAgentDefinition | null;
  findCapability(agentId: string, tool: string): PaceCapability | null;
  ownerOf(tool: string): PaceCapabilityOwner | null;
  describe(): readonly PaceSubAgentMetadata[];
}

export function createPaceSubAgentRegistry(
  definitions: readonly PaceSubAgentDefinition[],
): PaceSubAgentRegistry {
  const byId = new Map<string, PaceSubAgentDefinition>();
  const owners = new Map<string, PaceCapabilityOwner>();

  for (const agent of definitions) {
    if (byId.has(agent.id)) throw new Error(`Pace sub-agent "${agent.id}" is registered twice.`);
    if (!agent.instructions.trim()) throw new Error(`Pace sub-agent "${agent.id}" has no instructions.`);
    byId.set(agent.id, agent);

    for (const capability of agent.capabilities) {
      const owner = owners.get(capability.tool);
      if (owner) {
        throw new Error(
          `Tool "${capability.tool}" is owned by both "${owner.agent.id}" and "${agent.id}".`,
        );
      }
      assertCapabilityContract(agent.id, capability);
      owners.set(capability.tool, { agent, capability });
    }
  }

  const missing = PACE_SUB_AGENT_IDS.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new Error(`Pace sub-agents are missing: ${missing.join(", ")}.`);

  const agents = Object.freeze(PACE_SUB_AGENT_IDS.map((id) => byId.get(id)!));

  return {
    agents,
    get: (agentId) => byId.get(agentId) ?? null,
    findCapability: (agentId, tool) => {
      const owner = owners.get(tool);
      return owner && owner.agent.id === agentId ? owner.capability : null;
    },
    ownerOf: (tool) => owners.get(tool) ?? null,
    describe: () => agents.map(describeSubAgent),
  };
}

export function describeSubAgent(agent: PaceSubAgentDefinition): PaceSubAgentMetadata {
  return {
    id: agent.id,
    label: agent.label,
    description: agent.description,
    capabilities: agent.capabilities.map((capability) => ({
      tool: capability.tool,
      description: capability.description,
      access: capability.access,
      stages: capability.stages,
      requiredPermission: capability.requiredPermission,
      approval: capability.approval,
      domainServices: capability.domainServices,
    })),
  };
}

function assertCapabilityContract(agentId: string, capability: PaceCapability): void {
  const label = `${agentId}.${capability.tool}`;
  if (capability.domainServices.length === 0) {
    throw new Error(`Capability "${label}" must declare the canonical domain service it reuses.`);
  }
  if (capability.access === "read") {
    if (capability.approval !== "none") throw new Error(`Read capability "${label}" cannot require approval.`);
    return;
  }
  if (capability.requiredPermission !== "manage_ledger") {
    throw new Error(`Write capability "${label}" must require the manage_ledger permission.`);
  }
  if (capability.access === "prepare") {
    if (capability.approval !== "none" || !capability.stages.includes("PREPARE_ACTION")) {
      throw new Error(`Prepare capability "${label}" may only draft an action.`);
    }
    return;
  }
  const commitStages = ["VALIDATE", "APPROVAL", "EXECUTE", "VERIFY", "AUDIT"] as const;
  if (capability.approval !== "required" || commitStages.some((stage) => !capability.stages.includes(stage))) {
    throw new Error(`Commit capability "${label}" must run the full approval lifecycle.`);
  }
  if (!capability.actionRef) {
    throw new Error(`Commit capability "${label}" must reference the approved agent action.`);
  }
}

export const paceSubAgentRegistry = createPaceSubAgentRegistry([
  transactionsSubAgent,
  accountsSubAgent,
  recurringSubAgent,
  inboxSubAgent,
  plansSubAgent,
  insightsSubAgent,
]);
