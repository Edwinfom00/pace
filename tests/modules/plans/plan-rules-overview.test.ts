import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import type { WorkspaceRole } from "@/authorization/workspace-permissions";
import { FinancialInboxService } from "@/modules/financial-inbox/financial-inbox-service";
import { LedgerService } from "@/modules/ledger/ledger-service";
import {
  RULE_ACTION_TYPES,
  RULE_ENTRY_ORIGINS,
  RULE_EXECUTION_OUTCOMES,
  RULE_OPTIONAL_SET_OPERATORS,
  RULE_TEXT_OPERATORS,
  RULE_TRANSACTION_KINDS,
  type RuleCondition,
  type RuleExecutionRecord,
  type RuleConditionField,
} from "@/modules/plans/rules/domain";
import { getRulesOverviewWithReaders, type RulesOverviewReaders } from "@/modules/plans/rules/queries/get-rules-overview";
import { RulesService } from "@/modules/plans/rules/rule-service";
import {
  filterRuleItems,
  parseRuleStatusFilter,
  RECENT_RULE_EXECUTIONS_LIMIT,
  RULE_STATUS_FILTERS,
  selectRule,
  type RuleListItem,
  type RulesOverview,
  type RuleStatusFilter,
} from "@/modules/plans/rules/rules-overview";
import { RuleDetailPanel } from "@/modules/plans/ui/components/rule-detail-panel";
import { RuleManagementActions, ruleToggleMutation } from "@/modules/plans/ui/components/rule-management-actions";
import { RulesCardList, RulesTable } from "@/modules/plans/ui/components/rules-list";
import { RulesSkeleton } from "@/modules/plans/ui/components/rules-skeleton";
import { conditionSummary, outcomeLabel } from "@/modules/plans/ui/rules-format";
import { getRulesUiLabels, type RulesUiLabels } from "@/modules/plans/ui/rules-ui-labels";
import { RulesOverviewView } from "@/modules/plans/ui/views/rules-overview-view";
import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import { InMemoryFinancialInboxRepository } from "../../support/in-memory-financial-inbox-repository";
import { InMemoryLedgerRepository, SYSTEM_TRANSPORT_ID } from "../../support/in-memory-ledger-repository";
import { InMemoryRulesRepository } from "../../support/in-memory-rules-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const outsider: AuthenticatedActor = { userId: "outsider-1", email: "outsider@pace.test", name: "Outsider" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";
const en = getRulesUiLabels("en");
const RULE_CONDITION_FIELDS: readonly RuleConditionField[] = ["TRANSACTION_KIND", "ENTRY_ORIGIN", "ACCOUNT", "CATEGORY", "COUNTERPARTY", "NOTE"];

async function createFixture() {
  const ledgerRecords = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ruleRecords = new InMemoryRulesRepository();
  const ledger = new LedgerService(ledgerRecords, workspaces);
  const inbox = new FinancialInboxService(new InMemoryFinancialInboxRepository(), ledgerRecords, workspaces, ledger);
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

  let sequence = 0;
  const createRule = (input: {
    name: string;
    priority: number;
    conditions: RuleCondition[];
    action: { type: "ASSIGN_CATEGORY"; categoryId: string } | { type: "ROUTE_FOR_REVIEW" };
    enabled?: boolean;
    workspaceId?: string;
  }) =>
    rules.createRule(owner, input.workspaceId ?? workspaceOne, {
      name: input.name,
      priority: input.priority,
      trigger: "TRANSACTION_CREATED",
      conditions: input.conditions,
      action: input.action,
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      idempotencyKey: `key-${++sequence}`,
    });
  const expense = (merchantName: string, workspaceId = workspaceOne, accountId = cash.id) =>
    ledger.createTransaction(owner, workspaceId, {
      kind: "EXPENSE",
      amountMinor: "5000",
      currency: "XAF",
      occurredAt: "2026-09-10T12:00:00.000Z",
      accountId,
      merchantName,
      source: { provider: "manual", origin: "MANUAL" },
    });

  const readers: RulesOverviewReaders = {
    listRules: (actor, workspaceId) => rules.listRules(actor, workspaceId, { includeArchived: true }),
    listExecutions: (actor, workspaceId) => rules.listRuleExecutions(actor, workspaceId),
    listCategories: (actor, workspaceId) => ledger.listCategories(actor, workspaceId),
    listAccounts: (actor, workspaceId) => ledger.listAccounts(actor, workspaceId),
    findTransaction: (workspaceId, id) => ledgerRecords.findTransaction(workspaceId, id),
    findMerchant: (workspaceId, id) => ledgerRecords.findMerchant(workspaceId, id),
  };
  const overview = (
    input: { actor?: AuthenticatedActor; role?: WorkspaceRole; workspaceId?: string; query?: string; status?: RuleStatusFilter; ruleId?: string } = {},
    customReaders: RulesOverviewReaders = readers,
  ) =>
    getRulesOverviewWithReaders(
      {
        actor: input.actor ?? owner,
        workspaceId: input.workspaceId ?? workspaceOne,
        role: input.role ?? "OWNER",
        timeZone: "UTC",
        query: input.query ?? "",
        status: input.status ?? "ALL",
        ruleId: input.ruleId,
      },
      customReaders,
    );

  return { cash, otherCash, ledger, ledgerRecords, rules, ruleRecords, createRule, expense, readers, overview };
}

async function seededFixture() {
  const fixture = await createFixture();
  const transport = await fixture.createRule({
    name: "Orange Money → Transport",
    priority: 1,
    conditions: [
      { field: "TRANSACTION_KIND", operator: "IS_ONE_OF", values: ["EXPENSE"] },
      { field: "COUNTERPARTY", operator: "CONTAINS", value: "Orange Money" },
      { field: "ACCOUNT", operator: "IS_ONE_OF", values: [fixture.cash.id] },
    ],
    action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_TRANSPORT_ID },
  });
  const review = await fixture.createRule({
    name: "Unknown merchant → Review",
    priority: 2,
    conditions: [{ field: "COUNTERPARTY", operator: "CONTAINS", value: "unknown" }],
    action: { type: "ROUTE_FOR_REVIEW" },
  });
  const paused = await fixture.createRule({
    name: "Café → Food",
    priority: 3,
    conditions: [{ field: "NOTE", operator: "CONTAINS", value: "café" }],
    action: { type: "ASSIGN_CATEGORY", categoryId: SYSTEM_TRANSPORT_ID },
    enabled: false,
  });
  const archivedDraft = await fixture.createRule({
    name: "Old archive",
    priority: 4,
    conditions: [{ field: "COUNTERPARTY", operator: "IS_EMPTY", value: null }],
    action: { type: "ROUTE_FOR_REVIEW" },
  });
  const archived = await fixture.rules.archiveRule(owner, workspaceOne, archivedDraft.id, {
    expectedUpdatedAt: archivedDraft.updatedAt,
    idempotencyKey: "archive-1",
  });
  const foreign = await fixture.createRule({
    name: "Foreign Orange Money",
    priority: 1,
    conditions: [{ field: "COUNTERPARTY", operator: "CONTAINS", value: "orange money" }],
    action: { type: "ROUTE_FOR_REVIEW" },
    workspaceId: workspaceTwo,
  });

  const first = await fixture.expense("Orange Money Douala");
  await fixture.rules.applyRulesToTransaction(owner, workspaceOne, first.id);
  const second = await fixture.expense("Orange Money Yaoundé");
  await fixture.rules.applyRulesToTransaction(owner, workspaceOne, second.id);
  const unknown = await fixture.expense("Unknown shop");
  await fixture.rules.applyRulesToTransaction(owner, workspaceOne, unknown.id);
  const foreignTx = await fixture.expense("Orange Money Foreign", workspaceTwo, fixture.otherCash.id);
  await fixture.rules.applyRulesToTransaction(owner, workspaceTwo, foreignTx.id);

  return { ...fixture, transport, review, paused, archived, foreign, first, second, unknown, foreignTx };
}

function byName(overview: RulesOverview, name: string): RuleListItem {
  const rule = overview.rules.find((item) => item.name === name);
  assert.ok(rule, `missing rule ${name}`);
  return rule;
}

test("rules overview maps canonical rule records into list items with trigger, conditions and action", async () => {
  const fixture = await seededFixture();
  const overview = await fixture.overview();
  const transport = byName(overview, "Orange Money → Transport");

  assert.equal(transport.status, "ACTIVE");
  assert.equal(transport.priority, 1);
  assert.deepEqual(transport.trigger, { field: "COUNTERPARTY", operator: "CONTAINS", values: ["orange money"] });
  assert.deepEqual(transport.conditions, [
    { field: "TRANSACTION_KIND", operator: "IS_ONE_OF", values: ["EXPENSE"] },
    { field: "ACCOUNT", operator: "IS_ONE_OF", values: ["Cash wallet"] },
  ]);
  assert.equal(transport.action.type, "ASSIGN_CATEGORY");
  assert.ok(transport.action.type === "ASSIGN_CATEGORY" && transport.action.categoryName);
  assert.equal(transport.appliedCount, 2);
  assert.ok(transport.lastAppliedAt);
  assert.equal(transport.createdByActor, true);
  assert.equal(conditionSummary(en, transport.trigger!), "Merchant contains “orange money”");

  assert.equal(byName(overview, "Café → Food").status, "PAUSED");
  assert.equal(byName(overview, "Café → Food").appliedCount, 0);
  assert.equal(byName(overview, "Café → Food").lastAppliedAt, null);
  assert.equal(byName(overview, "Old archive").status, "ARCHIVED");
  assert.equal(byName(overview, "Unknown merchant → Review").appliedCount, 1);
});

test("rules KPIs come from canonical rules and APPLIED executions only", async () => {
  const fixture = await seededFixture();
  const overview = await fixture.overview();
  assert.deepEqual(overview.kpis, { total: 3, active: 2, appliedThisMonth: 3, sentForReviewThisMonth: 1 });

  const empty = await (await createFixture()).overview();
  assert.deepEqual(empty.kpis, { total: 0, active: 0, appliedThisMonth: 0, sentForReviewThisMonth: 0 });
  assert.deepEqual(empty.rules, []);
  assert.equal(empty.selected, null);
});

test("rules filtering supports status filters and accent-insensitive search on name, values and category", async () => {
  const fixture = await seededFixture();
  const { rules } = await fixture.overview();
  const names = (filters: { query: string; status: RuleStatusFilter }) =>
    filterRuleItems(rules, filters).map((rule) => rule.name);

  assert.deepEqual(names({ query: "", status: "ALL" }), ["Orange Money → Transport", "Unknown merchant → Review", "Café → Food"]);
  assert.deepEqual(names({ query: "", status: "ACTIVE" }), ["Orange Money → Transport", "Unknown merchant → Review"]);
  assert.deepEqual(names({ query: "", status: "PAUSED" }), ["Café → Food"]);
  assert.deepEqual(names({ query: "", status: "ARCHIVED" }), ["Old archive"]);
  assert.deepEqual(names({ query: "cafe", status: "ALL" }), ["Café → Food"]);
  assert.deepEqual(names({ query: "  ORANGE   money ", status: "ALL" }), ["Orange Money → Transport"]);
  assert.deepEqual(names({ query: "cash wallet", status: "ALL" }), ["Orange Money → Transport"]);
  assert.deepEqual(names({ query: "transport", status: "PAUSED" }), ["Café → Food"]);
  assert.deepEqual(names({ query: "nothing-here", status: "ALL" }), []);

  const filtered = await fixture.overview({ query: "unknown", status: "ACTIVE" });
  assert.deepEqual(filtered.visibleRuleIds, [fixture.review.id]);
  assert.equal(filtered.kpis.total, 3);
  assert.deepEqual(filtered.filters, { query: "unknown", status: "ACTIVE" });

  assert.equal(parseRuleStatusFilter("paused"), "PAUSED");
  assert.equal(parseRuleStatusFilter("ARCHIVED"), "ARCHIVED");
  assert.equal(parseRuleStatusFilter("bogus"), "ALL");
  assert.equal(parseRuleStatusFilter(undefined), "ALL");
});

test("rule selection prefers an explicit request and falls back to the first visible rule", async () => {
  const fixture = await seededFixture();
  const fallback = await fixture.overview();
  assert.equal(fallback.selected?.rule.id, fixture.transport.id);
  assert.equal(fallback.selected?.explicit, false);

  const explicit = await fixture.overview({ ruleId: fixture.paused.id, status: "ACTIVE" });
  assert.equal(explicit.selected?.rule.id, fixture.paused.id);
  assert.equal(explicit.selected?.explicit, true);

  const unknown = await fixture.overview({ ruleId: randomUUID() });
  assert.equal(unknown.selected?.rule.id, fixture.transport.id);
  assert.equal(unknown.selected?.explicit, false);

  assert.equal(selectRule([], [], undefined), null);
});

test("recent executions come from canonical execution records with transaction context", async () => {
  const fixture = await seededFixture();
  const overview = await fixture.overview({ ruleId: fixture.transport.id });
  const executions = overview.selected!.executions;
  assert.equal(executions.length, 2);
  assert.ok(executions.every((execution) => execution.outcome === "APPLIED" && execution.actionType === "ASSIGN_CATEGORY"));
  assert.deepEqual(
    new Set(executions.map((execution) => execution.transactionId)),
    new Set([fixture.first.id, fixture.second.id]),
  );
  for (const execution of executions) {
    assert.equal(execution.transaction?.amountMinor, "5000");
    assert.equal(execution.transaction?.currency, "XAF");
    assert.match(execution.transaction?.label ?? "", /^Orange Money/);
  }
  assert.equal(outcomeLabel(en, executions[0]!), "Categorized");

  const paused = await fixture.overview({ ruleId: fixture.paused.id });
  assert.deepEqual(paused.selected?.executions, []);
});

test("recent executions are newest first, capped, and keep non-applied outcomes", async () => {
  const fixture = await seededFixture();
  const base = Date.now() + 60_000;
  const outcomes = ["SKIPPED", "SHADOWED", "FAILED", "APPLIED", "APPLIED", "APPLIED", "APPLIED"] as const;
  outcomes.forEach((outcome, index) => {
    const at = new Date(base + index * 60_000);
    const record: RuleExecutionRecord = {
      id: `synthetic-${index}`,
      workspaceId: workspaceOne,
      ruleId: fixture.review.id,
      ruleRevision: 1,
      transactionId: fixture.unknown.id,
      trigger: "TRANSACTION_CREATED",
      actionType: "ROUTE_FOR_REVIEW",
      outcome,
      reason: outcome === "SKIPPED" ? "ALREADY_IN_REVIEW" : null,
      actorUserId: owner.userId,
      explanation: {},
      result: {},
      createdAt: at,
      updatedAt: at,
    };
    fixture.ruleRecords.executions.set(record.id, record);
  });
  const overview = await fixture.overview({ ruleId: fixture.review.id });
  const executions = overview.selected!.executions;
  assert.equal(executions.length, RECENT_RULE_EXECUTIONS_LIMIT);
  assert.deepEqual(
    executions.map((execution) => execution.id),
    ["synthetic-6", "synthetic-5", "synthetic-4", "synthetic-3", "synthetic-2"],
  );
  assert.equal(outcomeLabel(en, { outcome: "SHADOWED", actionType: "ROUTE_FOR_REVIEW" }), "Overridden");
  assert.equal(outcomeLabel(en, { outcome: "APPLIED", actionType: "ROUTE_FOR_REVIEW" }), "Sent for review");
});

test("rules overview is isolated per workspace and denies non-members", async () => {
  const fixture = await seededFixture();
  const one = await fixture.overview();
  assert.ok(one.rules.every((rule) => rule.id !== fixture.foreign.id));
  assert.equal(one.kpis.appliedThisMonth, 3);

  const two = await fixture.overview({ workspaceId: workspaceTwo });
  assert.deepEqual(two.rules.map((rule) => rule.id), [fixture.foreign.id]);
  assert.equal(two.kpis.sentForReviewThisMonth, 1);
  assert.equal(two.selected?.executions[0]?.transactionId, fixture.foreignTx.id);

  await assert.rejects(fixture.overview({ actor: outsider, role: "MEMBER" }), AuthorizationError);
  await assert.rejects(fixture.overview({ actor: outsider, role: "OWNER", workspaceId: workspaceTwo }), AuthorizationError);

  const leaky: RulesOverviewReaders = {
    ...fixture.readers,
    listExecutions: async (actor, workspaceId) => [
      ...(await fixture.readers.listExecutions(actor, workspaceId)),
      ...(await fixture.readers.listExecutions(actor, workspaceTwo)),
    ],
    findTransaction: async (_workspaceId, id) => fixture.ledgerRecords.transactions.get(id) ?? null,
  };
  const guarded = await fixture.overview({ ruleId: fixture.transport.id }, leaky);
  assert.equal(guarded.kpis.appliedThisMonth, 3);
  assert.ok(guarded.selected?.executions.every((execution) => execution.transactionId !== fixture.foreignTx.id));
});

test("enable, disable and archive capabilities follow the canonical manage_ledger permission", async () => {
  const fixture = await seededFixture();
  const ownerView = await fixture.overview();
  assert.equal(ownerView.canManage, true);
  assert.deepEqual(byName(ownerView, "Orange Money → Transport").capabilities, { canToggle: true, canArchive: true, canEdit: true });
  assert.deepEqual(byName(ownerView, "Old archive").capabilities, { canToggle: false, canArchive: false, canEdit: false });
  assert.equal(ruleToggleMutation(byName(ownerView, "Orange Money → Transport")), "DISABLE");
  assert.equal(ruleToggleMutation(byName(ownerView, "Café → Food")), "ENABLE");
  assert.equal(ruleToggleMutation(byName(ownerView, "Old archive")), null);

  const viewerView = await fixture.overview({ actor: viewer, role: "VIEWER" });
  assert.equal(viewerView.canManage, false);
  assert.ok(viewerView.rules.every((rule) => !rule.capabilities.canToggle && !rule.capabilities.canArchive));
  assert.ok(viewerView.rules.every((rule) => ruleToggleMutation(rule) === null));

  const render = (rule: RuleListItem) =>
    renderToStaticMarkup(createElement(RuleManagementActions, { labels: en, onChanged: () => {}, rule, workspaceId: workspaceOne }));
  assert.match(render(byName(ownerView, "Orange Money → Transport")), />Disable</);
  assert.match(render(byName(ownerView, "Café → Food")), />Enable</);
  assert.match(render(byName(ownerView, "Café → Food")), /aria-label="More actions"/);
  assert.equal(render(byName(ownerView, "Old archive")), "");
  assert.equal(render(byName(viewerView, "Orange Money → Transport")), "");

  const disabled = await fixture.rules.setRuleEnabled(owner, workspaceOne, fixture.transport.id, {
    enabled: false,
    expectedUpdatedAt: new Date(byName(ownerView, "Orange Money → Transport").updatedAt),
    idempotencyKey: "toggle-1",
  });
  assert.equal(disabled.enabled, false);
  const afterToggle = await fixture.overview();
  assert.equal(byName(afterToggle, "Orange Money → Transport").status, "PAUSED");
  assert.deepEqual(afterToggle.kpis, { ...ownerView.kpis, active: 1 });
});

function check<T extends string>(labels: RulesUiLabels, prefix: string, values: readonly T[]) {
  for (const value of values) {
    const key = `${prefix}${value}`;
    assert.ok((labels as Record<string, string>)[key], `missing ${key}`);
  }
}

test("rules UI labels are complete and localized for EN, FR and DE", () => {
  const languages = ["en", "fr", "de"] as const;
  const keys = Object.keys(en).sort();
  for (const language of languages) {
    const labels = getRulesUiLabels(language);
    assert.deepEqual(Object.keys(labels).sort(), keys, `${language} keys differ`);
    for (const [key, value] of Object.entries(labels)) assert.ok(value.trim(), `${language}.${key} is empty`);
    check(labels, "status", RULE_STATUS_FILTERS);
    check(labels, "field", RULE_CONDITION_FIELDS);
    check(labels, "op", [...RULE_TEXT_OPERATORS, ...RULE_OPTIONAL_SET_OPERATORS]);
    check(labels, "kind", RULE_TRANSACTION_KINDS);
    check(labels, "origin", RULE_ENTRY_ORIGINS);
    check(labels, "action", RULE_ACTION_TYPES);
    check(labels, "outcome", RULE_EXECUTION_OUTCOMES.filter((outcome) => outcome !== "APPLIED"));
    check(labels, "outcomeAPPLIED_", RULE_ACTION_TYPES);
  }
  assert.equal(getRulesUiLabels("fr").title, "Règles");
  assert.equal(getRulesUiLabels("de").title, "Regeln");
  assert.equal(
    conditionSummary(getRulesUiLabels("fr"), { field: "TRANSACTION_KIND", operator: "IS_ONE_OF", values: ["EXPENSE"] }),
    "Type de transaction est “Dépense”",
  );
  assert.equal(
    conditionSummary(getRulesUiLabels("de"), { field: "ACCOUNT", operator: "IS_ONE_OF", values: [null] }),
    "Konto ist “Nicht verfügbar”",
  );
});

function withRouter(element: ReactElement, search = ""): ReactElement {
  const router = {
    back() {},
    forward() {},
    refresh() {},
    push() {},
    replace() {},
    prefetch() {},
  };
  return createElement(
    AppRouterContext.Provider,
    { value: router as never },
    createElement(
      PathnameContext.Provider,
      { value: "/w/demo/plans/rules" },
      createElement(SearchParamsContext.Provider, { value: new URLSearchParams(search) }, element),
    ),
  );
}

test("rules view renders a desktop table with detail rail and stacks list/detail on small screens", async () => {
  const fixture = await seededFixture();
  const render = (overview: RulesOverview, language: "en" | "fr" | "de" = "en") =>
    renderToStaticMarkup(
      withRouter(
        createElement(RulesOverviewView, {
          labels: getRulesUiLabels(language),
          locale: "en-US",
          overview,
          timeZone: "UTC",
          workspaceId: workspaceOne,
          workspaceSlug: "demo",
        }),
      ),
    );

  const implicit = render(await fixture.overview());
  assert.match(implicit, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(0,24rem\)\]/);
  assert.match(implicit, /<aside[^>]*class="[^"]*hidden xl:block/);
  assert.match(implicit, /<div class="hidden lg:block"><div[^>]*><table/);
  assert.match(implicit, /<div class="lg:hidden"><ul/);
  assert.match(implicit, /data-rule-detail="[^"]+"/);
  assert.match(implicit, /<button[^>]*data-new-rule="true"[^>]*>.*New rule/);
  assert.doesNotMatch(implicit, /Old archive/);

  const explicit = render(await fixture.overview({ ruleId: fixture.review.id }));
  assert.match(explicit, /<div class="min-w-0 hidden xl:block">/);
  assert.match(explicit, /<aside[^>]*class="[^"]*min-w-0[^"]* block"/);
  assert.match(explicit, /Back to rules/);
  assert.match(explicit, new RegExp(`data-rule-detail="${fixture.review.id}"`));

  const empty = render(await (await createFixture()).overview(), "fr");
  assert.match(empty, /Aucune règle pour l’instant/);
  assert.doesNotMatch(empty, /<aside/);
  assert.doesNotMatch(empty, /xl:grid-cols/);

  const noMatch = render(await fixture.overview({ query: "zzz" }), "de");
  assert.match(noMatch, /Keine passenden Regeln/);
  assert.match(noMatch, /Filter zurücksetzen/);
});

test("rules list and detail components render canonical values without fabricated data", async () => {
  const fixture = await seededFixture();
  const overview = await fixture.overview({ ruleId: fixture.transport.id });
  const visible = overview.rules.filter((rule) => overview.visibleRuleIds.includes(rule.id));
  const table = renderToStaticMarkup(
    createElement(RulesTable, { labels: en, locale: "en-US", onSelect: () => {}, rules: visible, selectedId: fixture.transport.id, timeZone: "UTC" }),
  );
  assert.match(table, new RegExp(`data-rule-id="${fixture.transport.id}" data-selected="true"`));
  assert.match(table, /Merchant contains/);
  assert.match(table, /Set category/);
  assert.match(table, /Send to inbox/);
  assert.match(table, /aria-label="Not applied yet"/);

  const cards = renderToStaticMarkup(createElement(RulesCardList, { labels: en, onSelect: () => {}, rules: visible, selectedId: null }));
  assert.match(cards, /2 applied/);
  assert.match(cards, /0 applied/);

  const detail = renderToStaticMarkup(
    createElement(RuleDetailPanel, {
      executions: overview.selected!.executions,
      labels: en,
      locale: "en-US",
      rule: overview.selected!.rule,
      timeZone: "UTC",
    }),
  );
  assert.match(detail, /When a transaction is created/);
  assert.match(detail, /Transaction kind is/);
  assert.match(detail, /Cash wallet/);
  assert.match(detail, /by you/);
  assert.equal((detail.match(/data-execution-id=/g) ?? []).length, 2);
  assert.match(detail, /Categorized/);

  const skeleton = renderToStaticMarkup(createElement(RulesSkeleton));
  assert.match(skeleton, /data-rules-skeleton/);
  assert.match(skeleton, /hidden xl:block/);
});
