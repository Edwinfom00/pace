import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { DashboardLabels } from "@/i18n/dashboard-messages";
import {
  isUserFacingLedgerTransaction,
  type LedgerAccountBalance,
  type LedgerAccountRecord,
  type LedgerCategoryRecord,
  type LedgerMerchantRecord,
  type LedgerOpeningBalanceReadRecord,
  type LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import type { WorkspaceMembershipRecord } from "@/modules/workspaces/domain";

import { createNameResolver } from "../overview/get-insights-overview";
import type { InsightsRange } from "../overview/insights-overview.types";
import { buildAccountAnalysis } from "./account-analysis";
import type { AccountAnalysis } from "./account-analysis.types";

export interface AccountAnalysisReaders {
  readonly findMembership: (
    workspaceId: string,
    userId: string,
  ) => Promise<WorkspaceMembershipRecord | null>;
  readonly listAccounts: (
    workspaceId: string,
  ) => Promise<LedgerAccountRecord[]>;
  readonly getAccountBalance: (
    workspaceId: string,
    accountId: string,
  ) => Promise<LedgerAccountBalance | null>;
  readonly findOpeningBalance: (
    workspaceId: string,
    accountId: string,
  ) => Promise<LedgerOpeningBalanceReadRecord | null>;
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

export interface GetAccountAnalysisInput {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly accountId: string;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly labels: DashboardLabels;
  readonly range: InsightsRange;
  readonly periodKey: string | undefined;
  readonly now: Date;
}

export async function getAccountAnalysisWithReaders(
  input: GetAccountAnalysisInput,
  readers: AccountAnalysisReaders,
): Promise<AccountAnalysis | null> {
  const membership = await readers.findMembership(
    input.workspaceId,
    input.actor.userId,
  );
  if (!membership)
    throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const accounts = await readers.listAccounts(input.workspaceId);
  const account = accounts.find(
    (candidate) =>
      candidate.id === input.accountId &&
      candidate.workspaceId === input.workspaceId,
  );
  if (!account) return null;

  const [balance, openingBalance, transactions, categories, merchants] =
    await Promise.all([
      readers.getAccountBalance(input.workspaceId, account.id),
      readers.findOpeningBalance(input.workspaceId, account.id),
      readers.listTransactions(input.workspaceId),
      readers.listCategories(input.workspaceId),
      readers.listMerchants(input.workspaceId),
    ]);
  if (!balance || balance.currency !== account.currency) {
    throw new Error(
      "Canonical account balance currency does not match the account currency.",
    );
  }

  const accountNames = new Map(
    accounts.map((candidate) => [candidate.id, candidate.name]),
  );
  return buildAccountAnalysis({
    transactions: transactions.filter(isUserFacingLedgerTransaction),
    account,
    balance: {
      currentBalanceMinor: balance.currentBalanceMinor,
      availableBalanceMinor: balance.availableBalanceMinor,
      spendabilityMode: balance.spendabilityMode,
    },
    openingBalance:
      openingBalance &&
      openingBalance.transaction.status === "POSTED" &&
      openingBalance.transaction.currency === account.currency
        ? {
            amountMinor: openingBalance.transaction.amountMinor,
            occurredAt: openingBalance.transaction.occurredAt,
          }
        : null,
    workspaceCurrency: input.workspaceCurrency,
    locale: input.locale,
    timeZone: input.timeZone,
    range: input.range,
    periodKey: input.periodKey,
    now: input.now,
    resolveName: createNameResolver(input.labels, categories, merchants),
    resolveAccountName: (accountId) => accountNames.get(accountId) ?? null,
  });
}
