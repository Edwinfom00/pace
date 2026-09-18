import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import { resolveMerchantLogo } from "@/lib/transaction-visuals/merchant-logo-matcher";
import { resolveTransactionIcon } from "@/lib/transaction-visuals/transaction-icon-matcher";
import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type {
  TransactionAccountImpact,
  TransactionDetailAccount,
  TransactionDetailData,
  TransactionDetailMerchant,
  TransactionMonthlyCategoryContext,
} from "../domain/transaction-detail";
import { getTransactionCapabilities } from "../domain/transaction-action-policy";

type TransactionDetailLedgerRepository = Pick<
  LedgerRepository,
  "findTransaction" | "findAccount" | "findCategory" | "findMerchant" | "listTransactions"
>;
type TransactionDetailWorkspaceRepository = Pick<WorkspaceRepository, "findMembership">;

export type GetTransactionDetailInput = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly transactionId: string;
  readonly timeZone: string;
};


export async function getTransactionDetail(
  input: GetTransactionDetailInput,
  dependencies: {
    readonly ledger: TransactionDetailLedgerRepository;
    readonly workspaces: TransactionDetailWorkspaceRepository;
  },
): Promise<TransactionDetailData | null> {
  const membership = await dependencies.workspaces.findMembership(input.workspaceId, input.actor.userId);
  if (!membership) throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const transaction = await dependencies.ledger.findTransaction(input.workspaceId, input.transactionId);
  if (!transaction) return null;

  const [account, transferAccount, category, merchant, workspaceTransactions] = await Promise.all([
    transaction.accountId ? dependencies.ledger.findAccount(input.workspaceId, transaction.accountId) : null,
    transaction.transferAccountId ? dependencies.ledger.findAccount(input.workspaceId, transaction.transferAccountId) : null,
    transaction.categoryId ? dependencies.ledger.findCategory(input.workspaceId, transaction.categoryId) : null,
    transaction.merchantId ? dependencies.ledger.findMerchant(input.workspaceId, transaction.merchantId) : null,
    dependencies.ledger.listTransactions(input.workspaceId),
  ]);

  return {
    id: transaction.id,
    kind: transaction.kind,
    status: transaction.status,
    amount: { currency: transaction.currency, minor: transaction.amountMinor.toString() },
    occurredAt: transaction.occurredAt.toISOString(),
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
    note: transaction.note,
    merchant: merchant ? mapMerchant(transaction, category, merchant) : null,
    category: category ? { id: category.id, name: category.name, systemKey: category.systemKey } : null,
    account: account ? mapAccount(account) : null,
    transferAccount: transferAccount ? mapAccount(transferAccount) : null,
    source: mapSource(transaction.source),
    capabilities: getTransactionCapabilities({
      transaction,
      workspaceRole: membership.role,
      refundedAmountMinor: refundedAmountFor(transaction, workspaceTransactions),
    }),
    context: {
      accountImpacts: [account, transferAccount]
        .filter((candidate): candidate is LedgerAccountRecord => candidate !== null)
        .map((candidate) => mapAccountImpact(candidate, transaction, workspaceTransactions)),
      monthlyCategory: category
        ? mapMonthlyCategoryContext(transaction, category, workspaceTransactions, input.timeZone)
        : null,
    },
  };
}

function refundedAmountFor(
  transaction: LedgerTransactionRecord,
  workspaceTransactions: readonly LedgerTransactionRecord[],
): bigint {
  if (transaction.kind !== "EXPENSE") return 0n;
  return workspaceTransactions
    .filter((candidate) => candidate.kind === "REFUND" && candidate.refundedTransactionId === transaction.id)
    .reduce((total, refund) => total + refund.amountMinor, 0n);
}

function mapAccount(account: LedgerAccountRecord): TransactionDetailAccount {
  return { id: account.id, name: account.name, currency: account.currency };
}

function mapMerchant(
  transaction: LedgerTransactionRecord,
  category: LedgerCategoryRecord | null,
  merchant: LedgerMerchantRecord,
): TransactionDetailMerchant {
  const icon = resolveTransactionIcon({
    merchantName: merchant.name,
    categoryName: category?.name,
    categoryKey: category?.systemKey,
    transactionKind: transaction.kind,
  });
  const merchantLogo = resolveMerchantLogo({ merchantName: merchant.name });

  return {
    id: merchant.id,
    name: merchant.name,
    iconKey: icon.iconKey,
    merchantLogoKey: merchantLogo?.key ?? null,
  };
}

function mapSource(source: Record<string, unknown>): TransactionDetailData["source"] {
  const provider = typeof source.provider === "string" ? source.provider.toLocaleLowerCase("en-US") : null;
  const origin = typeof source.origin === "string" ? source.origin.toLocaleUpperCase("en-US") : null;

  if (provider === "manual" || origin === "MANUAL") {
    return { label: "Added manually", channel: "Pace web app" };
  }

  return null;
}

function mapAccountImpact(
  account: LedgerAccountRecord,
  selected: LedgerTransactionRecord,
  transactions: readonly LedgerTransactionRecord[],
): TransactionAccountImpact {
  const effect = accountEffect(selected, account.id);
  const balanceAfter = transactions
    .filter((transaction) => transaction.currency === account.currency && wasRecordedBy(selected, transaction))
    .reduce((balance, transaction) => balance + accountEffect(transaction, account.id), account.openingBalanceMinor);

  return {
    account: mapAccount(account),
    direction: effect >= 0n ? "INCREASE" : "DECREASE",
    effect: { currency: selected.currency, minor: absoluteMinor(effect).toString() },
    balanceAfter: { currency: account.currency, minor: balanceAfter.toString() },
  };
}

function mapMonthlyCategoryContext(
  selected: LedgerTransactionRecord,
  category: LedgerCategoryRecord,
  transactions: readonly LedgerTransactionRecord[],
  timeZone: string,
): TransactionMonthlyCategoryContext | null {
  if (selected.kind !== "EXPENSE" && selected.kind !== "INCOME") return null;

  const period = calendarMonth(selected.occurredAt, timeZone);
  const total = transactions.reduce((sum, transaction) => {
    if (
      transaction.status !== "POSTED"
      || transaction.kind !== selected.kind
      || transaction.categoryId !== selected.categoryId
      || transaction.currency !== selected.currency
      || calendarMonth(transaction.occurredAt, timeZone) !== period
    ) {
      return sum;
    }
    return sum + transaction.amountMinor;
  }, 0n);

  return {
    categoryName: category.name,
    direction: selected.kind === "EXPENSE" ? "SPENDING" : "INCOME",
    period,
    total: { currency: selected.currency, minor: total.toString() },
  };
}

function accountEffect(transaction: LedgerTransactionRecord, accountId: string): bigint {
  if (transaction.status !== "POSTED") return 0n;

  if (transaction.kind === "INCOME" || transaction.kind === "REFUND") {
    return transaction.accountId === accountId ? transaction.amountMinor : 0n;
  }
  if (transaction.kind === "EXPENSE") {
    return transaction.accountId === accountId ? -transaction.amountMinor : 0n;
  }
  if (transaction.kind === "TRANSFER") {
    if (transaction.accountId === accountId) return -transaction.amountMinor;
    if (transaction.transferAccountId === accountId) return transaction.amountMinor;
  }
  return 0n;
}

function wasRecordedBy(selected: LedgerTransactionRecord, candidate: LedgerTransactionRecord): boolean {
  if (candidate.occurredAt < selected.occurredAt) return true;
  if (candidate.occurredAt > selected.occurredAt) return false;
  if (candidate.createdAt < selected.createdAt) return true;
  if (candidate.createdAt > selected.createdAt) return false;
  return candidate.id.localeCompare(selected.id) <= 0;
}

function calendarMonth(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone,
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value;
  return `${part("year")}-${part("month")}`;
}

function absoluteMinor(value: bigint): bigint {
  return value < 0n ? -value : value;
}
