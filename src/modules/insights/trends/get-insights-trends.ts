import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { DashboardLabels } from "@/i18n/dashboard-messages";
import {
  isUserFacingLedgerTransaction,
  type LedgerAccountRecord,
  type LedgerCategoryRecord,
  type LedgerMerchantRecord,
  type LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import type { WorkspaceMembershipRecord } from "@/modules/workspaces/domain";

import { createNameResolver } from "../overview/get-insights-overview";
import {
  buildInsightsTrends,
  type TrendsRecurringPayment,
} from "./insights-trends";
import type { InsightsTrends, TrendsRange } from "./insights-trends.types";

export interface InsightsTrendsReaders {
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
  readonly listAccounts: (
    workspaceId: string,
  ) => Promise<LedgerAccountRecord[]>;
  readonly listRecurringPayments: (
    workspaceId: string,
  ) => Promise<readonly TrendsRecurringPayment[]>;
}

export interface GetInsightsTrendsInput {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly labels: DashboardLabels;
  readonly range: TrendsRange;
  readonly periodKey: string | undefined;
  readonly requestedCurrency: string | null;
  readonly now: Date;
}

export async function getInsightsTrendsWithReaders(
  input: GetInsightsTrendsInput,
  readers: InsightsTrendsReaders,
): Promise<InsightsTrends> {
  const membership = await readers.findMembership(
    input.workspaceId,
    input.actor.userId,
  );
  if (!membership)
    throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const [transactions, categories, merchants, accounts, recurringPayments] =
    await Promise.all([
      readers.listTransactions(input.workspaceId),
      readers.listCategories(input.workspaceId),
      readers.listMerchants(input.workspaceId),
      readers.listAccounts(input.workspaceId),
      readers.listRecurringPayments(input.workspaceId),
    ]);
  return buildInsightsTrends({
    transactions: transactions.filter(isUserFacingLedgerTransaction),
    accounts: accounts.filter(
      (account) => account.workspaceId === input.workspaceId,
    ),
    recurringPayments,
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
