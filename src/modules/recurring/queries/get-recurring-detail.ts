import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission, type WorkspaceRole } from "@/authorization/workspace-permissions";
import type { RecurringPaymentView } from "@/modules/financial-inbox/financial-inbox-service";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import { currentFinancialTransactions } from "@/modules/ledger/correction-chain";
import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerTransactionFilters,
  LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import { getLedgerService } from "@/modules/ledger/server";
import {
  DatabaseWorkspaceRepository,
  type WorkspaceRepository,
} from "@/modules/workspaces/repositories/workspace-repository";
import { projectRecurringPaymentOccurrences } from "@/modules/overview/domain/overview-right-rail";
import { mapTransactionListItem } from "@/modules/transactions/queries/get-transactions-page";

import type { RecurringDetail, RecurringDetailHistory } from "../domain/recurring-detail";
import { getRecurringCapabilities } from "../domain/recurring-action-policy";

export type RecurringDetailReaders = {
  readonly findMembership: Pick<WorkspaceRepository, "findMembership">["findMembership"];
  readonly listRecurring: (actor: AuthenticatedActor, workspaceId: string) => Promise<readonly RecurringPaymentView[]>;
  readonly listAccounts: (actor: AuthenticatedActor, workspaceId: string) => Promise<readonly LedgerAccountRecord[]>;
  readonly listCategories: (actor: AuthenticatedActor, workspaceId: string) => Promise<readonly LedgerCategoryRecord[]>;
  readonly listMerchants: (actor: AuthenticatedActor, workspaceId: string) => Promise<readonly LedgerMerchantRecord[]>;
  readonly listTransactions: (
    actor: AuthenticatedActor,
    workspaceId: string,
    filters: LedgerTransactionFilters,
  ) => Promise<readonly LedgerTransactionRecord[]>;
};

export type GetRecurringDetailInput = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly recurringId: string;
  readonly timeZone: string;
  readonly now?: Date;
};


export async function getRecurringDetail(input: GetRecurringDetailInput): Promise<RecurringDetail | null> {
  const recurring = getFinancialInboxService();
  const ledger = getLedgerService();
  const workspaces = new DatabaseWorkspaceRepository();
  return getRecurringDetailWithReaders(input, {
    findMembership: (workspaceId, userId) => workspaces.findMembership(workspaceId, userId),
    listRecurring: (actor, workspaceId) => recurring.listRecurring(actor, workspaceId),
    listAccounts: (actor, workspaceId) => ledger.listAccounts(actor, workspaceId),
    listCategories: (actor, workspaceId) => ledger.listCategories(actor, workspaceId),
    listMerchants: (actor, workspaceId) => ledger.listMerchants(actor, workspaceId),
    listTransactions: (actor, workspaceId, filters) => ledger.listTransactions(actor, workspaceId, filters),
  });
}

export async function getRecurringDetailWithReaders(
  { actor, workspaceId, recurringId, timeZone, now = new Date() }: GetRecurringDetailInput,
  readers: RecurringDetailReaders,
): Promise<RecurringDetail | null> {
  const membership = await readers.findMembership(workspaceId, actor.userId);
  if (!membership) throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const payment = (await readers.listRecurring(actor, workspaceId)).find((candidate) => candidate.id === recurringId);
  if (!payment) return null;

  const [accounts, categories, merchants] = await Promise.all([
    readers.listAccounts(actor, workspaceId),
    readers.listCategories(actor, workspaceId),
    readers.listMerchants(actor, workspaceId),
  ]);
  const merchant = payment.normalizedMerchant
    ? merchants.find((candidate) => candidate.normalizedName === payment.normalizedMerchant) ?? null
    : null;
  const evidence = merchant
    ? await readers.listTransactions(actor, workspaceId, {
      accountId: payment.accountId ?? undefined,
      merchantId: merchant.id,
      statuses: ["POSTED"],
    })
    : [];

  return buildRecurringDetail({
    payment,
    accounts,
    categories,
    merchants,
    evidence,
    merchant,
    now,
    timeZone,
    workspaceRole: membership.role,
  });
}

export function buildRecurringDetail({
  payment,
  accounts,
  categories,
  merchants,
  evidence,
  merchant,
  now,
  timeZone,
  workspaceRole,
}: {
  readonly payment: RecurringPaymentView;
  readonly accounts: readonly LedgerAccountRecord[];
  readonly categories: readonly LedgerCategoryRecord[];
  readonly merchants: readonly LedgerMerchantRecord[];
  readonly evidence: readonly LedgerTransactionRecord[];
  readonly merchant: LedgerMerchantRecord | null;
  readonly now: Date;
  readonly timeZone: string;
  readonly workspaceRole: WorkspaceRole;
}): RecurringDetail {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const merchantById = new Map(merchants.map((entry) => [entry.id, entry]));
  const sampleIds = new Set(payment.sampleTransactionIds);
  const relatedRecords = currentFinancialTransactions(evidence)
    .filter((transaction) => sampleIds.has(transaction.id))
    .sort((left, right) =>
      right.occurredAt.getTime() - left.occurredAt.getTime() || right.createdAt.getTime() - left.createdAt.getTime(),
    );
  const relatedTransactions = relatedRecords.map((transaction) => mapTransactionListItem({
    transaction,
    account: transaction.accountId ? accountById.get(transaction.accountId) ?? null : null,
    category: transaction.categoryId ? categoryById.get(transaction.categoryId) ?? null : null,
    merchant: transaction.merchantId ? merchantById.get(transaction.merchantId) ?? null : null,
  }, payment.normalizedMerchant ?? payment.displayName ?? "Recurring payment"));
  const history: RecurringDetailHistory[] = relatedRecords.map((transaction, index) => ({
    date: transaction.occurredAt.toISOString(),
    amount: { minor: transaction.amountMinor.toString(), currency: transaction.currency },
    transaction: relatedTransactions[index]!,
  }));
  const lastOccurrenceAt = history[0]?.date ?? (payment.origin === "MANUAL" ? null : payment.lastOccurredAt);
  const upcomingDates = payment.status === "IGNORED" || payment.lifecycle === "PAUSED"
    ? []
    : projectRecurringPaymentOccurrences(payment, now, timeZone, 12);
  const account = payment.accountId ? accountById.get(payment.accountId) ?? null : null;
  const category = payment.categoryId ? categoryById.get(payment.categoryId) ?? null : null;

  return {
    id: payment.id,
    title: payment.displayName ?? merchant?.name ?? payment.normalizedMerchant ?? "Recurring payment",
    direction: payment.direction === "INCOME" ? "INFLOW" : "OUTFLOW",
    status: payment.status,
    lifecycle: payment.lifecycle,
    reviewState: payment.status === "CANDIDATE" ? "NEEDS_REVIEW" : null,
    capabilities: getRecurringCapabilities({ recurring: payment, workspaceRole }),
    amount: { minor: payment.typicalAmountMinor, currency: payment.currency, kind: "TYPICAL" },
    cadenceDays: payment.cadenceDays,
    startedAt: payment.firstOccurredAt,
    lastOccurrenceAt,
    nextOccurrenceAt: upcomingDates[0] ?? null,
    editableNextOccurrenceAt: payment.nextOccurrenceAt,
    account: account ? { id: account.id, name: account.name } : null,
    category: category ? { id: category.id, name: category.name, systemKey: category.systemKey } : null,
    merchant: merchant ? { id: merchant.id, name: merchant.name } : null,
    origin: payment.origin === "MANUAL" ? "MANUAL" : "DETERMINISTIC_DETECTION",
    sampleCount: payment.sampleTransactionIds.length,
    updatedAt: payment.updatedAt,
    upcomingOccurrences: upcomingDates.map((date) => ({
      date,
      amount: { minor: payment.typicalAmountMinor, currency: payment.currency },
    })),
    history,
    relatedTransactions,
  };
}
