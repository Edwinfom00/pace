import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { DashboardLabels } from "@/i18n/dashboard-messages";
import type { InsightCandidate } from "@/money/insights";
import { UNCATEGORIZED_CATEGORY_ID, UNKNOWN_MERCHANT_ID } from "@/money";
import { localizeCategoryName } from "@/modules/ledger/category-localization";
import {
  isUserFacingLedgerTransaction,
  type LedgerCategoryRecord,
  type LedgerMerchantRecord,
  type LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import type { WorkspaceMembershipRecord } from "@/modules/workspaces/domain";

import { presentDeterministicInsights } from "./insights-deterministic";
import { buildInsightsOverview, insightsWindows, type InsightsNameResolver } from "./insights-overview";
import type { InsightsDeterministicInsights, InsightsOverview, InsightsRange } from "./insights-overview.types";

export interface InsightsOverviewReaders {
  readonly findMembership: (workspaceId: string, userId: string) => Promise<WorkspaceMembershipRecord | null>;
  readonly listTransactions: (workspaceId: string) => Promise<LedgerTransactionRecord[]>;
  readonly listCategories: (workspaceId: string) => Promise<LedgerCategoryRecord[]>;
  readonly listMerchants: (workspaceId: string) => Promise<LedgerMerchantRecord[]>;
  readonly previewInsights: (
    actor: AuthenticatedActor,
    workspaceId: string,
    input: { readonly asOf: Date; readonly currency: string },
  ) => Promise<InsightCandidate[]>;
}

export interface GetInsightsOverviewInput {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly labels: DashboardLabels;
  readonly range: InsightsRange;
  readonly periodKey: string | undefined;
  readonly requestedCurrency: string | null;
  readonly now: Date;
}

export interface InsightsOverviewResult {
  readonly overview: InsightsOverview;
  readonly insights: InsightsDeterministicInsights;
}

export async function getInsightsOverviewWithReaders(
  input: GetInsightsOverviewInput,
  readers: InsightsOverviewReaders,
): Promise<InsightsOverviewResult> {
  const membership = await readers.findMembership(input.workspaceId, input.actor.userId);
  if (!membership) throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const [transactions, categories, merchants] = await Promise.all([
    readers.listTransactions(input.workspaceId),
    readers.listCategories(input.workspaceId),
    readers.listMerchants(input.workspaceId),
  ]);
  const resolveName = createNameResolver(input.labels, categories, merchants);
  const overview = buildInsightsOverview({
    transactions: transactions.filter(isUserFacingLedgerTransaction),
    requestedCurrency: input.requestedCurrency,
    workspaceCurrency: input.workspaceCurrency,
    locale: input.locale,
    timeZone: input.timeZone,
    range: input.range,
    periodKey: input.periodKey,
    now: input.now,
    resolveName,
  });

  const anchorMonth = insightsWindows(overview.periodKey, "1m", input.timeZone, input.now).currentFull;
  const asOf = input.now < anchorMonth.end ? input.now : new Date(anchorMonth.end.getTime() - 1);
  let insights: InsightsDeterministicInsights;
  try {
    const candidates = asOf < anchorMonth.start
      ? []
      : await readers.previewInsights(input.actor, input.workspaceId, { asOf, currency: overview.currency });
    insights = {
      month: overview.periodKey,
      unavailable: false,
      items: presentDeterministicInsights({
        candidates,
        labels: input.labels,
        locale: input.locale,
        timeZone: input.timeZone,
        workspaceSlug: input.workspaceSlug,
        resolveName,
      }),
    };
  } catch {
    insights = { month: overview.periodKey, unavailable: true, items: [] };
  }

  return { overview, insights };
}

export function createNameResolver(
  labels: DashboardLabels,
  categories: readonly Pick<LedgerCategoryRecord, "id" | "name" | "systemKey">[],
  merchants: readonly Pick<LedgerMerchantRecord, "id" | "name">[],
): InsightsNameResolver {
  const categoryNames = new Map(categories.map((category) => [category.id, localizeCategoryName(labels, category)]));
  const merchantNames = new Map(merchants.map((merchant) => [merchant.id, merchant.name]));
  return (dimension, id) => {
    if (dimension === "category") {
      return id === UNCATEGORIZED_CATEGORY_ID
        ? labels["overview.activity.uncategorized"]
        : categoryNames.get(id) ?? null;
    }
    return id === UNKNOWN_MERCHANT_ID ? null : merchantNames.get(id) ?? null;
  };
}
