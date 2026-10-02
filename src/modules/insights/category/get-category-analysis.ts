import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { localizeCategoryName } from "@/modules/ledger/category-localization";
import {
  isUserFacingLedgerTransaction,
  type LedgerCategoryRecord,
  type LedgerMerchantRecord,
  type LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import type { WorkspaceMembershipRecord } from "@/modules/workspaces/domain";

import { createNameResolver } from "../overview/get-insights-overview";
import type { InsightsRange } from "../overview/insights-overview.types";
import {
  buildCategoryAnalysis,
  type CategoryAnalysisScope,
} from "./category-analysis";
import type { CategoryAnalysis } from "./category-analysis.types";

export interface CategoryAnalysisReaders {
  readonly findMembership: (
    workspaceId: string,
    userId: string,
  ) => Promise<WorkspaceMembershipRecord | null>;
  readonly listTransactions: (
    workspaceId: string,
  ) => Promise<LedgerTransactionRecord[]>;
  readonly listCategories: (
    workspaceId: string,
  ) => Promise<LedgerCategoryRecord[]>;
  readonly listMerchants: (
    workspaceId: string,
  ) => Promise<LedgerMerchantRecord[]>;
}

export interface GetCategoryAnalysisInput {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly categoryId: string;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly labels: DashboardLabels;
  readonly range: InsightsRange;
  readonly periodKey: string | undefined;
  readonly requestedCurrency: string | null;
  readonly now: Date;
}

export async function getCategoryAnalysisWithReaders(
  input: GetCategoryAnalysisInput,
  readers: CategoryAnalysisReaders,
): Promise<CategoryAnalysis | null> {
  const membership = await readers.findMembership(
    input.workspaceId,
    input.actor.userId,
  );
  if (!membership)
    throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const categories = await readers.listCategories(input.workspaceId);
  const scope = categoryScope(input.categoryId, categories, input.labels);
  if (!scope) return null;

  const [transactions, merchants] = await Promise.all([
    readers.listTransactions(input.workspaceId),
    readers.listMerchants(input.workspaceId),
  ]);
  return buildCategoryAnalysis({
    transactions: transactions.filter(isUserFacingLedgerTransaction),
    category: scope,
    requestedCurrency: input.requestedCurrency,
    workspaceCurrency: input.workspaceCurrency,
    locale: input.locale,
    timeZone: input.timeZone,
    range: input.range,
    periodKey: input.periodKey,
    now: input.now,
    resolveName: createNameResolver(input.labels, categories, merchants),
  });
}

export function categoryScope(
  categoryId: string,
  categories: readonly LedgerCategoryRecord[],
  labels: DashboardLabels,
): CategoryAnalysisScope | null {
  const category = categories.find((candidate) => candidate.id === categoryId);
  if (!category || category.kind !== "EXPENSE") return null;
  const parent = category.parentCategoryId
    ? (categories.find(
        (candidate) => candidate.id === category.parentCategoryId,
      ) ?? null)
    : null;
  return {
    id: category.id,
    name: localizeCategoryName(labels, category),
    parent: parent
      ? { id: parent.id, name: localizeCategoryName(labels, parent) }
      : null,
    children: parent
      ? []
      : categories
          .filter((candidate) => candidate.parentCategoryId === category.id)
          .map((child) => ({
            id: child.id,
            name: localizeCategoryName(labels, child),
          }))
          .sort((left, right) => left.name.localeCompare(right.name)),
  };
}
