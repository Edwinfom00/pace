import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import type { RecurringPaymentView } from "@/modules/financial-inbox/financial-inbox-service";
import type {
  LedgerAccountBalance,
  LedgerAccountRecord,
} from "@/modules/ledger/domain";
import { getLedgerService } from "@/modules/ledger/server";
import {
  DatabaseWorkspaceRepository,
  type WorkspaceRepository,
} from "@/modules/workspaces/repositories/workspace-repository";

import {
  buildWorkspaceForecast,
  type ForecastHorizonDays,
  type WorkspaceForecast,
} from "../domain/forecast";
import type { RecurringPaymentRecord } from "@/modules/financial-inbox/domain";

export type WorkspaceForecastReaders = {
  readonly findMembership: Pick<
    WorkspaceRepository,
    "findMembership"
  >["findMembership"];
  readonly getBalances: (
    actor: AuthenticatedActor,
    workspaceId: string,
  ) => Promise<readonly LedgerAccountBalance[]>;
  readonly listAccounts: (
    actor: AuthenticatedActor,
    workspaceId: string,
  ) => Promise<readonly LedgerAccountRecord[]>;
  readonly listRecurring: (
    actor: AuthenticatedActor,
    workspaceId: string,
  ) => Promise<readonly RecurringPaymentView[]>;
};

export type GetWorkspaceForecastInput = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly horizonDays: ForecastHorizonDays;
  readonly timeZone: string;
  readonly accountId?: string;
  readonly now?: Date;
};

/** Read-only workspace composition; it never creates ledger entries or updates account balances. */
export async function getWorkspaceForecast(
  input: GetWorkspaceForecastInput,
): Promise<WorkspaceForecast> {
  const ledger = getLedgerService();
  const recurring = getFinancialInboxService();
  const workspaces = new DatabaseWorkspaceRepository();
  return getWorkspaceForecastWithReaders(input, {
    findMembership: (workspaceId, userId) =>
      workspaces.findMembership(workspaceId, userId),
    getBalances: (actor, workspaceId) =>
      ledger.getWorkspaceAccountBalances(actor, { workspaceId }),
    listAccounts: (actor, workspaceId) =>
      ledger.listAccounts(actor, workspaceId),
    listRecurring: (actor, workspaceId) =>
      recurring.listRecurring(actor, workspaceId),
  });
}

export async function getWorkspaceForecastWithReaders(
  {
    actor,
    workspaceId,
    horizonDays,
    timeZone,
    accountId,
    now = new Date(),
  }: GetWorkspaceForecastInput,
  readers: WorkspaceForecastReaders,
): Promise<WorkspaceForecast> {
  const membership = await readers.findMembership(workspaceId, actor.userId);
  if (!membership)
    throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const [balances, accounts, recurring] = await Promise.all([
    readers.getBalances(actor, workspaceId),
    readers.listAccounts(actor, workspaceId),
    readers.listRecurring(actor, workspaceId),
  ]);
  return buildWorkspaceForecast({
    balances,
    accounts,
    recurringPayments: recurring.map((payment) =>
      toRecurringRecord(workspaceId, payment),
    ),
    horizonDays,
    now,
    timeZone,
    accountId,
  });
}

function toRecurringRecord(
  workspaceId: string,
  view: RecurringPaymentView,
): RecurringPaymentRecord {
  return {
    ...view,
    workspaceId,
    typicalAmountMinor: BigInt(view.typicalAmountMinor),
    firstOccurredAt: new Date(view.firstOccurredAt),
    lastOccurredAt: new Date(view.lastOccurredAt),
    nextOccurrenceAt: view.nextOccurrenceAt
      ? new Date(view.nextOccurrenceAt)
      : null,
    amountToleranceBps: view.amountToleranceBps ?? 0,
    detectionKey: view.id,
    confirmedByUserId: null,
    confirmedAt: null,
    ignoredByUserId: null,
    ignoredAt: null,
    createdByUserId: null,
    idempotencyKey: null,
    commandFingerprint: null,
    createdAt: new Date(view.updatedAt),
    updatedAt: new Date(view.updatedAt),
  };
}
