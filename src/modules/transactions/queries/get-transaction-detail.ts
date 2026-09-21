import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import { resolveMerchantLogo } from "@/lib/transaction-visuals/merchant-logo-matcher";
import { resolveTransactionIcon } from "@/lib/transaction-visuals/transaction-icon-matcher";
import { isUserFacingLedgerTransaction } from "@/modules/ledger/domain";
import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerTransactionAuditRecord,
  LedgerTransactionCorrectionRecord,
  LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { currentFinancialTransactions, isCurrentFinancialTransaction } from "@/modules/ledger/correction-chain";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type {
  TransactionAccountImpact,
  TransactionCorrectionChange,
  TransactionDetailAccount,
  TransactionDetailCorrection,
  TransactionDetailData,
  TransactionDetailMerchant,
  TransactionMonthlyCategoryContext,
  TransactionDetailOrigin,
  TransactionDetailReversal,
  TransactionRefundSummary,
} from "../domain/transaction-detail";
import { getTransactionCapabilities } from "../domain/transaction-action-policy";

type TransactionDetailLedgerRepository = Pick<
  LedgerRepository,
  | "findTransaction"
  | "findAccount"
  | "findCategory"
  | "findMerchant"
  | "findOpeningBalance"
  | "listTransactions"
  | "listRefundsForEffectiveExpense"
  | "findTransactionCorrectionByOriginal"
  | "findTransactionCorrectionByReplacement"
  | "findTransactionCorrectionByTransactionId"
  | "findTransactionReversalByOriginal"
  | "listTransactionAudit"
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
  // Opening Balance is an internal ledger event and deliberately has no
  // ordinary Transaction Detail route or UI surface.
  if (!isUserFacingLedgerTransaction(transaction)) return null;

  const [account, transferAccount, category, merchant, workspaceTransactions] = await Promise.all([
    transaction.accountId ? dependencies.ledger.findAccount(input.workspaceId, transaction.accountId) : null,
    transaction.transferAccountId ? dependencies.ledger.findAccount(input.workspaceId, transaction.transferAccountId) : null,
    transaction.categoryId ? dependencies.ledger.findCategory(input.workspaceId, transaction.categoryId) : null,
    transaction.merchantId ? dependencies.ledger.findMerchant(input.workspaceId, transaction.merchantId) : null,
    dependencies.ledger.listTransactions(input.workspaceId),
  ]);
  const [correction, reversal] = await Promise.all([
    getDetailCorrection({
    ledger: dependencies.ledger,
    transaction,
    transactions: workspaceTransactions,
    workspaceId: input.workspaceId,
    }),
    getDetailReversal({
      ledger: dependencies.ledger,
      transaction,
      workspaceId: input.workspaceId,
    }),
  ]);
  const effectiveTransaction = correction
    ? workspaceTransactions.find((candidate) => candidate.id === correction.currentTransactionId) ?? transaction
    : transaction;
  const [effectiveAccount, effectiveTransferAccount, effectiveCategory] = await Promise.all([
    effectiveTransaction.accountId === transaction.accountId
      ? account
      : effectiveTransaction.accountId
        ? dependencies.ledger.findAccount(input.workspaceId, effectiveTransaction.accountId)
        : null,
    effectiveTransaction.transferAccountId === transaction.transferAccountId
      ? transferAccount
      : effectiveTransaction.transferAccountId
        ? dependencies.ledger.findAccount(input.workspaceId, effectiveTransaction.transferAccountId)
        : null,
    effectiveTransaction.categoryId === transaction.categoryId
      ? category
      : effectiveTransaction.categoryId
        ? dependencies.ledger.findCategory(input.workspaceId, effectiveTransaction.categoryId)
        : null,
  ]);

  const isCurrentEffectiveExpense = !reversal && transaction.kind === "EXPENSE" && effectiveTransaction.id === transaction.id;
  const refunds = isCurrentEffectiveExpense
    ? await dependencies.ledger.listRefundsForEffectiveExpense(input.workspaceId, effectiveTransaction.id)
    : [];
  const refundedAmountMinor = refunds.reduce((total, refund) => total + refund.amountMinor, 0n);
  const refundAudit = isCurrentEffectiveExpense
    ? await dependencies.ledger.listTransactionAudit(input.workspaceId, effectiveTransaction.id)
    : [];
  const accountImpacts = reversal
    ? []
    : await Promise.all(
      [effectiveAccount, effectiveTransferAccount]
        .filter((candidate): candidate is LedgerAccountRecord => candidate !== null)
        .map(async (candidate) => mapAccountImpact(
          candidate,
          effectiveTransaction,
          workspaceTransactions,
          (await dependencies.ledger.findOpeningBalance(input.workspaceId, candidate.id))?.transaction ?? null,
        )),
    );

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
      refundedAmountMinor,
      isCurrentEffective: isCurrentFinancialTransaction(transaction, workspaceTransactions),
    }),
    correction,
    reversal,
    refund: isCurrentEffectiveExpense
      ? refundSummary({
        expense: effectiveTransaction,
        refunds,
        audits: refundAudit,
        sourceAccount: effectiveAccount ? mapAccount(effectiveAccount) : null,
      })
      : null,
    context: {
      accountImpacts,
      monthlyCategory: !reversal && effectiveCategory
        ? mapMonthlyCategoryContext(effectiveTransaction, effectiveCategory, workspaceTransactions, input.timeZone)
        : null,
      effectiveTransactionId: effectiveTransaction.id,
    },
  };
}

async function getDetailReversal({
  ledger,
  transaction,
  workspaceId,
}: {
  readonly ledger: TransactionDetailLedgerRepository;
  readonly transaction: LedgerTransactionRecord;
  readonly workspaceId: string;
}): Promise<TransactionDetailReversal | null> {
  const [reversal, audits] = await Promise.all([
    ledger.findTransactionReversalByOriginal(workspaceId, transaction.id),
    ledger.listTransactionAudit(workspaceId, transaction.id),
  ]);
  if (!reversal) return null;

  const audit = audits.find(
    (candidate) => candidate.action === "MANUAL_REVERSAL"
      && candidate.metadata.reversalTransactionId === reversal.id,
  );
  // Financial corrections also create linked technical inverse entries. Only
  // the explicit canonical manual-reversal audit makes the original record
  // a user-visible reversed transaction.
  if (!audit) return null;
  return {
    reversalTransactionId: reversal.id,
    reversedAt: audit.createdAt.toISOString(),
    reason: typeof audit.metadata.reason === "string" ? audit.metadata.reason : null,
  };
}

async function getDetailCorrection({
  ledger,
  transaction,
  transactions,
  workspaceId,
}: {
  readonly ledger: TransactionDetailLedgerRepository;
  readonly transaction: LedgerTransactionRecord;
  readonly transactions: readonly LedgerTransactionRecord[];
  readonly workspaceId: string;
}): Promise<TransactionDetailCorrection | null> {
  const [outgoing, incoming, direct] = await Promise.all([
    ledger.findTransactionCorrectionByOriginal(workspaceId, transaction.id),
    ledger.findTransactionCorrectionByReplacement(workspaceId, transaction.id),
    transaction.reversalOfTransactionId === null
      ? Promise.resolve(null)
      : ledger.findTransactionCorrectionByTransactionId(workspaceId, transaction.id),
  ]);
  if (!outgoing && !incoming && !direct) return null;

  const technical = transaction.reversalOfTransactionId !== null;
  const eventCorrection = technical ? direct : outgoing ?? incoming;
  if (!eventCorrection) return null;

  const transactionById = new Map(transactions.map((candidate) => [candidate.id, candidate]));
  const original = technical
    ? transactionById.get(eventCorrection.originalTransactionId) ?? transaction
    : await correctionRoot(transaction.id, incoming, ledger, workspaceId, transactionById);
  const current = technical
    ? transactionById.get(eventCorrection.replacementTransactionId) ?? transaction
    : await correctionCurrent(transaction.id, outgoing, ledger, workspaceId, transactionById);
  const audit = await correctionAudit(ledger, workspaceId, eventCorrection);
  const before = transactionById.get(eventCorrection.originalTransactionId);
  const after = transactionById.get(eventCorrection.replacementTransactionId);

  return {
    state: technical ? "TECHNICAL" : current.id === transaction.id ? "CURRENT" : "HISTORICAL",
    correctionId: eventCorrection.id,
    originalTransactionId: original.id,
    currentTransactionId: current.id,
    previousTransactionId: technical || !incoming ? null : incoming.originalTransactionId,
    nextTransactionId: technical || !outgoing ? null : outgoing.replacementTransactionId,
    correctedAt: (audit ?? eventCorrection).createdAt.toISOString(),
    reason: eventCorrection.reason,
    changes: before && after && audit
      ? await correctionChanges(audit, before, after, ledger, workspaceId)
      : [],
    originalAmount: money(original),
    currentAmount: money(current),
    activity: audit ? { occurredAt: audit.createdAt.toISOString() } : null,
  };
}

async function correctionRoot(
  transactionId: string,
  incoming: LedgerTransactionCorrectionRecord | null,
  ledger: TransactionDetailLedgerRepository,
  workspaceId: string,
  transactions: ReadonlyMap<string, LedgerTransactionRecord>,
): Promise<LedgerTransactionRecord> {
  let currentId = transactionId;
  let correction = incoming;
  const seen = new Set<string>();
  while (correction && !seen.has(correction.id)) {
    seen.add(correction.id);
    currentId = correction.originalTransactionId;
    correction = await ledger.findTransactionCorrectionByReplacement(workspaceId, currentId);
  }
  return transactions.get(currentId) ?? transactions.get(transactionId)!;
}

async function correctionCurrent(
  transactionId: string,
  outgoing: LedgerTransactionCorrectionRecord | null,
  ledger: TransactionDetailLedgerRepository,
  workspaceId: string,
  transactions: ReadonlyMap<string, LedgerTransactionRecord>,
): Promise<LedgerTransactionRecord> {
  let currentId = transactionId;
  let correction = outgoing;
  const seen = new Set<string>();
  while (correction && !seen.has(correction.id)) {
    seen.add(correction.id);
    currentId = correction.replacementTransactionId;
    correction = await ledger.findTransactionCorrectionByOriginal(workspaceId, currentId);
  }
  return transactions.get(currentId) ?? transactions.get(transactionId)!;
}

async function correctionAudit(
  ledger: TransactionDetailLedgerRepository,
  workspaceId: string,
  correction: LedgerTransactionCorrectionRecord,
): Promise<LedgerTransactionAuditRecord | null> {
  const audits = await ledger.listTransactionAudit(workspaceId, correction.originalTransactionId);
  return audits.find(
    (audit) => audit.action === "CORRECT" && audit.metadata.correctionId === correction.id,
  ) ?? null;
}

async function correctionChanges(
  audit: LedgerTransactionAuditRecord,
  before: LedgerTransactionRecord,
  after: LedgerTransactionRecord,
  ledger: TransactionDetailLedgerRepository,
  workspaceId: string,
): Promise<readonly TransactionCorrectionChange[]> {
  const rawChanges = audit.metadata.changes;
  if (!rawChanges || typeof rawChanges !== "object" || Array.isArray(rawChanges)) return [];
  const changed = rawChanges as Record<string, unknown>;
  const accountName = async (id: string | null) => id ? (await ledger.findAccount(workspaceId, id))?.name ?? null : null;
  const categoryName = async (id: string | null) => id ? (await ledger.findCategory(workspaceId, id))?.name ?? null : null;
  const merchantName = async (id: string | null) => id ? (await ledger.findMerchant(workspaceId, id))?.name ?? null : null;
  const changes: TransactionCorrectionChange[] = [];

  if ("amountMinor" in changed) changes.push({ field: "AMOUNT", before: money(before), after: money(after) });
  if ("accountId" in changed) changes.push({
    field: "ACCOUNT", before: await accountName(before.accountId), after: await accountName(after.accountId),
  });
  if ("transferAccountId" in changed) changes.push({
    field: "TRANSFER_ACCOUNT", before: await accountName(before.transferAccountId), after: await accountName(after.transferAccountId),
  });
  if ("categoryId" in changed) changes.push({
    field: "CATEGORY", before: await categoryName(before.categoryId), after: await categoryName(after.categoryId),
  });
  if ("counterpartyId" in changed) changes.push({
    field: "MERCHANT", before: await merchantName(before.merchantId), after: await merchantName(after.merchantId),
  });
  if ("occurredAt" in changed) changes.push({
    field: "DATE", before: before.occurredAt.toISOString(), after: after.occurredAt.toISOString(),
  });
  if ("note" in changed) changes.push({ field: "NOTE", before: before.note, after: after.note });
  return changes;
}

function money(transaction: LedgerTransactionRecord) {
  return { currency: transaction.currency, minor: transaction.amountMinor.toString() };
}

function refundSummary({
  expense,
  refunds,
  audits,
  sourceAccount,
}: {
  readonly expense: LedgerTransactionRecord;
  readonly refunds: readonly LedgerTransactionRecord[];
  readonly audits: readonly LedgerTransactionAuditRecord[];
  readonly sourceAccount: TransactionDetailAccount | null;
}): TransactionRefundSummary {
  const refundedAmountMinor = refunds.reduce((total, refund) => total + refund.amountMinor, 0n);
  const refundById = new Map(refunds.map((refund) => [refund.id, refund]));
  const activity = audits.flatMap((audit) => {
    if (audit.action !== "REFUND_ISSUED") return [];
    const refundTransactionId = typeof audit.metadata.refundTransactionId === "string"
      ? audit.metadata.refundTransactionId
      : null;
    const refund = refundTransactionId ? refundById.get(refundTransactionId) : undefined;
    if (!refund) return [];
    return [{
      id: audit.id,
      refundTransactionId: refund.id,
      amount: money(refund),
      occurredAt: audit.createdAt.toISOString(),
      reason: typeof audit.metadata.reason === "string" ? audit.metadata.reason : null,
    }];
  });
  return {
    effectiveExpenseAmount: money(expense),
    refundedAmount: { currency: expense.currency, minor: refundedAmountMinor.toString() },
    remainingRefundableAmount: { currency: expense.currency, minor: (expense.amountMinor - refundedAmountMinor).toString() },
    status: refundedAmountMinor === 0n ? "NONE" : refundedAmountMinor === expense.amountMinor ? "FULL" : "PARTIAL",
    sourceAccount,
    refunds: refunds.map((refund) => ({
      id: refund.id,
      amount: money(refund),
      occurredAt: refund.occurredAt.toISOString(),
      note: refund.note,
      reason: refundReason(refund),
    })),
    activity,
  };
}

function refundReason(refund: LedgerTransactionRecord): string | null {
  const metadata = refund.source.refund;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return typeof (metadata as Record<string, unknown>).reason === "string"
    ? (metadata as Record<string, string>).reason
    : null;
}

function mapAccount(account: LedgerAccountRecord): TransactionDetailAccount {
  return { id: account.id, name: account.name, currency: account.currency, type: account.type };
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
  const origin = toDetailOrigin(source.origin);

  if (origin) return { origin, channel: origin === "MANUAL" ? "WEB" : null };
  if (provider === "manual") return { origin: "MANUAL", channel: "WEB" };
  if (provider === "pace-agent" || provider === "agent") return { origin: "AGENT", channel: null };
  if (provider === "pace-import" || provider === "import") return { origin: "IMPORT", channel: null };
  if (provider === "bank-sync") return { origin: "BANK_SYNC", channel: null };
  return null;
}

function toDetailOrigin(value: unknown): TransactionDetailOrigin | null {
  if (typeof value !== "string") return null;
  const origin = value.toLocaleUpperCase("en-US");
  return origin === "MANUAL" || origin === "AGENT" || origin === "IMPORT" || origin === "BANK_SYNC"
    ? origin
    : null;
}

function mapAccountImpact(
  account: LedgerAccountRecord,
  selected: LedgerTransactionRecord,
  transactions: readonly LedgerTransactionRecord[],
  openingBalance: LedgerTransactionRecord | null,
): TransactionAccountImpact {
  const effect = accountEffect(selected, account.id);
  const balanceAfter = transactions
    .filter((transaction) => transaction.currency === account.currency && wasRecordedBy(selected, transaction))
    .reduce(
      (balance, transaction) => balance + accountEffect(transaction, account.id),
      openingBalance && wasRecordedBy(selected, openingBalance)
        ? accountEffect(openingBalance, account.id)
        : 0n,
    );

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
  const total = currentFinancialTransactions(transactions).reduce((sum, transaction) => {
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
    categorySystemKey: category.systemKey,
    direction: selected.kind === "EXPENSE" ? "SPENDING" : "INCOME",
    period,
    total: { currency: selected.currency, minor: total.toString() },
  };
}

function accountEffect(transaction: LedgerTransactionRecord, accountId: string): bigint {
  if (transaction.status !== "POSTED") return 0n;

  if (transaction.kind === "INCOME" || transaction.kind === "REFUND") {
    const amount = transaction.reversalOfTransactionId == null ? transaction.amountMinor : -transaction.amountMinor;
    return transaction.accountId === accountId ? amount : 0n;
  }
  if (transaction.kind === "EXPENSE") {
    const amount = transaction.reversalOfTransactionId == null ? -transaction.amountMinor : transaction.amountMinor;
    return transaction.accountId === accountId ? amount : 0n;
  }
  if (transaction.kind === "OPENING_BALANCE") {
    const amount = transaction.reversalOfTransactionId == null ? transaction.amountMinor : -transaction.amountMinor;
    return transaction.accountId === accountId ? amount : 0n;
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
