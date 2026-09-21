import type { AuthenticatedActor } from "@/authorization/session";
import type { RecurringPaymentView } from "@/modules/financial-inbox/financial-inbox-service";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import type { LedgerAccountRecord, LedgerCategoryRecord } from "@/modules/ledger/domain";
import { getLedgerService } from "@/modules/ledger/server";

import {
  buildRecurringOverview,
  type RecurringOverview,
  type RecurringOverviewFilter,
} from "../domain/recurring-overview";

export type RecurringOverviewReaders = {
  readonly listRecurring: (
    actor: AuthenticatedActor,
    workspaceId: string,
  ) => Promise<readonly RecurringPaymentView[]>;
  readonly listAccounts: (
    actor: AuthenticatedActor,
    workspaceId: string,
  ) => Promise<readonly LedgerAccountRecord[]>;
  readonly listCategories: (
    actor: AuthenticatedActor,
    workspaceId: string,
  ) => Promise<readonly LedgerCategoryRecord[]>;
};

export type GetRecurringOverviewInput = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly filter: RecurringOverviewFilter;
  readonly timeZone: string;
  readonly now?: Date;
};

/**
 * Read-only, workspace-scoped composition of M4 recurring patterns and their
 * already-authoritative ledger relationships. It creates no transactions or balances.
 */
export async function getRecurringOverview(input: GetRecurringOverviewInput): Promise<RecurringOverview> {
  const recurring = getFinancialInboxService();
  const ledger = getLedgerService();
  return getRecurringOverviewWithReaders(input, {
    listRecurring: (actor, workspaceId) => recurring.listRecurring(actor, workspaceId),
    listAccounts: (actor, workspaceId) => ledger.listAccounts(actor, workspaceId),
    listCategories: (actor, workspaceId) => ledger.listCategories(actor, workspaceId),
  });
}

export async function getRecurringOverviewWithReaders(
  { actor, workspaceId, filter, timeZone, now = new Date() }: GetRecurringOverviewInput,
  readers: RecurringOverviewReaders,
): Promise<RecurringOverview> {
  const [payments, accounts, categories] = await Promise.all([
    readers.listRecurring(actor, workspaceId),
    readers.listAccounts(actor, workspaceId),
    readers.listCategories(actor, workspaceId),
  ]);

  return buildRecurringOverview({ payments, accounts, categories, filter, timeZone, now });
}
