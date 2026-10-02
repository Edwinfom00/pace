import type { AuthenticatedActor } from "@/authorization/session";
import { canPerformWorkspaceAction, type WorkspaceRole } from "@/authorization/workspace-permissions";
import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import { getLedgerService } from "@/modules/ledger/server";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { calendarMonthPeriod } from "@/money/period";

import type { RuleExecutionRecord, RuleRecord } from "../domain";
import { suggestRulePriority } from "../rule-draft";
import {
  computeRulesKpis,
  filterRuleItems,
  RECENT_RULE_EXECUTIONS_LIMIT,
  selectRule,
  toRuleListItem,
  type RuleBuilderReferences,
  type RuleExecutionView,
  type RuleReferenceNames,
  type RulesOverview,
  type RuleStatusFilter,
} from "../rules-overview";
import { getRulesService } from "../server";

export type RulesOverviewReaders = {
  readonly listRules: (actor: AuthenticatedActor, workspaceId: string) => Promise<readonly RuleRecord[]>;
  readonly listExecutions: (actor: AuthenticatedActor, workspaceId: string) => Promise<readonly RuleExecutionRecord[]>;
  readonly listCategories: (actor: AuthenticatedActor, workspaceId: string) => Promise<readonly LedgerCategoryRecord[]>;
  readonly listAccounts: (actor: AuthenticatedActor, workspaceId: string) => Promise<readonly LedgerAccountRecord[]>;
  readonly findTransaction: (workspaceId: string, transactionId: string) => Promise<LedgerTransactionRecord | null>;
  readonly findMerchant: (workspaceId: string, merchantId: string) => Promise<LedgerMerchantRecord | null>;
};

export type GetRulesOverviewInput = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly role: WorkspaceRole;
  readonly timeZone: string;
  readonly query: string;
  readonly status: RuleStatusFilter;
  readonly ruleId?: string;
  readonly now?: Date;
};

export async function getRulesOverview(input: GetRulesOverviewInput): Promise<RulesOverview> {
  const rules = getRulesService();
  const ledger = getLedgerService();
  const ledgerRecords = new DatabaseLedgerRepository();
  return getRulesOverviewWithReaders(input, {
    listRules: (actor, workspaceId) => rules.listRules(actor, workspaceId, { includeArchived: true }),
    listExecutions: (actor, workspaceId) => rules.listRuleExecutions(actor, workspaceId),
    listCategories: (actor, workspaceId) => ledger.listCategories(actor, workspaceId),
    listAccounts: (actor, workspaceId) => ledger.listAccounts(actor, workspaceId),
    findTransaction: (workspaceId, transactionId) => ledgerRecords.findTransaction(workspaceId, transactionId),
    findMerchant: (workspaceId, merchantId) => ledgerRecords.findMerchant(workspaceId, merchantId),
  });
}

export async function getRulesOverviewWithReaders(
  { actor, workspaceId, role, timeZone, query, status, ruleId, now = new Date() }: GetRulesOverviewInput,
  readers: RulesOverviewReaders,
): Promise<RulesOverview> {
  const records = await readers.listRules(actor, workspaceId);
  const [executions, categories, accounts] = await Promise.all([
    readers.listExecutions(actor, workspaceId),
    readers.listCategories(actor, workspaceId),
    readers.listAccounts(actor, workspaceId),
  ]);
  const scopedRecords = records.filter((rule) => rule.workspaceId === workspaceId);
  const scopedExecutions = executions.filter((execution) => execution.workspaceId === workspaceId);
  const names: RuleReferenceNames = {
    categories: new Map(categories.map((category) => [category.id, { name: category.name, key: category.systemKey }])),
    accounts: new Map(
      accounts.filter((account) => account.workspaceId === workspaceId).map((account) => [account.id, account.name]),
    ),
  };
  const canManage = canPerformWorkspaceAction(role, "manage_ledger");
  const items = scopedRecords.map((rule) =>
    toRuleListItem(rule, scopedExecutions, { names, actorUserId: actor.userId, canManage }),
  );
  const filters = { query: query.trim(), status };
  const visible = filterRuleItems(items, filters);
  const selection = selectRule(items, visible, ruleId);
  const recent = selection
    ? await loadRecentExecutions(
        workspaceId,
        scopedExecutions.filter((execution) => execution.ruleId === selection.rule.id),
        readers,
      )
    : [];

  return {
    kpis: computeRulesKpis(scopedRecords, scopedExecutions, calendarMonthPeriod(now, timeZone)),
    rules: items,
    visibleRuleIds: visible.map((rule) => rule.id),
    selected: selection ? { ...selection, executions: recent } : null,
    filters,
    canManage,
    builder: canManage ? builderReferences(workspaceId, scopedRecords, categories, accounts) : null,
  };
}

function builderReferences(
  workspaceId: string,
  rules: readonly RuleRecord[],
  categories: readonly LedgerCategoryRecord[],
  accounts: readonly LedgerAccountRecord[],
): RuleBuilderReferences {
  const referencedAccounts = new Set(
    rules.flatMap((rule) => rule.conditions.flatMap((condition) => (condition.field === "ACCOUNT" ? condition.values : []))),
  );
  const names = new Map(categories.map((category) => [category.id, category.name]));
  return {
    categories: categories
      .filter((category) => category.workspaceId === null || category.workspaceId === workspaceId)
      .map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind,
        key: category.systemKey,
        parentName: category.parentCategoryId ? (names.get(category.parentCategoryId) ?? null) : null,
      }))
      .sort((left, right) =>
        (left.parentName ?? left.name).localeCompare(right.parentName ?? right.name) ||
        Number(left.parentName !== null) - Number(right.parentName !== null) ||
        left.name.localeCompare(right.name),
      ),
    accounts: accounts
      .filter((account) => account.workspaceId === workspaceId && (!account.archivedAt || referencedAccounts.has(account.id)))
      .map((account) => ({ id: account.id, name: account.name })),
    suggestedPriority: suggestRulePriority(
      rules.filter((rule) => rule.status === "ACTIVE").map((rule) => rule.priority),
    ),
  };
}

async function loadRecentExecutions(
  workspaceId: string,
  executions: readonly RuleExecutionRecord[],
  readers: Pick<RulesOverviewReaders, "findTransaction" | "findMerchant">,
): Promise<RuleExecutionView[]> {
  const recent = [...executions]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))
    .slice(0, RECENT_RULE_EXECUTIONS_LIMIT);
  return Promise.all(
    recent.map(async (execution) => {
      const transaction = await readers.findTransaction(workspaceId, execution.transactionId);
      const scoped = transaction?.workspaceId === workspaceId ? transaction : null;
      const merchant = scoped?.merchantId ? await readers.findMerchant(workspaceId, scoped.merchantId) : null;
      return {
        id: execution.id,
        transactionId: execution.transactionId,
        actionType: execution.actionType,
        outcome: execution.outcome,
        reason: execution.reason,
        executedAt: execution.updatedAt.toISOString(),
        transaction: scoped
          ? {
              label: merchant?.name ?? scoped.note ?? null,
              kind: scoped.kind,
              amountMinor: scoped.amountMinor.toString(),
              currency: scoped.currency,
              occurredAt: scoped.occurredAt.toISOString(),
            }
          : null,
      };
    }),
  );
}
