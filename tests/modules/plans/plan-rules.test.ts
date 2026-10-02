import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { AuthorizationError, ConflictError, DomainConflictError, NotFoundError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import type { LedgerTransactionRecord } from "@/modules/ledger/domain";
import { LedgerService } from "@/modules/ledger/ledger-service";
import type { RuleCondition } from "@/modules/plans/rules/domain";
import { compareRulePrecedence } from "@/modules/plans/rules/rule-evaluator";
import { RulesService } from "@/modules/plans/rules/rule-service";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_SALARY_ID,
  SYSTEM_TRANSPORT_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryRulesRepository } from "../../support/in-memory-rules-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const outsider: AuthenticatedActor = { userId: "outsider-1", email: "outsider@pace.test", name: "Outsider" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";

const expenseOnly: RuleCondition = { field: "TRANSACTION_KIND", operator: "IS_ONE_OF", values: ["EXPENSE"] };
const merchantContains = (value: string): RuleCondition => ({ field: "COUNTERPARTY", operator: "CONTAINS", value });

async function createFixture() {
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const inboxRecords = new InMemoryFinancialInboxRepository();
  const ruleRecords = new InMemoryRulesRepository();
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const inbox = new FinancialInboxService(inboxRecords, ledgerRecords, workspaces, ledger);
  const rules = new RulesService(ruleRecords, ledgerRecords, ledger, inbox, workspaces);
  const now = new Date("2026-09-01T00:00:00.000Z");
  for (const id of [workspaceOne, workspaceTwo]) {
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
      preferences: { currency: "XAF", locale: "fr-CM", timezone: "UTC", weekStartsOn: 1 },
      owner: { workspaceId: id, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now },
      initialAccount: { id: `${id}-main`, workspaceId: id, name: "Main account", type: "CHECKING", currency: "XAF", createdByUserId: owner.userId },
    });
  }
  workspaces.addMembership({ workspaceId: workspaceOne, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: now });
  const cash = await ledger.createAccount(owner, workspaceOne, { name: "Cash", type: "CASH", currency: "XAF" });
  const savings = await ledger.createAccount(owner, workspaceOne, { name: "Savings", type: "SAVINGS", currency: "XAF" });
  const otherCash = await ledger.createAccount(owner, workspaceTwo, { name: "Other cash", type: "CASH", currency: "XAF" });

  const expense = (input: { merchant?: string; note?: string; categoryId?: string; workspaceId?: string; accountId?: string; source?: Record<string, string> } = {}) =>
    ledger.createTransaction(owner, input.workspaceId ?? workspaceOne, {
      kind: "EXPENSE",
      amountMinor: "2500",
      currency: "XAF",
      occurredAt: "2026-09-10T12:00:00.000Z",
      accountId: input.accountId ?? cash.id,
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.merchant ? { merchantName: input.merchant } : {}),
      ...(input.note ? { note: input.note } : {}),
      source: input.source ?? { provider: "manual", origin: "MANUAL" },
    });

  let keySequence = 0;
  const key = () => `rule-key-${++keySequence}`;
  const createRule = (input: {
    name?: string;
    priority?: number;
    conditions: RuleCondition[];
    action: { type: "ASSIGN_CATEGORY"; categoryId: string } | { type: "ROUTE_FOR_REVIEW" };
    enabled?: boolean;
    workspaceId?: string;
  }) =>
    rules.createRule(owner, input.workspaceId ?? workspaceOne, {
      name: input.name ?? "Rule",
      priority: input.priority ?? 100,
      trigger: "TRANSACTION_CREATED",
      conditions: input.conditions,
      action: input.action,
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      idempotencyKey: key(),
    });

  const financialSnapshot = async () => ({
    count: ledgerRecords.transactions.size,
    rows: [...ledgerRecords.transactions.values()]
      .map(financialFields)
      .sort((left, right) => left.id.localeCompare(right.id)),
    balances: [
      ...(await ledger.getWorkspaceAccountBalances(owner, { workspaceId: workspaceOne })),
      ...(await ledger.getWorkspaceAccountBalances(owner, { workspaceId: workspaceTwo })),
    ].map((balance) => `${balance.accountId}:${balance.currentBalanceMinor}:${balance.availableBalanceMinor}`),
  });

  return { cash, savings, otherCash, ledger, ledgerRecords, workspaces, inbox, inboxRecords, rules, ruleRecords, expense, createRule, key, financialSnapshot };
}

function financialFields(transaction: LedgerTransactionRecord) {
  return {
    id: transaction.id,
    kind: transaction.kind,
    status: transaction.status,
    amountMinor: transaction.amountMinor.toString(),
    currency: transaction.currency,
    accountId: transaction.accountId,
    transferAccountId: transaction.transferAccountId,
    occurredAt: transaction.occurredAt.toISOString(),
    transferGroupId: transaction.transferGroupId,
    reversalOfTransactionId: transaction.reversalOfTransactionId,
    refundedTransactionId: transaction.refundedTransactionId,
  };
}

test("a matching rule assigns a category through the canonical ledger update and is audited", async () => {
  const { createRule, expense, ledgerRecords, rules } = await createFixture();
  const rule = await createRule({
    name: "Supermarkets",
    conditions: [expenseOnly, merchantContains("  CARREFOUR ")],
    action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_GROCERIES_ID },
  });
  assert.deepEqual(rule.conditions[1], { field: "COUNTERPARTY", operator: "CONTAINS", value: "carrefour" });
  const transaction = await expense({ merchant: "Carrefour Bonamoussadi" });

  const result = await rules.applyRulesToTransaction(owner, workspaceOne, transaction.id);

  assert.equal(result.status, "EVALUATED");
  assert.equal(result.executions.length, 1);
  assert.equal(result.executions[0]?.outcome, "APPLIED");
  assert.deepEqual(result.executions[0]?.result, { categoryId: SYSTEM_GROCERIES_ID, previousCategoryId: null });
  assert.equal(ledgerRecords.transactions.get(transaction.id)?.categoryId, SYSTEM_GROCERIES_ID);
  const ledgerAudit = await ledgerRecords.listTransactionAudit(workspaceOne, transaction.id);
  assert.ok(ledgerAudit.some((entry) => entry.action === "UPDATE" && entry.actorUserId === owner.userId));
  const executions = await rules.listRuleExecutions(owner, workspaceOne, { ruleId: rule.id });
  assert.equal(executions.length, 1);
  assert.equal(executions[0]?.ruleRevision, 1);
  assert.deepEqual((await rules.listRuleAudit(owner, workspaceOne, rule.id)).map((audit) => audit.action), ["CREATE"]);
});

test("non-matching transactions are left untouched and produce no executions", async () => {
  const { createRule, expense, ledgerRecords, rules } = await createFixture();
  await createRule({
    conditions: [expenseOnly, merchantContains("carrefour")],
    action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_GROCERIES_ID },
  });
  const transaction = await expense({ merchant: "Total Energies" });
  const before = ledgerRecords.transactions.get(transaction.id);

  const result = await rules.applyRulesToTransaction(owner, workspaceOne, transaction.id);

  assert.equal(result.status, "EVALUATED");
  assert.equal(result.executions.length, 0);
  assert.deepEqual(ledgerRecords.transactions.get(transaction.id), before);
});

test("conflicts resolve by priority, then creation order, and only the first applicable action of each type runs", async () => {
  const { createRule, expense, ledgerRecords, rules, inboxRecords } = await createFixture();
  const incomeCategoryRule = await createRule({
    name: "Wrong kind",
    priority: 5,
    conditions: [merchantContains("market")],
    action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_SALARY_ID },
  });
  const transport = await createRule({
    name: "Transport",
    priority: 20,
    conditions: [merchantContains("market")],
    action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_TRANSPORT_ID },
  });
  const groceries = await createRule({
    name: "Groceries",
    priority: 10,
    conditions: [merchantContains("market")],
    action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_GROCERIES_ID },
  });
  const tiedLater = await createRule({
    name: "Tied later",
    priority: 10,
    conditions: [merchantContains("market")],
    action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_TRANSPORT_ID },
  });
  const review = await createRule({
    name: "Review markets",
    priority: 50,
    conditions: [merchantContains("market")],
    action: { type: "ROUTE_FOR_REVIEW" },
  });
  const transaction = await expense({ merchant: "Mboppi Market" });
  const [tieWinner, tieLoser] = [groceries, tiedLater].sort(compareRulePrecedence);
  assert.ok(tieWinner && tieLoser);

  const preview = await rules.previewRulesForTransaction(owner, workspaceOne, transaction.id);
  assert.deepEqual(
    preview.evaluated.map((entry) => [entry.rule.id, entry.decision, entry.reason]),
    [
      [incomeCategoryRule.id, "SKIP", "CATEGORY_KIND_MISMATCH"],
      [tieWinner.id, "APPLY", null],
      [tieLoser.id, "SHADOWED", "SHADOWED_BY_HIGHER_PRIORITY_RULE"],
      [transport.id, "SHADOWED", "SHADOWED_BY_HIGHER_PRIORITY_RULE"],
      [review.id, "APPLY", null],
    ],
  );

  const result = await rules.applyRulesToTransaction(owner, workspaceOne, transaction.id);
  assert.deepEqual(
    result.executions.map((execution) => [execution.ruleId, execution.outcome]),
    [
      [incomeCategoryRule.id, "SKIPPED"],
      [tieWinner.id, "APPLIED"],
      [tieLoser.id, "SHADOWED"],
      [transport.id, "SHADOWED"],
      [review.id, "APPLIED"],
    ],
  );
  assert.equal(
    ledgerRecords.transactions.get(transaction.id)?.categoryId,
    tieWinner.action.type === "ASSIGN_CATEGORY" ? tieWinner.action.categoryId : null,
  );
  const items = [...inboxRecords.items.values()].filter((item) => item.transactionId === transaction.id);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.reason, "CLASSIFICATION_REVIEW");
  assert.equal(items[0]?.details.ruleId, review.id);
});

test("rules never overwrite an existing category", async () => {
  const { createRule, expense, ledgerRecords, rules } = await createFixture();
  await createRule({ conditions: [merchantContains("uber")], action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_TRANSPORT_ID } });
  const transaction = await expense({ merchant: "Uber Eats", categoryId: SYSTEM_GROCERIES_ID });

  const result = await rules.applyRulesToTransaction(owner, workspaceOne, transaction.id);

  assert.equal(result.executions[0]?.outcome, "SKIPPED");
  assert.equal(result.executions[0]?.reason, "CATEGORY_ALREADY_SET");
  assert.equal(ledgerRecords.transactions.get(transaction.id)?.categoryId, SYSTEM_GROCERIES_ID);
});

test("disabled and archived rules are not evaluated, and archived rules cannot be re-enabled", async () => {
  const { createRule, expense, ledgerRecords, rules } = await createFixture();
  const rule = await createRule({ conditions: [merchantContains("orange")], action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_GROCERIES_ID } });
  const disabled = await rules.setRuleEnabled(owner, workspaceOne, rule.id, { enabled: false, expectedUpdatedAt: rule.updatedAt, idempotencyKey: "disable-1" });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.revision, 1);

  const first = await expense({ merchant: "Orange Money" });
  assert.equal((await rules.applyRulesToTransaction(owner, workspaceOne, first.id)).executions.length, 0);
  assert.equal(ledgerRecords.transactions.get(first.id)?.categoryId, null);

  const enabled = await rules.setRuleEnabled(owner, workspaceOne, rule.id, { enabled: true, expectedUpdatedAt: disabled.updatedAt, idempotencyKey: "enable-1" });
  const archived = await rules.archiveRule(owner, workspaceOne, rule.id, { expectedUpdatedAt: enabled.updatedAt, idempotencyKey: "archive-1" });
  assert.equal(archived.status, "ARCHIVED");
  assert.equal(archived.enabled, false);
  const second = await expense({ merchant: "Orange Money" });
  assert.equal((await rules.applyRulesToTransaction(owner, workspaceOne, second.id)).executions.length, 0);
  await assert.rejects(
    rules.setRuleEnabled(owner, workspaceOne, rule.id, { enabled: true, expectedUpdatedAt: archived.updatedAt, idempotencyKey: "enable-2" }),
    (error) => error instanceof DomainConflictError && error.code === "RULE_ARCHIVED",
  );
  await assert.rejects(
    rules.updateRule(owner, workspaceOne, rule.id, { name: "Renamed", expectedUpdatedAt: archived.updatedAt, idempotencyKey: "edit-archived" }),
    (error) => error instanceof DomainConflictError && error.code === "RULE_ARCHIVED",
  );
  assert.deepEqual((await rules.listRules(owner, workspaceOne)).map((candidate) => candidate.id), []);
  assert.deepEqual((await rules.listRules(owner, workspaceOne, { includeArchived: true })).map((candidate) => candidate.id), [rule.id]);
  assert.deepEqual(
    (await rules.listRuleAudit(owner, workspaceOne, rule.id)).map((audit) => audit.action),
    ["CREATE", "DISABLE", "ENABLE", "ARCHIVE"],
  );
});

test("rules are isolated per workspace and enforce workspace authorization", async () => {
  const { createRule, expense, ledgerRecords, otherCash, rules } = await createFixture();
  const rule = await createRule({ conditions: [merchantContains("shell")], action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_TRANSPORT_ID } });
  const foreign = await expense({ merchant: "Shell", workspaceId: workspaceTwo, accountId: otherCash.id });

  assert.equal((await rules.applyRulesToTransaction(owner, workspaceTwo, foreign.id)).executions.length, 0);
  assert.equal(ledgerRecords.transactions.get(foreign.id)?.categoryId, null);
  await assert.rejects(rules.applyRulesToTransaction(owner, workspaceOne, foreign.id), NotFoundError);
  assert.equal(await rules.getRule(owner, workspaceTwo, rule.id), null);
  await assert.rejects(
    rules.updateRule(owner, workspaceTwo, rule.id, { name: "Hijack", expectedUpdatedAt: rule.updatedAt, idempotencyKey: "cross-workspace" }),
    NotFoundError,
  );
  await assert.rejects(
    createRule({ conditions: [{ field: "ACCOUNT", operator: "IS_ONE_OF", values: [otherCash.id] }], action: { type: "ROUTE_FOR_REVIEW" } }),
    (error) => error instanceof DomainConflictError && error.code === "RULE_ACCOUNT_NOT_FOUND",
  );
  await assert.rejects(rules.listRules(outsider, workspaceOne), AuthorizationError);
  await assert.rejects(
    rules.createRule(viewer, workspaceOne, {
      name: "Viewer rule",
      priority: 1,
      trigger: "TRANSACTION_CREATED",
      conditions: [expenseOnly],
      action: { type: "ROUTE_FOR_REVIEW" },
      idempotencyKey: "viewer-create",
    }),
    AuthorizationError,
  );
  const local = await expense({ merchant: "Shell" });
  await assert.rejects(rules.applyRulesToTransaction(viewer, workspaceOne, local.id), AuthorizationError);
  assert.equal((await rules.listRules(viewer, workspaceOne)).length, 1);
});

test("management commands are idempotent and optimistically concurrent", async () => {
  const { rules, ruleRecords } = await createFixture();
  const command = {
    name: "  Fuel   stations ",
    priority: 30,
    trigger: "TRANSACTION_CREATED" as const,
    conditions: [merchantContains("total")],
    action: { type: "ASSIGN_CATEGORY" as const, categoryId: SYSTEM_TRANSPORT_ID },
    idempotencyKey: "create-fuel",
  };
  const created = await rules.createRule(owner, workspaceOne, command);
  const replay = await rules.createRule(owner, workspaceOne, command);
  assert.equal(created.name, "Fuel stations");
  assert.equal(replay.id, created.id);
  assert.equal(ruleRecords.rules.size, 1);
  await assert.rejects(rules.createRule(owner, workspaceOne, { ...command, priority: 31 }), ConflictError);

  const edit = { conditions: [merchantContains("totalenergies")], expectedUpdatedAt: created.updatedAt, idempotencyKey: "edit-fuel" };
  const edited = await rules.updateRule(owner, workspaceOne, created.id, edit);
  assert.equal(edited.revision, 2);
  assert.equal((await rules.updateRule(owner, workspaceOne, created.id, edit)).updatedAt.getTime(), edited.updatedAt.getTime());
  const renamed = await rules.updateRule(owner, workspaceOne, created.id, { name: "Fuel", expectedUpdatedAt: edited.updatedAt, idempotencyKey: "rename-fuel" });
  assert.equal(renamed.revision, 2);
  await assert.rejects(
    rules.updateRule(owner, workspaceOne, created.id, { priority: 1, expectedUpdatedAt: created.updatedAt, idempotencyKey: "stale-edit" }),
    (error) => error instanceof DomainConflictError && error.code === "RULE_CHANGED",
  );
  await assert.rejects(
    rules.createRule(owner, workspaceOne, { ...command, conditions: [], idempotencyKey: "no-conditions" }),
    (error) => error instanceof DomainConflictError && error.code === "INVALID_RULE_COMMAND",
  );
  await assert.rejects(
    rules.createRule(owner, workspaceOne, {
      ...command,
      conditions: [{ field: "NOTE", operator: "MATCHES_REGEX", value: ".*" } as unknown as RuleCondition],
      idempotencyKey: "unsupported-operator",
    }),
    (error) => error instanceof DomainConflictError && error.code === "INVALID_RULE_COMMAND",
  );
});

test("agent-proposed rules go through the same service, start disabled, and are idempotent per agent action", async () => {
  const { rules } = await createFixture();
  const agentActionId = randomUUID();
  const input = {
    name: "Proposed by Pace AI",
    priority: 40,
    trigger: "TRANSACTION_CREATED" as const,
    conditions: [merchantContains("canal")],
    action: { type: "ROUTE_FOR_REVIEW" as const },
    enabled: true,
    idempotencyKey: "agent-proposal",
    agentActionId,
  };
  const proposed = await rules.createRule(owner, workspaceOne, input);
  assert.equal(proposed.origin, "AGENT");
  assert.equal(proposed.enabled, false);
  assert.equal(proposed.createdByAgentActionId, agentActionId);
  assert.equal((await rules.createRule(owner, workspaceOne, { ...input, idempotencyKey: "agent-retry" })).id, proposed.id);
});

test("applying rules twice is idempotent and never re-executes a rule revision on the same transaction", async () => {
  const { createRule, expense, inboxRecords, rules, ruleRecords } = await createFixture();
  const rule = await createRule({ conditions: [merchantContains("eneo")], action: { type: "ROUTE_FOR_REVIEW" } });
  const transaction = await expense({ merchant: "ENEO" });

  const first = await rules.applyRulesToTransaction(owner, workspaceOne, transaction.id);
  const second = await rules.applyRulesToTransaction(owner, workspaceOne, transaction.id);

  assert.equal(first.executions[0]?.outcome, "APPLIED");
  assert.equal(second.executions[0]?.id, first.executions[0]?.id);
  assert.equal(ruleRecords.executions.size, 1);
  assert.equal([...inboxRecords.items.values()].filter((item) => item.transactionId === transaction.id).length, 1);

  const revised = await rules.updateRule(owner, workspaceOne, rule.id, {
    conditions: [merchantContains("eneo"), expenseOnly],
    expectedUpdatedAt: rule.updatedAt,
    idempotencyKey: "revise-eneo",
  });
  const third = await rules.applyRulesToTransaction(owner, workspaceOne, transaction.id);
  assert.equal(third.executions[0]?.ruleRevision, revised.revision);
  assert.equal(third.executions[0]?.outcome, "SKIPPED");
  assert.equal(third.executions[0]?.reason, "ALREADY_IN_REVIEW");
  assert.equal([...inboxRecords.items.values()].filter((item) => item.transactionId === transaction.id).length, 1);
});

test("recursive re-processing from inside a rule action is rejected and audited as a failure", async () => {
  const { expense, ledger, ledgerRecords, ruleRecords, workspaces } = await createFixture();
  let recursive: RulesService | null = null;
  const reentrantInbox = {
    findOpenReviewItem: async () => null,
    routeTransactionForReview: async (actor: AuthenticatedActor, workspaceId: string, input: { transactionId: string }) => {
      await recursive!.applyRulesToTransaction(actor, workspaceId, input.transactionId);
      throw new Error("unreachable");
    },
  };
  recursive = new RulesService(ruleRecords, ledgerRecords, ledger, reentrantInbox, workspaces);
  await recursive.createRule(owner, workspaceOne, {
    name: "Loop",
    priority: 1,
    trigger: "TRANSACTION_CREATED",
    conditions: [expenseOnly],
    action: { type: "ROUTE_FOR_REVIEW" },
    idempotencyKey: "loop-rule",
  });
  const transaction = await expense({ merchant: "Loop" });

  const result = await recursive.applyRulesToTransaction(owner, workspaceOne, transaction.id);

  assert.equal(result.executions.length, 1);
  assert.equal(result.executions[0]?.outcome, "FAILED");
  assert.deepEqual(result.executions[0]?.result, { code: "RULE_EVALUATION_REENTRANT" });
  assert.equal(ruleRecords.executions.size, 1);
});

test("dry-run explains matched and unmatched conditions without mutating anything", async () => {
  const { cash, createRule, expense, financialSnapshot, inboxRecords, ledgerRecords, rules, ruleRecords } = await createFixture();
  const winner = await createRule({
    name: "Groceries",
    priority: 5,
    conditions: [merchantContains("santa lucia")],
    action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_GROCERIES_ID },
  });
  const transaction = await expense({ merchant: "Santa Lucia Akwa", note: "Weekly shop" });
  const before = await financialSnapshot();
  const storedBefore = structuredClone(ledgerRecords.transactions.get(transaction.id));
  const executionsBefore = ruleRecords.executions.size;

  const draft = await rules.testRule(viewer, workspaceOne, {
    transactionId: transaction.id,
    rule: {
      priority: 50,
      definition: {
        trigger: "TRANSACTION_CREATED",
        conditions: [
          expenseOnly,
          { field: "ACCOUNT", operator: "IS_ONE_OF", values: [cash.id] },
          { field: "NOTE", operator: "STARTS_WITH", value: "weekly" },
          { field: "CATEGORY", operator: "IS_EMPTY" },
          { field: "COUNTERPARTY", operator: "EQUALS", value: "carrefour" },
        ],
        action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_TRANSPORT_ID },
      },
    },
  });
  assert.equal(draft.match.matched, false);
  assert.deepEqual(
    draft.match.conditions.map((condition) => [condition.field, condition.actual, condition.matched]),
    [
      ["TRANSACTION_KIND", "EXPENSE", true],
      ["ACCOUNT", cash.id, true],
      ["NOTE", "weekly shop", true],
      ["CATEGORY", null, true],
      ["COUNTERPARTY", "santa lucia akwa", false],
    ],
  );
  assert.equal(draft.wouldApply, false);

  const shadowed = await rules.testRule(owner, workspaceOne, {
    transactionId: transaction.id,
    rule: {
      priority: 50,
      definition: {
        trigger: "TRANSACTION_CREATED",
        conditions: [merchantContains("santa")],
        action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_TRANSPORT_ID },
      },
    },
  });
  assert.equal(shadowed.match.matched, true);
  assert.equal(shadowed.applicability.applicable, true);
  assert.equal(shadowed.wouldApply, false);
  assert.deepEqual(shadowed.shadowedBy, { id: winner.id, name: "Groceries", priority: 5 });

  const existing = await rules.testRule(owner, workspaceOne, { transactionId: transaction.id, rule: { ruleId: winner.id } });
  assert.equal(existing.wouldApply, true);

  assert.deepEqual(await financialSnapshot(), before);
  assert.deepEqual(ledgerRecords.transactions.get(transaction.id), storedBefore);
  assert.equal(ruleRecords.executions.size, executionsBefore);
  assert.equal(inboxRecords.items.size, 0);
});

test("rule execution never creates, transfers or rebalances money", async () => {
  const { cash, createRule, expense, financialSnapshot, ledger, ledgerRecords, rules, savings } = await createFixture();
  await createRule({ priority: 1, conditions: [{ field: "TRANSACTION_KIND", operator: "IS_NOT_ONE_OF", values: ["REFUND"] }], action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_GROCERIES_ID } });
  await createRule({ priority: 2, conditions: [{ field: "CATEGORY", operator: "IS_EMPTY", values: [] }], action: { type: "ROUTE_FOR_REVIEW" } });
  const manual = await expense({ merchant: "Mahima" });
  const imported = await expense({ merchant: "Imported shop", source: { provider: "pace-import", origin: "IMPORT" } });
  const transfer = await ledger.createTransaction(owner, workspaceOne, {
    kind: "TRANSFER",
    amountMinor: "1000",
    currency: "XAF",
    occurredAt: "2026-09-11T12:00:00.000Z",
    accountId: cash.id,
    transferAccountId: savings.id,
  });
  const income = await ledger.createTransaction(owner, workspaceOne, {
    kind: "INCOME",
    amountMinor: "9000",
    currency: "XAF",
    occurredAt: "2026-09-12T12:00:00.000Z",
    accountId: cash.id,
    source: { provider: "manual", origin: "MANUAL" },
  });
  const before = await financialSnapshot();

  const results = [];
  for (const transaction of [manual, imported, transfer, income]) {
    results.push(await rules.applyRulesToTransaction(owner, workspaceOne, transaction.id));
  }

  const after = await financialSnapshot();
  assert.equal(after.count, before.count);
  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual(after.balances, before.balances);
  assert.equal(ledgerRecords.transactions.get(manual.id)?.categoryId, SYSTEM_GROCERIES_ID);
  assert.equal(ledgerRecords.transactions.get(imported.id)?.categoryId, null);
  assert.deepEqual(results[1]?.executions.map((execution) => [execution.actionType, execution.outcome, execution.reason]), [
    ["ASSIGN_CATEGORY", "SKIPPED", "TRANSACTION_LOCKED"],
    ["ROUTE_FOR_REVIEW", "APPLIED", null],
  ]);
  assert.deepEqual(results[2]?.executions.map((execution) => execution.reason), [
    "TRANSACTION_KIND_NOT_SUPPORTED",
    "TRANSACTION_KIND_NOT_SUPPORTED",
  ]);
  assert.deepEqual(results[3]?.executions.map((execution) => [execution.outcome, execution.reason]), [
    ["SKIPPED", "CATEGORY_KIND_MISMATCH"],
    ["APPLIED", null],
  ]);
});

test("rules evaluate only the canonical effective transaction", async () => {
  const { createRule, expense, ledger, ledgerRecords, rules, ruleRecords } = await createFixture();
  await createRule({ conditions: [merchantContains("express union")], action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_GROCERIES_ID } });
  const transaction = await expense({ merchant: "Express Union" });
  await ledger.reverseTransaction(owner, {
    workspaceId: workspaceOne,
    transactionId: transaction.id,
    idempotencyKey: randomUUID(),
  });
  const reversal = [...ledgerRecords.transactions.values()].find((candidate) => candidate.reversalOfTransactionId === transaction.id);
  assert.ok(reversal);

  assert.equal((await rules.applyRulesToTransaction(owner, workspaceOne, transaction.id)).status, "NOT_EFFECTIVE");
  assert.equal((await rules.applyRulesToTransaction(owner, workspaceOne, reversal.id)).status, "NOT_EFFECTIVE");
  assert.equal(ruleRecords.executions.size, 0);
  assert.equal(ledgerRecords.transactions.get(transaction.id)?.categoryId, null);
});
