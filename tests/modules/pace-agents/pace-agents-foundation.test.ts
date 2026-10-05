import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { AgentActionService } from "@/modules/agent-actions/agent-action-service";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { resolvePaceContextEnvelope } from "@/modules/pace-agents/context";
import { PACE_SUB_AGENT_IDS, paceSubAgentResultSchema, type PaceSubAgentResult } from "@/modules/pace-agents/domain";
import {
  createAgentActionDomainServices,
  type PaceDomainServices,
} from "@/modules/pace-agents/domain-services";
import { invokePaceCapability, resolvePaceApproval } from "@/modules/pace-agents/gateway";
import {
  composePaceResults,
  createPaceOrchestrator,
  type PaceSubAgentExecutor,
} from "@/modules/pace-agents/orchestrator";
import { renderSubAgentInstructions } from "@/modules/pace-agents/prompts";
import { paceSubAgentRegistry } from "@/modules/pace-agents/registry";
import { routePaceRequest } from "@/modules/pace-agents/routing";
import { createInMemoryPaceTraceSink } from "@/modules/pace-agents/trace";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryAgentActionRepository } from "../../support/in-memory-agent-action-repository";
import { InMemoryLedgerRepository } from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";
import { createAccountWithOpeningBalance } from "../../support/opening-balance";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const outsider: AuthenticatedActor = { userId: "outsider-1", email: "outsider@pace.test", name: "Outsider" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";
const fixedNow = () => new Date("2026-10-05T09:00:00.000Z");
const repoRoot = path.resolve(import.meta.dirname, "../../..");

type ServiceCall = { readonly method: string; readonly workspaceId: string; readonly userId: string };

async function createFixture() {
  const actions = new InMemoryAgentActionRepository();
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const actionService = new AgentActionService(actions, ledger, ledgerRecords, workspaces);

  for (const id of [workspaceOne, workspaceTwo]) {
    const now = new Date("2026-09-14T00:00:00.000Z");
    const workspace: WorkspaceRecord = {
      id,
      name: id,
      slug: id,
      type: "PERSONAL",
      createdByUserId: owner.userId,
      createdAt: now,
      updatedAt: now,
    };
    await workspaces.createWorkspaceWithOwner({
      workspace,
      preferences: { currency: "XAF", locale: "fr-CM", timezone: "Africa/Douala", weekStartsOn: 1 },
      owner: { workspaceId: id, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now },
      initialAccount: { id: `${id}-main`, workspaceId: id, name: "Main account", type: "CHECKING", currency: "XAF", createdByUserId: owner.userId },
    });
  }
  workspaces.addMembership({
    workspaceId: workspaceOne,
    userId: viewer.userId,
    role: "VIEWER",
    invitedByUserId: null,
    joinedAt: new Date(),
  });
  await createAccountWithOpeningBalance(ledger, owner, workspaceOne, {
    name: "Bank",
    type: "CHECKING",
    currency: "XAF",
    openingBalanceMinor: 100_000n,
  });

  const calls: ServiceCall[] = [];
  const read = (method: string, payload: (workspaceId: string) => unknown) =>
    async (scope: { actor: AuthenticatedActor; workspaceId: string }) => {
      calls.push({ method, workspaceId: scope.workspaceId, userId: scope.actor.userId });
      return payload(scope.workspaceId);
    };
  const money = (minorUnits: string) => ({ minorUnits, currency: "XAF" });

  const services: PaceDomainServices = {
    ...createAgentActionDomainServices(actionService),
    getRecentTransactions: read("getRecentTransactions", (workspaceId) => ({
      currency: "XAF",
      transactions: [{ id: `${workspaceId}-tx-1`, merchantName: "Yango", amount: money("3500") }],
    })),
    getExpenses: read("getExpenses", (workspaceId) => ({
      currency: "XAF",
      expenses: [{ id: `${workspaceId}-tx-1`, merchantName: "Yango", amount: money("3500") }],
    })),
    searchTransactions: read("searchTransactions", (workspaceId) => ({
      currency: "XAF",
      transactions: [{ id: `${workspaceId}-tx-1`, merchantName: "Yango", amount: money("3500") }],
    })),
    getTransactionDetail: read("getTransactionDetail", (workspaceId) => ({ id: `${workspaceId}-tx-1` })),
    getOverviewSummary: read("getOverviewSummary", () => ({ currency: "XAF", spending: money("248500") })),
    getAccounts: read("getAccounts", (workspaceId) => ({
      summary: [{ currency: "XAF", currentBalanceMinor: "100000", accountCount: 1 }],
      accounts: [{ id: `${workspaceId}-main`, currency: "XAF", currentBalanceMinor: "100000" }],
    })),
    getAccount: read("getAccount", (workspaceId) => ({ resolved: true, account: { id: `${workspaceId}-main` } })),
    getAccountMovements: read("getAccountMovements", (workspaceId) => ({ resolved: true, account: { id: `${workspaceId}-main` } })),
    compareAccountMovements: read("compareAccountMovements", () => ({ currencies: [] })),
    checkAccountSpendability: read("checkAccountSpendability", () => ({ resolved: true, canDebit: true })),
    getRecurringPayments: read("getRecurringPayments", () => ({ items: [{ id: "recurring-1", name: "Netflix" }] })),
    getRecurringPayment: read("getRecurringPayment", () => ({ resolved: true, recurring: { id: "recurring-1" } })),
    getRecurringSpending: read("getRecurringSpending", () => ({ basis: "ACTUAL_TRANSACTIONS", recurringSpending: money("8500") })),
    getUpcomingRecurring: read("getUpcomingRecurring", () => ({ basis: "PROJECTION", occurrences: [] })),
    getInboxItems: read("getInboxItems", () => ({ unresolvedCount: 1, items: [{ id: "inbox-1", status: "OPEN" }] })),
    getInsightContext: read("getInsightContext", (workspaceId) => ({ workspaceId, insights: [] })),
  };

  const trace = createInMemoryPaceTraceSink();
  const deps = { registry: paceSubAgentRegistry, services, trace, now: fixedNow };
  const envelopeFor = (actor: AuthenticatedActor, workspaceId: string, sessionId = "session-1") =>
    resolvePaceContextEnvelope(workspaces, {
      actor,
      workspaceId,
      language: "en",
      session: { runtime: "local", id: sessionId },
    });

  return { actions, calls, deps, envelopeFor, ledgerRecords, services, trace };
}

const readAll: Record<string, PaceSubAgentExecutor> = {
  transactions: async (_task, toolbox) => {
    await toolbox.call("get_recent_transactions", { limit: 5 });
    return { summary: "Recent activity." };
  },
  accounts: async (_task, toolbox) => {
    await toolbox.call("get_accounts", {});
  },
  recurring: async (_task, toolbox) => {
    await toolbox.call("get_recurring_payments", {});
  },
  inbox: async (_task, toolbox) => {
    await toolbox.call("get_inbox_items", {});
  },
  plans: async (_task, toolbox) => {
    await toolbox.call("get_plan_status", {});
  },
  insights: async (_task, toolbox) => {
    await toolbox.call("get_overview_summary", {});
  },
};

test("registry declares the six sub-agents with typed capability metadata", () => {
  assert.deepEqual(paceSubAgentRegistry.agents.map((agent) => agent.id), [...PACE_SUB_AGENT_IDS]);
  const metadata = paceSubAgentRegistry.describe();
  const tools = metadata.flatMap((agent) => agent.capabilities.map((capability) => capability.tool));
  assert.equal(new Set(tools).size, tools.length);

  for (const agent of metadata) {
    assert.ok(agent.capabilities.length > 0);
    for (const capability of agent.capabilities) {
      assert.ok(capability.domainServices.length > 0, `${capability.tool} reuses a domain service`);
      assert.equal(capability.approval, capability.access === "commit" ? "required" : "none");
      if (capability.access !== "read") assert.equal(capability.requiredPermission, "manage_ledger");
    }
  }
  assert.deepEqual(
    metadata.flatMap((agent) => agent.capabilities).filter((capability) => capability.access === "commit").map((capability) => capability.tool),
    ["submit_transaction_draft", "submit_account_draft", "submit_recurring_draft", "submit_plan_draft"],
  );

  const prompt = renderSubAgentInstructions(paceSubAgentRegistry);
  for (const agent of paceSubAgentRegistry.agents) assert.ok(prompt.includes(agent.instructions));
});

test("single-domain requests route to exactly one sub-agent in English, French, and German", () => {
  const cases = [
    ["I spent 3500 on a taxi", "transactions", "write"],
    ["Show my subscriptions", "recurring", "read"],
    ["Quel est le solde de mes comptes ?", "accounts", "read"],
    ["Was steht in meinem Posteingang?", "inbox", "read"],
    ["Set a 80k budget for dining", "plans", "write"],
    ["Give me a report of the trends", "insights", "read"],
  ] as const;

  for (const [request, agentId, intent] of cases) {
    const plan = routePaceRequest(paceSubAgentRegistry, request);
    assert.equal(plan.status, "routed", request);
    assert.equal(plan.composition, "single", request);
    assert.deepEqual(plan.routes.map((route) => route.agentId), [agentId], request);
    assert.equal(plan.intent, intent, request);
    assert.equal(plan.fallback, null);
  }
});

test("multi-domain requests route to every owning sub-agent in a stable order", () => {
  const request = "What is my account balance, am I over budget, and which subscriptions renew?";
  const plan = routePaceRequest(paceSubAgentRegistry, request);

  assert.equal(plan.composition, "multi");
  assert.deepEqual(plan.routes.map((route) => route.agentId), ["accounts", "recurring", "plans"]);
  assert.deepEqual(plan.routes.map((route) => route.score), [2, 1, 1]);
  assert.deepEqual(routePaceRequest(paceSubAgentRegistry, request), plan);
  assert.deepEqual(routePaceRequest(paceSubAgentRegistry, `  ${request.toUpperCase()}  `).routes, plan.routes);
});

test("unknown intent falls back to clarification without touching a sub-agent or a service", async () => {
  const { calls, deps, envelopeFor, trace } = await createFixture();
  const plan = routePaceRequest(paceSubAgentRegistry, "Tell me a joke about penguins");
  assert.equal(plan.status, "fallback");
  assert.deepEqual(plan.routes, []);
  assert.deepEqual(plan.fallback, { kind: "clarify", availableAgents: [...PACE_SUB_AGENT_IDS] });
  assert.equal(routePaceRequest(paceSubAgentRegistry, "   ").status, "fallback");

  const result = await createPaceOrchestrator({ ...deps, executors: readAll }).handle({
    request: "Tell me a joke about penguins",
    envelope: await envelopeFor(owner, workspaceOne),
  });
  assert.equal(result.status, "clarification_required");
  assert.deepEqual(result.results, []);
  assert.deepEqual(result.toolsUsed, []);
  assert.deepEqual(calls, []);
  assert.deepEqual(trace.events.map((event) => event.type), ["route.planned", "orchestration.completed"]);

  const contextual = routePaceRequest(paceSubAgentRegistry, "What about this one?", { preferredAgent: "plans" });
  assert.deepEqual(contextual.routes, [{ agentId: "plans", score: 0, matched: [], reason: "context" }]);
});

test("the context envelope is bound to a real membership and cannot cross workspaces", async () => {
  const { calls, deps, envelopeFor } = await createFixture();
  await assert.rejects(envelopeFor(outsider, workspaceOne), AuthorizationError);
  await assert.rejects(envelopeFor(viewer, workspaceTwo), AuthorizationError);

  const envelope = await envelopeFor(owner, workspaceOne);
  assert.equal(envelope.workspaceId, workspaceOne);
  assert.equal(envelope.currency, "XAF");
  assert.equal(Object.isFrozen(envelope), true);

  const smuggled = await invokePaceCapability(deps, {
    agentId: "transactions",
    tool: "get_recent_transactions",
    input: { limit: 5, workspaceId: workspaceTwo },
    envelope,
    callId: "call-1",
  });
  assert.equal(smuggled.result.error?.code, "INVALID_INPUT");
  assert.deepEqual(calls, []);

  const read = await invokePaceCapability(deps, {
    agentId: "transactions",
    tool: "get_recent_transactions",
    input: { limit: 5 },
    envelope,
    callId: "call-2",
  });
  assert.deepEqual(calls, [{ method: "getRecentTransactions", workspaceId: workspaceOne, userId: owner.userId }]);
  assert.match(JSON.stringify(read.result.data), /workspace-one-tx-1/);

  const foreignDraft = await invokePaceCapability(deps, {
    agentId: "transactions",
    tool: "create_transaction_draft",
    input: { kind: "EXPENSE", amountText: "3500", sourceText: "taxi 3500" },
    envelope: await envelopeFor(owner, workspaceTwo, "session-2"),
    callId: "call-3",
  });
  assert.equal(foreignDraft.result.status, "ok");
  const leaked = await invokePaceCapability(deps, {
    agentId: "transactions",
    tool: "submit_transaction_draft",
    input: { actionId: foreignDraft.result.actionId },
    envelope,
    callId: "call-4",
  });
  assert.equal(leaked.result.status, "refused");
  assert.equal(leaked.result.error?.code, "DOMAIN_REJECTED");
});

test("a viewer can read through sub-agents but every write capability is refused", async () => {
  const { actions, calls, deps, envelopeFor, trace } = await createFixture();
  const envelope = await envelopeFor(viewer, workspaceOne);
  assert.equal(envelope.role, "VIEWER");
  assert.deepEqual(envelope.permissions, ["read"]);

  const read = await invokePaceCapability(deps, {
    agentId: "accounts", tool: "get_accounts", input: {}, envelope, callId: "call-1",
  });
  assert.equal(read.result.status, "ok");

  const attempts = [
    ["transactions", "create_transaction_draft", { kind: "EXPENSE", amountText: "3500", sourceText: "taxi 3500" }],
    ["transactions", "submit_transaction_draft", { actionId: crypto.randomUUID() }],
    ["plans", "create_plan_draft", { actionType: "BUDGET_CREATE", sourceText: "budget 80k" }],
    ["plans", "submit_plan_draft", { actionId: crypto.randomUUID() }],
  ] as const;
  for (const [agentId, tool, input] of attempts) {
    const outcome = await invokePaceCapability(deps, { agentId, tool, input, envelope, callId: `write-${tool}` });
    assert.equal(outcome.result.status, "refused", tool);
    assert.equal(outcome.result.error?.code, "PERMISSION_DENIED", tool);
    assert.ok(outcome.cause instanceof AuthorizationError);
  }
  assert.deepEqual(calls.map((call) => call.method), ["getAccounts"]);
  assert.equal(actions.actions.size, 0);
  assert.equal(trace.events.filter((event) => event.type === "tool.completed" && event.errorCode === "PERMISSION_DENIED").length, 4);
});

test("a read executes immediately with no approval step", async () => {
  const { deps, envelopeFor, trace } = await createFixture();
  const result = await createPaceOrchestrator({ ...deps, executors: readAll }).handle({
    request: "Show my subscriptions",
    envelope: await envelopeFor(owner, workspaceOne),
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.pendingApprovals, []);
  assert.deepEqual(result.toolsUsed, [{ agentId: "recurring", tool: "get_recurring_payments", callId: "recurring:1" }]);
  assert.equal(trace.events.some((event) => event.type.startsWith("approval.")), false);
});

test("an AI-initiated write is drafted, parked for approval, and only executed after a member approves", async () => {
  const { actions, deps, envelopeFor, ledgerRecords, trace } = await createFixture();
  const envelope = await envelopeFor(owner, workspaceOne);
  const before = ledgerRecords.transactions.size;
  let actionId = "";

  const writer: PaceSubAgentExecutor = async (_task, toolbox) => {
    await toolbox.call("get_transaction_context", {});
    const draft = await toolbox.call("create_transaction_draft", {
      kind: "EXPENSE", amountText: "3500", sourceText: "taxi 3500",
    });
    actionId = draft.actionId ?? "";
    await toolbox.call("submit_transaction_draft", { actionId });
    await toolbox.call("submit_transaction_draft", { actionId });
  };
  const result = await createPaceOrchestrator({ ...deps, executors: { transactions: writer } }).handle({
    request: "I spent 3500 on a taxi",
    envelope,
  });

  assert.equal(result.status, "approval_required");
  assert.deepEqual(result.pendingApprovals, [
    { agentId: "transactions", tool: "submit_transaction_draft", actionId },
    { agentId: "transactions", tool: "submit_transaction_draft", actionId },
  ]);
  assert.deepEqual(result.results[0]?.toolResults.map((toolResult) => toolResult.status), [
    "ok", "ok", "approval_required", "approval_required",
  ]);
  assert.equal(ledgerRecords.transactions.size, before);
  assert.equal((await actions.findAction(workspaceOne, actionId))?.status, "WAITING_APPROVAL");

  const submit = { agentId: "transactions", tool: "submit_transaction_draft", input: { actionId }, envelope } as const;
  const viewerApproval = await resolvePaceApproval(
    deps,
    { ...submit, envelope: await envelopeFor(viewer, workspaceOne), callId: "approve-viewer" },
    "approve",
  );
  assert.equal(viewerApproval.result.error?.code, "PERMISSION_DENIED");
  assert.equal(ledgerRecords.transactions.size, before);

  const approval = await resolvePaceApproval(deps, { ...submit, callId: "approve-owner" }, "approve");
  assert.deepEqual(approval.result.data, { actionId, status: "APPROVED" });
  const executed = await invokePaceCapability(deps, { ...submit, callId: "execute" });
  assert.equal(executed.result.status, "ok");
  assert.equal(ledgerRecords.transactions.size, before + 1);
  assert.equal((await actions.findAction(workspaceOne, actionId))?.status, "COMPLETED");

  assert.deepEqual(
    (await actions.listAudit(workspaceOne, actionId)).map((event) => event.event).slice(0, 3),
    ["DRAFT_CREATED", "APPROVAL_REQUESTED", "APPROVED"],
  );
  const lifecycle = trace.events.flatMap((event) =>
    event.type === "tool.completed" || event.type.startsWith("approval.")
      ? [`${event.type}:${"tool" in event ? event.tool : ""}:${"status" in event ? event.status : ""}`]
      : [],
  );
  assert.deepEqual(lifecycle, [
    "tool.completed:get_transaction_context:ok",
    "tool.completed:create_transaction_draft:ok",
    "tool.completed:submit_transaction_draft:approval_required",
    "tool.completed:submit_transaction_draft:approval_required",
    "approval.denied:submit_transaction_draft:",
    "approval.granted:submit_transaction_draft:",
    "tool.completed:submit_transaction_draft:ok",
  ]);
});

test("a rejected action can never be executed by a sub-agent", async () => {
  const { deps, envelopeFor, ledgerRecords } = await createFixture();
  const envelope = await envelopeFor(owner, workspaceOne);
  const before = ledgerRecords.transactions.size;
  const draft = await invokePaceCapability(deps, {
    agentId: "transactions",
    tool: "create_transaction_draft",
    input: { kind: "EXPENSE", amountText: "3500", sourceText: "taxi 3500" },
    envelope,
    callId: "draft",
  });
  const submit = {
    agentId: "transactions", tool: "submit_transaction_draft", input: { actionId: draft.result.actionId }, envelope,
  } as const;
  await invokePaceCapability(deps, { ...submit, callId: "submit" });
  await resolvePaceApproval(deps, { ...submit, callId: "reject" }, "reject");

  const executed = await invokePaceCapability(deps, { ...submit, callId: "execute" });
  assert.equal(executed.result.status, "refused");
  assert.equal(executed.result.error?.code, "DOMAIN_REJECTED");
  assert.equal(ledgerRecords.transactions.size, before);
});

test("a sub-agent cannot reach data except through its own capabilities and their declared domain services", async () => {
  const { calls, deps, envelopeFor } = await createFixture();
  const envelope = await envelopeFor(owner, workspaceOne);

  const poached = await invokePaceCapability(deps, {
    agentId: "inbox", tool: "submit_transaction_draft", input: { actionId: crypto.randomUUID() }, envelope, callId: "poach-1",
  });
  assert.equal(poached.result.error?.code, "CAPABILITY_NOT_OWNED");
  const unknown = await invokePaceCapability(deps, {
    agentId: "accounts", tool: "run_sql", input: { sql: "select * from ledger_transactions" }, envelope, callId: "poach-2",
  });
  assert.equal(unknown.result.error?.code, "CAPABILITY_NOT_OWNED");
  assert.deepEqual(calls, []);

  const sampleInputs: Record<string, unknown> = {
    create_transaction_draft: { kind: "EXPENSE", amountText: "3500", sourceText: "taxi 3500" },
    edit_transaction_draft: { actionId: crypto.randomUUID(), amountText: "4000" },
    get_transaction: { transactionId: crypto.randomUUID() },
    create_transaction_change_draft: { transactionId: crypto.randomUUID(), amountText: "4000", sourceText: "it was 4000" },
    submit_transaction_draft: { actionId: crypto.randomUUID() },
    get_account: { accountName: "Bank" },
    get_account_movements: { accountName: "Bank" },
    check_account_spendability: { accountName: "Bank", amountText: "3500" },
    create_account_draft: { name: "Canada", type: "SAVINGS", sourceText: "create a savings account called Canada" },
    create_account_change_draft: { operation: "ARCHIVE", accountName: "Bank", sourceText: "archive Bank" },
    submit_account_draft: { actionId: crypto.randomUUID() },
    get_recurring_payment: { recurringName: "Netflix" },
    create_recurring_draft: { direction: "EXPENSE", name: "Rent", amountText: "180,000", frequency: "monthly", sourceText: "monthly rent of 180,000" },
    create_recurring_change_draft: { operation: "PAUSE", recurringName: "Netflix", sourceText: "pause Netflix" },
    submit_recurring_draft: { actionId: crypto.randomUUID() },
    create_plan_draft: { actionType: "BUDGET_CREATE", sourceText: "budget 80k" },
    edit_plan_draft: { actionId: crypto.randomUUID(), amountText: "90k" },
    submit_plan_draft: { actionId: crypto.randomUUID() },
  };
  for (const agent of paceSubAgentRegistry.agents) {
    for (const capability of agent.capabilities) {
      const touched = new Set<string>();
      const services = new Proxy({} as PaceDomainServices, {
        get: (_target, method: string) => async () => {
          touched.add(method);
          return { id: "action-1", status: "DRAFT", draft: { missingFields: [] } };
        },
      });
      const input = capability.inputSchema.parse(sampleInputs[capability.tool] ?? {});
      await capability.run(input as never, { envelope, services, callId: "call", idempotencyKey: "key" });
      assert.ok(touched.size > 0, `${capability.tool} goes through a domain service`);
      for (const method of touched) {
        assert.ok((capability.domainServices as readonly string[]).includes(method), `${capability.tool} → ${method}`);
      }
    }
  }

  const forbidden = /@\/db\/|drizzle|repositories\/|neonSql|\bsql`/;
  const agentSources = [
    "src/modules/transactions/agent",
    "src/modules/accounts/agent",
    "src/modules/recurring/agent",
    "src/modules/financial-inbox/agent",
    "src/modules/plans/agent",
    "src/modules/insights/agent",
    "agent/tools",
  ].flatMap((directory) =>
    readdirSync(path.join(repoRoot, directory)).map((file) => path.join(repoRoot, directory, file)),
  );
  for (const file of agentSources) {
    assert.equal(forbidden.test(readFileSync(file, "utf8")), false, `${file} must not reach the database`);
  }

  const eveTools = readdirSync(path.join(repoRoot, "agent/tools")).filter((file) => file !== "route_pace_request.ts");
  assert.deepEqual(
    eveTools.map((file) => file.replace(/\.ts$/, "")).sort(),
    paceSubAgentRegistry.agents.flatMap((agent) => agent.capabilities.map((capability) => capability.tool)).sort(),
  );
  for (const file of eveTools) {
    const source = readFileSync(path.join(repoRoot, "agent/tools", file), "utf8");
    const tool = file.replace(/\.ts$/, "");
    assert.ok(source.includes(`bindPaceEveTool("${tool}")`), `${tool} is bound to its owning sub-agent`);
    const commits = paceSubAgentRegistry.ownerOf(tool)?.capability.access === "commit";
    assert.equal(/approval:\s*{/.test(source), commits, `${tool} approval gate`);
  }
});

test("the orchestrator combines sub-agent results by reference and drops anything it cannot trace", async () => {
  const { deps, envelopeFor, services, trace } = await createFixture();
  const envelope = await envelopeFor(owner, workspaceOne);
  const request = "What is my account balance and which subscriptions renew?";
  const result = await createPaceOrchestrator({ ...deps, executors: readAll }).handle({ request, envelope });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.results.map((entry) => entry.agentId), ["accounts", "recurring"]);
  assert.deepEqual(result.rejected, []);
  for (const entry of result.results) assert.equal(paceSubAgentResultSchema.safeParse(entry).success, true);
  assert.deepEqual(
    result.results[0]?.toolResults[0]?.data,
    await services.getAccounts({ actor: owner, workspaceId: workspaceOne }),
  );
  assert.equal(JSON.stringify(result).includes("Netflix"), true);

  const honest = result.results[0]!;
  const original = honest.toolResults[0]!;
  const tampered: PaceSubAgentResult = {
    ...honest,
    toolResults: [
      { ...original, data: { summary: [{ currency: "XAF", currentBalanceMinor: "999999999", accountCount: 1 }] } },
      { ...original, callId: "accounts:99", tool: "get_accounts", data: { accounts: [{ id: "invented" }] } },
    ],
  };
  const impersonated: PaceSubAgentResult = { ...result.results[1]!, agentId: "plans" };
  const composed = composePaceResults(result.plan, [tampered, impersonated], trace.events);

  assert.deepEqual(composed.rejected.map((entry) => entry.reason), [
    "DIGEST_MISMATCH",
    "UNTRACED_TOOL_RESULT",
    "FOREIGN_SUB_AGENT",
  ]);
  assert.deepEqual(composed.toolsUsed, []);
  assert.equal(composed.status, "partial");
  assert.equal(JSON.stringify(composed.results).includes("999999999"), false);
  assert.equal(JSON.stringify(composed.results).includes("invented"), false);
});

test("tool results and traces propagate deterministically from service to orchestrator result", async () => {
  const run = async () => {
    const { deps, envelopeFor, trace } = await createFixture();
    const result = await createPaceOrchestrator({ ...deps, executors: readAll }).handle({
      request: "Compare my spending trend with my budget and my account balance",
      envelope: await envelopeFor(owner, workspaceOne),
    });
    return { result, events: trace.events };
  };
  const first = await run();
  const second = await run();

  assert.deepEqual(first.result, second.result);
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.result.toolsUsed, [
    { agentId: "insights", tool: "get_overview_summary", callId: "insights:1" },
    { agentId: "accounts", tool: "get_accounts", callId: "accounts:1" },
    { agentId: "plans", tool: "get_plan_status", callId: "plans:1" },
  ]);
  assert.deepEqual(first.events.map((event) => event.type), [
    "route.planned",
    "tool.completed", "subagent.completed",
    "tool.completed", "subagent.completed",
    "tool.completed", "subagent.completed",
    "orchestration.completed",
  ]);
  for (const event of first.events) {
    assert.equal(event.workspaceId, workspaceOne);
    assert.equal(event.userId, owner.userId);
    assert.equal(event.sessionId, "session-1");
    assert.equal(JSON.stringify(event).includes("248500"), false);
  }
  const toolEvents = first.events.filter((event) => event.type === "tool.completed");
  assert.deepEqual(
    toolEvents.map((event) => event.digest),
    first.result.results.map((entry) => entry.toolResults[0]?.digest),
  );
});
