import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { AuthorizationError, DomainConflictError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import type { WorkspaceRole } from "@/authorization/workspace-permissions";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import { LedgerService } from "@/modules/ledger/ledger-service";
import {
  RULE_ACTION_SKIP_REASONS,
  RULE_ACTION_TYPES,
} from "@/modules/plans/rules/domain";
import { getRulesOverviewWithReaders, type RulesOverviewReaders } from "@/modules/plans/rules/queries/get-rules-overview";
import { createRuleCommand, dryRunRuleCommand, updateRuleCommand } from "@/modules/plans/rules/rule-contract";
import {
  applyTriggerPreset,
  conditionDraftFor,
  createEmptyRuleDraft,
  firstInvalidRuleStep,
  isRuleDefinitionReady,
  isRuleStepValid,
  RULE_BUILDER_STEPS,
  RULE_CONDITION_FIELDS,
  RULE_TRIGGER_PRESETS,
  ruleCreatePayload,
  ruleDraftFingerprint,
  ruleDraftFromRule,
  ruleDraftToDefinition,
  ruleUpdatePayload,
  suggestRulePriority,
  triggerPresetFor,
  validateRuleDraft,
  type RuleDraft,
} from "@/modules/plans/rules/rule-draft";
import { RulesService } from "@/modules/plans/rules/rule-service";
import type { RuleListItem, RulesOverview } from "@/modules/plans/rules/rules-overview";
import { ruleReferenceNames, suggestRuleName } from "@/modules/plans/ui/components/rule-builder-dialog";
import { RuleBuilderStepper } from "@/modules/plans/ui/components/rule-builder-stepper";
import { RuleConditionEditor } from "@/modules/plans/ui/components/rule-condition-editor";
import { RuleDryRunPanel } from "@/modules/plans/ui/components/rule-dry-run-panel";
import { getRulesUiLabels } from "@/modules/plans/ui/rules-ui-labels";
import { RulesOverviewView } from "@/modules/plans/ui/views/rules-overview-view";
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
const en = getRulesUiLabels("en");

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
  const cash = await ledger.createAccount(owner, workspaceOne, { name: "Cash wallet", type: "CASH", currency: "XAF" });
  const otherCash = await ledger.createAccount(owner, workspaceTwo, { name: "Other cash", type: "CASH", currency: "XAF" });

  let minute = 0;
  const transaction = (input: {
    merchant?: string;
    kind?: "EXPENSE" | "INCOME";
    categoryId?: string;
    note?: string;
    workspaceId?: string;
    accountId?: string;
  }) => {
    minute += 1;
    return ledger.createTransaction(owner, input.workspaceId ?? workspaceOne, {
      kind: input.kind ?? "EXPENSE",
      amountMinor: "5000",
      currency: "XAF",
      occurredAt: new Date(Date.UTC(2026, 8, 10, 12, minute)).toISOString(),
      accountId: input.accountId ?? cash.id,
      ...(input.merchant ? { merchantName: input.merchant } : {}),
      ...(input.note ? { note: input.note } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      source: { provider: "manual", origin: "MANUAL" },
    });
  };

  const draftFor = (input: { merchant: string; categoryId?: string; review?: boolean; priority?: number; enabled?: boolean; name?: string }): RuleDraft => {
    const base = createEmptyRuleDraft(input.priority ?? 1);
    return {
      ...base,
      trigger: { ...base.trigger, text: input.merchant },
      action: input.review ? { type: "ROUTE_FOR_REVIEW", categoryId: "" } : { type: "ASSIGN_CATEGORY", categoryId: input.categoryId ?? SYSTEM_TRANSPORT_ID },
      name: input.name ?? `${input.merchant} rule`,
      nameEdited: true,
      enabled: input.enabled ?? true,
    };
  };

  const financialSnapshot = () =>
    JSON.stringify(
      [...ledgerRecords.transactions.values()]
        .map((record) => ({ ...record, amountMinor: record.amountMinor.toString() }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  const sideEffectSnapshot = () => ({
    ledger: financialSnapshot(),
    ledgerAuditSize: JSON.stringify([...ledgerRecords.transactions.keys()].length),
    inboxItems: inboxRecords.items.size,
    inboxAudit: inboxRecords.audit.size,
    rules: JSON.stringify([...ruleRecords.rules.values()]),
    audits: ruleRecords.audits.size,
    executions: ruleRecords.executions.size,
  });

  const readers: RulesOverviewReaders = {
    listRules: (actor, workspaceId) => rules.listRules(actor, workspaceId, { includeArchived: true }),
    listExecutions: (actor, workspaceId) => rules.listRuleExecutions(actor, workspaceId),
    listCategories: (actor, workspaceId) => ledger.listCategories(actor, workspaceId),
    listAccounts: (actor, workspaceId) => ledger.listAccounts(actor, workspaceId),
    findTransaction: (workspaceId, id) => ledgerRecords.findTransaction(workspaceId, id),
    findMerchant: (workspaceId, id) => ledgerRecords.findMerchant(workspaceId, id),
  };
  const overview = (input: { actor?: AuthenticatedActor; role?: WorkspaceRole; ruleId?: string } = {}) =>
    getRulesOverviewWithReaders(
      {
        actor: input.actor ?? owner,
        workspaceId: workspaceOne,
        role: input.role ?? "OWNER",
        timeZone: "UTC",
        query: "",
        status: "ALL",
        ruleId: input.ruleId,
      },
      readers,
    );

  return { cash, otherCash, ledger, ledgerRecords, inboxRecords, rules, ruleRecords, transaction, draftFor, sideEffectSnapshot, overview };
}

function byName(overview: RulesOverview, name: string): RuleListItem {
  const rule = overview.rules.find((item) => item.name === name);
  assert.ok(rule, `missing rule ${name}`);
  return rule;
}

test("create: the builder payload goes through the canonical createRule with audit and idempotent replay", async () => {
  const { rules, ruleRecords, draftFor } = await createFixture();
  const draft = draftFor({ merchant: "  Orange   MONEY ", name: "Orange Money → Transport" });
  const payload = ruleCreatePayload(draft, "builder-key-1");
  assert.ok(createRuleCommand.safeParse(payload).success);

  const created = await rules.createRule(owner, workspaceOne, payload);
  assert.equal(created.name, "Orange Money → Transport");
  assert.equal(created.trigger, "TRANSACTION_CREATED");
  assert.deepEqual(created.conditions, [{ field: "COUNTERPARTY", operator: "CONTAINS", value: "orange money" }]);
  assert.deepEqual(created.action, { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_TRANSPORT_ID });
  assert.equal(created.enabled, true);
  assert.equal(created.origin, "USER");

  const replay = await rules.createRule(owner, workspaceOne, payload);
  assert.equal(replay.id, created.id);
  assert.equal(ruleRecords.rules.size, 1);
  assert.deepEqual((await rules.listRuleAudit(owner, workspaceOne, created.id)).map((audit) => audit.action), ["CREATE"]);

  await assert.rejects(
    rules.createRule(owner, workspaceOne, { ...payload, name: "Different" }),
    (error: unknown) => error instanceof Error && /idempotency key/.test(error.message),
  );
});

test("create: a disabled rule is persisted disabled and never runs on new transactions", async () => {
  const { rules, ruleRecords, draftFor, transaction } = await createFixture();
  const created = await rules.createRule(owner, workspaceOne, ruleCreatePayload(draftFor({ merchant: "netflix", enabled: false }), "k-disabled"));
  assert.equal(created.enabled, false);
  const tx = await transaction({ merchant: "Netflix" });
  const result = await rules.applyRulesToTransaction(owner, workspaceOne, tx.id);
  assert.equal(result.executions.length, 0);
  assert.equal(ruleRecords.executions.size, 0);

  const view = await (await createFixture()).overview();
  assert.equal(view.rules.length, 0);
});

test("edit: the draft round-trips a stored rule and only changed fields are sent to updateRule", async () => {
  const { rules, cash, overview } = await createFixture();
  const created = await rules.createRule(owner, workspaceOne, {
    name: "Cash transport",
    priority: 3,
    trigger: "TRANSACTION_CREATED",
    conditions: [
      { field: "ACCOUNT", operator: "IS_ONE_OF", values: [cash.id] },
      { field: "COUNTERPARTY", operator: "CONTAINS", value: "taxi" },
    ],
    action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_TRANSPORT_ID },
    idempotencyKey: "seed",
  });
  const item = byName(await overview(), "Cash transport");
  assert.equal(item.capabilities.canEdit, true);
  const draft = ruleDraftFromRule(item);
  assert.equal(draft.trigger.field, "COUNTERPARTY");
  assert.equal(draft.trigger.text, "taxi");
  assert.deepEqual(draft.conditions.map((condition) => [condition.field, condition.values]), [["ACCOUNT", [cash.id]]]);
  assert.equal(draft.priority, "3");

  const untouched = ruleUpdatePayload(item, draft, "edit-noop");
  assert.deepEqual(Object.keys(untouched).sort(), ["expectedUpdatedAt", "idempotencyKey"]);

  const changed = ruleUpdatePayload(item, { ...draft, name: "Taxi rides", priority: "1", trigger: { ...draft.trigger, text: "Yango" } }, "edit-1");
  assert.ok(updateRuleCommand.safeParse(changed).success);
  assert.equal(changed.name, "Taxi rides");
  assert.equal(changed.priority, 1);
  assert.ok(changed.conditions);

  const updated = await rules.updateRule(owner, workspaceOne, created.id, changed);
  assert.equal(updated.name, "Taxi rides");
  assert.equal(updated.priority, 1);
  assert.equal(updated.revision, 2);
  assert.ok(updated.conditions.some((condition) => condition.field === "COUNTERPARTY" && condition.value === "yango"));
  assert.deepEqual((await rules.listRuleAudit(owner, workspaceOne, created.id)).map((audit) => audit.action).sort(), ["CREATE", "UPDATE"]);

  const renameOnly = ruleUpdatePayload(byName(await overview(), "Taxi rides"), { ...ruleDraftFromRule(byName(await overview(), "Taxi rides")), name: "Rides" }, "edit-2");
  assert.equal("conditions" in renameOnly, false);
  const renamed = await rules.updateRule(owner, workspaceOne, created.id, renameOnly);
  assert.equal(renamed.revision, 2);
});

test("edit: a stale expectedUpdatedAt is rejected with RULE_CHANGED and archived rules cannot be edited", async () => {
  const { rules, overview, draftFor } = await createFixture();
  const created = await rules.createRule(owner, workspaceOne, ruleCreatePayload(draftFor({ merchant: "canal", name: "Canal" }), "k1"));
  const opened = byName(await overview(), "Canal");
  await rules.setRuleEnabled(owner, workspaceOne, created.id, { enabled: false, expectedUpdatedAt: created.updatedAt, idempotencyKey: "toggle" });

  const stale = ruleUpdatePayload(opened, { ...ruleDraftFromRule(opened), name: "Canal+" }, "stale");
  await assert.rejects(
    rules.updateRule(owner, workspaceOne, created.id, stale),
    (error: unknown) => error instanceof DomainConflictError && error.code === "RULE_CHANGED",
  );

  const fresh = byName(await overview(), "Canal");
  await rules.archiveRule(owner, workspaceOne, created.id, { expectedUpdatedAt: fresh.updatedAt, idempotencyKey: "archive" });
  const archived = byName(await overview(), "Canal");
  assert.equal(archived.capabilities.canEdit, false);
  await assert.rejects(
    rules.updateRule(owner, workspaceOne, created.id, ruleUpdatePayload(archived, { ...ruleDraftFromRule(archived), name: "X" }, "archived")),
    (error: unknown) => error instanceof DomainConflictError && error.code === "RULE_ARCHIVED",
  );
});

test("validation: each step validates the canonical model and invalid commands are rejected by the service", async () => {
  const empty = createEmptyRuleDraft(1);
  const issues = validateRuleDraft(empty);
  assert.equal(issues.trigger, "VALUE_REQUIRED");
  assert.equal(issues.action, "CATEGORY_REQUIRED");
  assert.equal(issues.name, "NAME_REQUIRED");
  assert.equal(firstInvalidRuleStep(issues), "TRIGGER");
  assert.equal(isRuleStepValid("CONDITIONS", issues), true);
  assert.equal(isRuleDefinitionReady(empty), false);

  const account = applyTriggerPreset(empty.trigger, RULE_TRIGGER_PRESETS.find((preset) => preset.id === "ACCOUNT_IS")!);
  assert.equal(validateRuleDraft({ ...empty, trigger: account }).trigger, "SELECTION_REQUIRED");
  const merchantEmpty = applyTriggerPreset(empty.trigger, RULE_TRIGGER_PRESETS.find((preset) => preset.id === "MERCHANT_EMPTY")!);
  assert.equal(validateRuleDraft({ ...empty, trigger: merchantEmpty }).trigger, null);
  assert.equal(validateRuleDraft({ ...empty, trigger: { ...empty.trigger, text: "x".repeat(161) } }).trigger, "TEXT_TOO_LONG");

  const tooMany = { ...empty, conditions: Array.from({ length: 10 }, () => conditionDraftFor("TRANSACTION_KIND")) };
  assert.equal(validateRuleDraft(tooMany).conditionsLimit, "TOO_MANY_CONDITIONS");
  const blankCondition = { ...empty, conditions: [conditionDraftFor("ENTRY_ORIGIN")] };
  assert.equal(Object.values(validateRuleDraft(blankCondition).conditions)[0], "SELECTION_REQUIRED");

  for (const priority of ["0", "10001", "1.5", "-2", "abc", ""])
    assert.equal(validateRuleDraft({ ...empty, priority }).priority, "PRIORITY_INVALID", priority);
  assert.equal(validateRuleDraft({ ...empty, priority: "10000" }).priority, null);
  assert.equal(validateRuleDraft({ ...empty, name: "y".repeat(161) }).name, "NAME_TOO_LONG");

  const { rules, draftFor } = await createFixture();
  await assert.rejects(
    rules.createRule(owner, workspaceOne, ruleCreatePayload({ ...draftFor({ merchant: "a" }), action: { type: "ASSIGN_CATEGORY", categoryId: randomUUID() } }, "missing-category")),
    (error: unknown) => error instanceof DomainConflictError && error.code === "RULE_CATEGORY_NOT_FOUND",
  );
  await assert.rejects(
    rules.createRule(owner, workspaceOne, ruleCreatePayload(empty, "invalid")),
    (error: unknown) => error instanceof DomainConflictError && error.code === "INVALID_RULE_COMMAND",
  );
});

test("the contract only accepts canonical triggers, operators and actions", () => {
  const definition = { trigger: "TRANSACTION_CREATED", conditions: [{ field: "COUNTERPARTY", operator: "CONTAINS", value: "x" }], action: { type: "ROUTE_FOR_REVIEW" } };
  assert.ok(dryRunRuleCommand.safeParse({ definition }).success);
  const rejected = [
    { ...definition, trigger: "SCHEDULED" },
    { ...definition, conditions: [{ field: "AMOUNT", operator: "GREATER_THAN", value: "100" }] },
    { ...definition, conditions: [{ field: "COUNTERPARTY", operator: "REGEX", value: ".*" }] },
    { ...definition, action: { type: "TRANSFER", toAccountId: randomUUID(), amountMinor: "100" } },
    { ...definition, action: { type: "CREATE_TRANSACTION" } },
    { ...definition, action: { type: "RUN_SCRIPT", code: "process.exit()" } },
  ];
  for (const candidate of rejected) assert.equal(dryRunRuleCommand.safeParse({ definition: candidate }).success, false, JSON.stringify(candidate));
  assert.equal(dryRunRuleCommand.safeParse({ definition, script: "x" }).success, false);
  assert.deepEqual(new Set(RULE_TRIGGER_PRESETS.map((preset) => preset.field)), new Set(RULE_CONDITION_FIELDS));
});

test("dry run: recent effective transactions split into matching / not matching with per-condition explanations", async () => {
  const { rules, ledger, cash, otherCash, transaction, draftFor } = await createFixture();
  const orange = await transaction({ merchant: "Orange Money Douala" });
  const orangeIncome = await transaction({ merchant: "Orange Money Payout", kind: "INCOME" });
  const shell = await transaction({ merchant: "Shell Akwa" });
  const reversed = await transaction({ merchant: "Orange Money Reversed" });
  await ledger.reverseTransaction(owner, { workspaceId: workspaceOne, transactionId: reversed.id, idempotencyKey: randomUUID() });
  await transaction({ merchant: "Orange Money Foreign", workspaceId: workspaceTwo, accountId: otherCash.id });

  const draft: RuleDraft = {
    ...draftFor({ merchant: "orange money" }),
    conditions: [{ ...conditionDraftFor("TRANSACTION_KIND"), values: ["EXPENSE"] }, { ...conditionDraftFor("ACCOUNT"), values: [cash.id] }],
  };
  const input = { definition: ruleDraftToDefinition(draft), priority: 1 };
  const result = await rules.dryRunRule(owner, workspaceOne, input);

  const ids = result.transactions.map((item) => item.transactionId);
  assert.ok(!ids.includes(reversed.id), "reversed transactions are not effective");
  assert.equal(ids.length, 3);
  assert.equal(result.evaluatedCount, 3);
  assert.equal(result.matchingCount, 1);
  const match = result.transactions.find((item) => item.transactionId === orange.id)!;
  assert.equal(match.match.matched, true);
  assert.equal(match.wouldApply, true);
  assert.deepEqual(match.match.conditions.map((condition) => [condition.field, condition.matched]), [
    ["COUNTERPARTY", true],
    ["TRANSACTION_KIND", true],
    ["ACCOUNT", true],
  ]);
  assert.equal(match.label, "Orange Money Douala");
  assert.equal(match.amountMinor, "5000");

  const income = result.transactions.find((item) => item.transactionId === orangeIncome.id)!;
  assert.equal(income.match.matched, false);
  assert.deepEqual(income.match.conditions.filter((condition) => !condition.matched).map((condition) => [condition.field, condition.actual]), [["TRANSACTION_KIND", "INCOME"]]);
  const other = result.transactions.find((item) => item.transactionId === shell.id)!;
  assert.equal(other.match.matched, false);
  assert.equal(other.match.conditions[0]?.actual, "shell akwa");

  assert.deepEqual(await rules.dryRunRule(owner, workspaceOne, input), result, "dry run is deterministic");
  assert.equal((await rules.dryRunRule(owner, workspaceOne, { ...input, limit: 1 })).evaluatedCount, 1);
});

test("dry run: skip reasons explain matches that would not apply", async () => {
  const { rules, transaction, draftFor } = await createFixture();
  await transaction({ merchant: "Market A", categoryId: SYSTEM_GROCERIES_ID });
  await transaction({ merchant: "Market B" });
  const result = await rules.dryRunRule(owner, workspaceOne, {
    definition: ruleDraftToDefinition(draftFor({ merchant: "market", categoryId: SYSTEM_SALARY_ID })),
  });
  assert.deepEqual(
    result.transactions.map((item) => [item.label, item.match.matched, item.wouldApply, item.applicability.reason]).sort(),
    [
      ["Market A", true, false, "CATEGORY_ALREADY_SET"],
      ["Market B", true, false, "CATEGORY_KIND_MISMATCH"],
    ],
  );
});

test("dry run: priority decides shadowing, disabled rules never shadow, and an edited rule does not shadow itself", async () => {
  const { rules, transaction, draftFor } = await createFixture();
  await transaction({ merchant: "Total Bonapriso" });
  const existing = await rules.createRule(owner, workspaceOne, ruleCreatePayload(draftFor({ merchant: "total", priority: 5, name: "Total fuel", categoryId: SYSTEM_TRANSPORT_ID }), "existing"));
  const definition = ruleDraftToDefinition(draftFor({ merchant: "total", categoryId: SYSTEM_GROCERIES_ID }));

  const lower = await rules.dryRunRule(owner, workspaceOne, { definition, priority: 10 });
  assert.equal(lower.transactions[0]?.wouldApply, false);
  assert.deepEqual(lower.transactions[0]?.shadowedBy, { id: existing.id, name: "Total fuel", priority: 5 });

  const higher = await rules.dryRunRule(owner, workspaceOne, { definition, priority: 1 });
  assert.equal(higher.transactions[0]?.wouldApply, true);
  assert.equal(higher.transactions[0]?.shadowedBy, null);

  const self = await rules.dryRunRule(owner, workspaceOne, { definition, priority: 10, ruleId: existing.id });
  assert.equal(self.transactions[0]?.wouldApply, true, "the edited rule replaces its stored version");

  await rules.setRuleEnabled(owner, workspaceOne, existing.id, { enabled: false, expectedUpdatedAt: existing.updatedAt, idempotencyKey: "off" });
  const afterDisable = await rules.dryRunRule(owner, workspaceOne, { definition, priority: 10 });
  assert.equal(afterDisable.transactions[0]?.wouldApply, true);

  await assert.rejects(rules.dryRunRule(owner, workspaceOne, { definition, ruleId: randomUUID() }), /Rule not found/);
});

test("dry run performs zero financial or rule mutation", async () => {
  const { rules, transaction, draftFor, sideEffectSnapshot } = await createFixture();
  await transaction({ merchant: "Orange Money" });
  await transaction({ merchant: "Unknown shop" });
  await rules.createRule(owner, workspaceOne, ruleCreatePayload(draftFor({ merchant: "unknown", review: true, name: "Review unknown" }), "seed"));
  const before = sideEffectSnapshot();
  for (const draft of [draftFor({ merchant: "orange" }), draftFor({ merchant: "unknown", review: true }), draftFor({ merchant: "shop", priority: 1 })]) {
    const result = await rules.dryRunRule(owner, workspaceOne, { definition: ruleDraftToDefinition(draft), priority: 1 });
    assert.ok(result.matchingCount >= 1);
  }
  await rules.dryRunRule(viewer, workspaceOne, { definition: ruleDraftToDefinition(draftFor({ merchant: "orange" })) });
  assert.deepEqual(sideEffectSnapshot(), before);
});

test("authz: managers create and edit, viewers can only preview, outsiders and other workspaces are denied", async () => {
  const { rules, draftFor, overview, transaction, otherCash } = await createFixture();
  const payload = ruleCreatePayload(draftFor({ merchant: "orange" }), "authz");
  await assert.rejects(rules.createRule(viewer, workspaceOne, payload), AuthorizationError);
  await assert.rejects(rules.createRule(outsider, workspaceOne, payload), AuthorizationError);
  const created = await rules.createRule(owner, workspaceOne, payload);
  await assert.rejects(
    rules.updateRule(viewer, workspaceOne, created.id, { name: "x", expectedUpdatedAt: created.updatedAt, idempotencyKey: "v" }),
    AuthorizationError,
  );
  await assert.rejects(
    rules.updateRule(owner, workspaceTwo, created.id, { name: "x", expectedUpdatedAt: created.updatedAt, idempotencyKey: "w2" }),
    /Rule not found/,
  );
  const definition = ruleDraftToDefinition(draftFor({ merchant: "orange" }));
  await assert.rejects(rules.dryRunRule(outsider, workspaceOne, { definition }), AuthorizationError);
  await assert.rejects(rules.dryRunRule(owner, workspaceTwo, { definition, ruleId: created.id }), /Rule not found/);
  await transaction({ merchant: "Orange Foreign", workspaceId: workspaceTwo, accountId: otherCash.id });
  assert.equal((await rules.dryRunRule(owner, workspaceOne, { definition })).evaluatedCount, 0);

  const viewerView = await overview({ actor: viewer, role: "VIEWER" });
  assert.equal(viewerView.builder, null);
  assert.ok(viewerView.rules.every((rule) => !rule.capabilities.canEdit));
  const ownerView = await overview();
  assert.ok(ownerView.builder);
  assert.ok(ownerView.builder.categories.some((category) => category.id === SYSTEM_TRANSPORT_ID));
  assert.ok(ownerView.builder.accounts.every((account) => account.id !== otherCash.id));
});

test("priority suggestion places new rules after existing active rules within canonical bounds", async () => {
  assert.equal(suggestRulePriority([]), 1);
  assert.equal(suggestRulePriority([3, 7, 2]), 8);
  assert.equal(suggestRulePriority([10_000]), 10_000);
  const { rules, draftFor, overview } = await createFixture();
  await rules.createRule(owner, workspaceOne, ruleCreatePayload(draftFor({ merchant: "a", priority: 4 }), "p1"));
  assert.equal((await overview()).builder?.suggestedPriority, 5);
  assert.equal(createEmptyRuleDraft(5).priority, "5");
});

test("draft state is preserved and fingerprinted independently of navigation", () => {
  const draft = createEmptyRuleDraft(2);
  const filled: RuleDraft = { ...draft, trigger: { ...draft.trigger, text: "Orange" }, action: { type: "ROUTE_FOR_REVIEW", categoryId: "" }, name: "n", nameEdited: true };
  const same = { ...filled, name: "renamed" };
  assert.equal(ruleDraftFingerprint(filled), ruleDraftFingerprint(same));
  assert.notEqual(ruleDraftFingerprint(filled), ruleDraftFingerprint({ ...filled, priority: "3" }));
  const preset = RULE_TRIGGER_PRESETS.find((item) => item.id === "MERCHANT_EQUALS")!;
  const switched = applyTriggerPreset(filled.trigger, preset);
  assert.equal(switched.text, "Orange", "switching between presets on the same field keeps the typed value");
  assert.equal(triggerPresetFor(switched)?.id, "MERCHANT_EQUALS");
  assert.equal(applyTriggerPreset(filled.trigger, RULE_TRIGGER_PRESETS.find((item) => item.id === "ACCOUNT_IS")!).text, "");
});

test("builder labels are complete and localized in EN, FR and DE", () => {
  const keys = Object.keys(en).sort();
  for (const language of ["en", "fr", "de"] as const) {
    const labels = getRulesUiLabels(language) as Readonly<Record<string, string>>;
    assert.deepEqual(Object.keys(labels).sort(), keys, `${language} keys differ`);
    for (const step of RULE_BUILDER_STEPS) {
      assert.ok(labels[`step${step}`]?.trim(), `${language}.step${step}`);
      assert.ok(labels[`stepHint${step}`]?.trim(), `${language}.stepHint${step}`);
      assert.ok(labels[`builderSubtitle${step}`]?.trim(), `${language}.builderSubtitle${step}`);
    }
    for (const preset of RULE_TRIGGER_PRESETS) {
      assert.ok(labels[`preset${preset.id}`]?.trim(), `${language}.preset${preset.id}`);
      assert.ok(labels[`presetHint${preset.id}`]?.trim(), `${language}.presetHint${preset.id}`);
    }
    for (const type of RULE_ACTION_TYPES) assert.ok(labels[`actionHint${type}`]?.trim());
    for (const reason of RULE_ACTION_SKIP_REASONS) assert.ok(labels[`reason${reason}`]?.trim(), `${language}.reason${reason}`);
    for (const issue of ["VALUE_REQUIRED", "SELECTION_REQUIRED", "TEXT_TOO_LONG", "TOO_MANY_VALUES", "TOO_MANY_CONDITIONS", "CATEGORY_REQUIRED", "NAME_REQUIRED", "NAME_TOO_LONG", "PRIORITY_INVALID"])
      assert.ok(labels[`error${issue}`]?.trim(), `${language}.error${issue}`);
  }
  assert.equal(getRulesUiLabels("fr").dryRunNotice, "Ceci est une simulation. Aucune modification ne sera apportée à vos transactions.");
  assert.equal(getRulesUiLabels("de").createRule, "Regel erstellen");
});

test("rule name suggestion uses the trigger value and action target", async () => {
  const { overview, cash } = await createFixture();
  const references = (await overview()).builder!;
  const base = createEmptyRuleDraft(1);
  assert.equal(
    suggestRuleName({ ...base, trigger: { ...base.trigger, text: "orange money" }, action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_TRANSPORT_ID } }, en, references),
    `Orange money → ${references.categories.find((category) => category.id === SYSTEM_TRANSPORT_ID)!.name}`,
  );
  const account = { ...conditionDraftFor("ACCOUNT"), values: [cash.id] };
  assert.equal(suggestRuleName({ ...base, trigger: account, action: { type: "ROUTE_FOR_REVIEW", categoryId: "" } }, getRulesUiLabels("fr"), references), "Cash wallet → À vérifier");
});

function withRouter(element: ReactElement): ReactElement {
  const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
  return createElement(
    AppRouterContext.Provider,
    { value: router as never },
    createElement(
      PathnameContext.Provider,
      { value: "/w/demo/plans/rules" },
      createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, element),
    ),
  );
}

test("UI: accessible responsive stepper, condition editor validation and Pace-blue entry points", async () => {
  const stepper = renderToStaticMarkup(
    createElement(RuleBuilderStepper, {
      completed: new Set(["TRIGGER"] as const),
      current: "CONDITIONS",
      labels: en,
      onSelect: () => {},
      reachable: new Set(["TRIGGER", "CONDITIONS"] as const),
    }),
  );
  assert.match(stepper, /<nav aria-label="Rule steps"/);
  assert.match(stepper, /<ol class="flex items-center gap-2">/);
  assert.match(stepper, /aria-current="step"[^>]*data-step="CONDITIONS"/);
  assert.match(stepper, /data-step="TRIGGER" data-step-state="complete"/);
  assert.match(stepper, /data-step="REVIEW" data-step-state="upcoming" disabled=""/);
  assert.match(stepper, /aria-live="polite" class="sr-only">Step 2 of 4/);

  const { overview, rules, draftFor } = await createFixture();
  await rules.createRule(owner, workspaceOne, ruleCreatePayload(draftFor({ merchant: "orange", name: "Orange" }), "ui"));
  const references = (await overview()).builder!;
  const editor = renderToStaticMarkup(
    createElement(RuleConditionEditor, {
      allowFieldChange: true,
      condition: conditionDraftFor("ACCOUNT"),
      issue: "SELECTION_REQUIRED",
      labels: getRulesUiLabels("de"),
      legend: "Bedingung 1",
      onChange: () => {},
      references,
      showIssue: true,
    }),
  );
  assert.match(editor, /<legend class="sr-only">Bedingung 1<\/legend>/);
  assert.match(editor, /data-invalid="true"/);
  assert.match(editor, /Wählen Sie mindestens eine Option\./);
  assert.match(editor, /role="alert">Wählen Sie mindestens eine Option/);
  assert.match(editor, /sm:grid-cols-2/);
  assert.doesNotMatch(editor, /AMOUNT/);

  const ownerView = await overview({ ruleId: byName(await overview(), "Orange").id });
  const page = renderToStaticMarkup(
    withRouter(createElement(RulesOverviewView, { labels: en, locale: "en-US", overview: ownerView, timeZone: "UTC", workspaceId: workspaceOne, workspaceSlug: "demo" })),
  );
  assert.match(page, /<button[^>]*bg-\[#1769e8\][^>]*data-new-rule="true"[^>]*>.*New rule/);
  assert.doesNotMatch(page, /<button[^>]*data-new-rule="true"[^>]*disabled/);
  assert.match(page, />Edit<\/button>/);

  const viewerPage = renderToStaticMarkup(
    withRouter(createElement(RulesOverviewView, { labels: en, locale: "en-US", overview: await overview({ actor: viewer, role: "VIEWER" }), timeZone: "UTC", workspaceId: workspaceOne, workspaceSlug: "demo" })),
  );
  assert.doesNotMatch(viewerPage, /data-new-rule/);
  assert.doesNotMatch(viewerPage, />Edit<\/button>/);
});

test("UI: dry-run panel shows matching tab, explanations and the simulation notice", async () => {
  const { rules, transaction, draftFor, overview } = await createFixture();
  await transaction({ merchant: "Orange Money" });
  await transaction({ merchant: "Shell" });
  const result = await rules.dryRunRule(owner, workspaceOne, { definition: ruleDraftToDefinition(draftFor({ merchant: "orange" })), priority: 1 });
  const names = ruleReferenceNames((await overview()).builder!);
  const render = (language: "en" | "fr", enabled: boolean, state: Parameters<typeof RuleDryRunPanel>[0]["state"]) =>
    renderToStaticMarkup(
      createElement(RuleDryRunPanel, { enabled, labels: getRulesUiLabels(language), locale: "en-US", names, onRetry: () => {}, state, timeZone: "UTC" }),
    );

  const ready = render("en", true, { status: "ready", result });
  assert.match(ready, /role="tablist"/);
  assert.match(ready, /aria-selected="true"[^>]*role="tab"[^>]*>Matching \(1\)/);
  assert.match(ready, /Not matching \(1\)/);
  assert.match(ready, /data-dry-run-outcome="WOULD_APPLY"/);
  assert.match(ready, /Why it matched/);
  assert.match(ready, /Merchant contains “orange”/);
  assert.match(ready, /Transaction: orange money/);
  assert.match(ready, /This is a simulation\. No changes will be made to your transactions\./);
  assert.doesNotMatch(ready, /won’t run until you enable it/);

  const disabled = render("fr", false, { status: "ready", result });
  assert.match(disabled, /Correspondantes \(1\)/);
  assert.match(disabled, /enregistrée désactivée/);

  assert.match(render("en", true, { status: "loading" }), /data-rule-dry-run="loading"[\s\S]*Testing rule…/);
  assert.match(render("en", true, { status: "error" }), /role="alert">We couldn’t test this rule/);
  assert.match(render("en", true, { status: "ready", result: { evaluatedCount: 0, matchingCount: 0, transactions: [] } }), /no recent transactions to test/);
});
