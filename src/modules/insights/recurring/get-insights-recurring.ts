import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import {
  isUserFacingLedgerTransaction,
  type LedgerMerchantRecord,
  type LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import type { WorkspaceMembershipRecord } from "@/modules/workspaces/domain";

import type { TrendsRange } from "../trends/insights-trends.types";
import {
  buildInsightsRecurring,
  type RecurringAnalyticsCorrection,
  type RecurringAnalyticsPayment,
} from "./insights-recurring";
import type {
  InsightsRecurring,
  RecurringHorizon,
} from "./insights-recurring.types";

export interface InsightsRecurringReaders {
  readonly findMembership: (
    workspaceId: string,
    userId: string,
  ) => Promise<WorkspaceMembershipRecord | null>;
  readonly listTransactions: (
    workspaceId: string,
  ) => Promise<LedgerTransactionRecord[]>;
  readonly listMerchants: (
    workspaceId: string,
  ) => Promise<LedgerMerchantRecord[]>;
  readonly listCorrections: (
    workspaceId: string,
  ) => Promise<readonly RecurringAnalyticsCorrection[]>;
  readonly listRecurringPayments: (
    workspaceId: string,
  ) => Promise<readonly RecurringAnalyticsPayment[]>;
}

export interface GetInsightsRecurringInput {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly workspaceCurrency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly range: TrendsRange;
  readonly horizon: RecurringHorizon;
  readonly periodKey: string | undefined;
  readonly requestedCurrency: string | null;
  readonly now: Date;
}

export async function getInsightsRecurringWithReaders(
  input: GetInsightsRecurringInput,
  readers: InsightsRecurringReaders,
): Promise<InsightsRecurring> {
  const membership = await readers.findMembership(
    input.workspaceId,
    input.actor.userId,
  );
  if (!membership)
    throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const [transactions, merchants, corrections, recurringPayments] =
    await Promise.all([
      readers.listTransactions(input.workspaceId),
      readers.listMerchants(input.workspaceId),
      readers.listCorrections(input.workspaceId),
      readers.listRecurringPayments(input.workspaceId),
    ]);
  return buildInsightsRecurring({
    transactions: transactions.filter(isUserFacingLedgerTransaction),
    merchants,
    corrections,
    recurringPayments,
    requestedCurrency: input.requestedCurrency,
    workspaceCurrency: input.workspaceCurrency,
    locale: input.locale,
    timeZone: input.timeZone,
    range: input.range,
    horizon: input.horizon,
    periodKey: input.periodKey,
    now: input.now,
  });
}
