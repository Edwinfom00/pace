import { and, desc, eq, isNull, ne, notExists, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db/client";
import {
  financialInboxAudits,
  financialInboxItems,
  ledgerAccounts,
  ledgerCategories,
  ledgerMerchants,
  ledgerTransactionCorrections,
  ledgerTransactions,
  recurringPayments,
  transactionClassifications,
} from "@/db/schema";
import type { LedgerTransactionListRow } from "@/modules/ledger/domain";

import type {
  InboxItemDetailReadInput,
  InboxItemDetailReadRecord,
  InboxItemDetailReader,
} from "../inbox-item-detail";



export class DatabaseFinancialInboxDetailReader implements InboxItemDetailReader {
  async readInboxItemDetail(input: InboxItemDetailReadInput): Promise<InboxItemDetailReadRecord | null> {
    const primary = await this.transactionBundleForInboxItem(input.workspaceId, input.inboxItemId);
    if (!primary) return null;

    const [relatedItems, audits, corrections] = await Promise.all([
      db.select().from(financialInboxItems).where(and(
        eq(financialInboxItems.workspaceId, input.workspaceId),
        eq(financialInboxItems.transactionId, primary.item.transactionId),
      )),
      db.select().from(financialInboxAudits).where(and(
        eq(financialInboxAudits.workspaceId, input.workspaceId),
        primary.item.classificationId
          ? or(
              eq(financialInboxAudits.inboxItemId, primary.item.id),
              eq(financialInboxAudits.classificationId, primary.item.classificationId),
            )
          : eq(financialInboxAudits.inboxItemId, primary.item.id),
      )).orderBy(desc(financialInboxAudits.createdAt)),
      db.select().from(ledgerTransactionCorrections).where(
        eq(ledgerTransactionCorrections.workspaceId, input.workspaceId),
      ),
    ]);

    const effectiveTransactionId = effectiveTransactionIdFor(
      primary.transaction.transaction.id,
      corrections,
    );
    const effective = effectiveTransactionId === primary.transaction.transaction.id
      ? primary.transaction
      : await this.transactionBundleForTransaction(input.workspaceId, effectiveTransactionId);
    if (!effective) return null;

    const similarTransactions = effective.transaction.merchantId
      ? await this.similarTransactionBundles({
          workspaceId: input.workspaceId,
          merchantId: effective.transaction.merchantId,
          excludedTransactionId: effective.transaction.id,
          limit: input.similarLimit,
        })
      : [];

    return {
      item: primary.item,
      sourceTransaction: primary.transaction,
      effectiveTransaction: effective,
      classification: primary.classification,
      suggestedCategory: primary.suggestedCategory,
      recurring: primary.recurring,
      relatedItems,
      similarTransactions,
      audits,
      corrections,
    };
  }

  private async transactionBundleForInboxItem(workspaceId: string, inboxItemId: string) {
    const suggestedCategory = alias(ledgerCategories, "inbox_detail_suggested_category");
    const [record] = await db
      .select({
        item: financialInboxItems,
        transaction: ledgerTransactions,
        account: ledgerAccounts,
        category: ledgerCategories,
        merchant: ledgerMerchants,
        classification: transactionClassifications,
        suggestedCategory,
        recurring: recurringPayments,
      })
      .from(financialInboxItems)
      .innerJoin(ledgerTransactions, and(
        eq(ledgerTransactions.id, financialInboxItems.transactionId),
        eq(ledgerTransactions.workspaceId, workspaceId),
      ))
      .leftJoin(ledgerAccounts, and(
        eq(ledgerAccounts.id, ledgerTransactions.accountId),
        eq(ledgerAccounts.workspaceId, workspaceId),
      ))
      .leftJoin(ledgerCategories, and(
        eq(ledgerCategories.id, ledgerTransactions.categoryId),
        or(isNull(ledgerCategories.workspaceId), eq(ledgerCategories.workspaceId, workspaceId)),
      ))
      .leftJoin(ledgerMerchants, and(
        eq(ledgerMerchants.id, ledgerTransactions.merchantId),
        eq(ledgerMerchants.workspaceId, workspaceId),
      ))
      .leftJoin(transactionClassifications, and(
        eq(transactionClassifications.id, financialInboxItems.classificationId),
        eq(transactionClassifications.workspaceId, workspaceId),
      ))
      .leftJoin(suggestedCategory, and(
        eq(suggestedCategory.id, transactionClassifications.suggestedCategoryId),
        or(isNull(suggestedCategory.workspaceId), eq(suggestedCategory.workspaceId, workspaceId)),
      ))
      .leftJoin(recurringPayments, and(
        eq(recurringPayments.id, financialInboxItems.recurringPaymentId),
        eq(recurringPayments.workspaceId, workspaceId),
      ))
      .where(and(
        eq(financialInboxItems.workspaceId, workspaceId),
        eq(financialInboxItems.id, inboxItemId),
      ))
      .limit(1);

    return record
      ? {
          item: record.item,
          transaction: asTransactionBundle(record),
          classification: record.classification,
          suggestedCategory: record.suggestedCategory,
          recurring: record.recurring,
        }
      : null;
  }

  private async transactionBundleForTransaction(workspaceId: string, transactionId: string): Promise<LedgerTransactionListRow | null> {
    const [record] = await db
      .select({ transaction: ledgerTransactions, account: ledgerAccounts, category: ledgerCategories, merchant: ledgerMerchants })
      .from(ledgerTransactions)
      .leftJoin(ledgerAccounts, and(
        eq(ledgerAccounts.id, ledgerTransactions.accountId),
        eq(ledgerAccounts.workspaceId, workspaceId),
      ))
      .leftJoin(ledgerCategories, and(
        eq(ledgerCategories.id, ledgerTransactions.categoryId),
        or(isNull(ledgerCategories.workspaceId), eq(ledgerCategories.workspaceId, workspaceId)),
      ))
      .leftJoin(ledgerMerchants, and(
        eq(ledgerMerchants.id, ledgerTransactions.merchantId),
        eq(ledgerMerchants.workspaceId, workspaceId),
      ))
      .where(and(eq(ledgerTransactions.workspaceId, workspaceId), eq(ledgerTransactions.id, transactionId)))
      .limit(1);
    return record ? asTransactionBundle(record) : null;
  }

  private async similarTransactionBundles({
    workspaceId,
    merchantId,
    excludedTransactionId,
    limit,
  }: {
    readonly workspaceId: string;
    readonly merchantId: string;
    readonly excludedTransactionId: string;
    readonly limit: number;
  }): Promise<readonly LedgerTransactionListRow[]> {
    const reversal = alias(ledgerTransactions, "inbox_detail_similar_reversal");
    const correction = alias(ledgerTransactionCorrections, "inbox_detail_similar_correction");
    const records = await db
      .select({ transaction: ledgerTransactions, account: ledgerAccounts, category: ledgerCategories, merchant: ledgerMerchants })
      .from(ledgerTransactions)
      .leftJoin(ledgerAccounts, and(
        eq(ledgerAccounts.id, ledgerTransactions.accountId),
        eq(ledgerAccounts.workspaceId, workspaceId),
      ))
      .leftJoin(ledgerCategories, and(
        eq(ledgerCategories.id, ledgerTransactions.categoryId),
        or(isNull(ledgerCategories.workspaceId), eq(ledgerCategories.workspaceId, workspaceId)),
      ))
      .leftJoin(ledgerMerchants, and(
        eq(ledgerMerchants.id, ledgerTransactions.merchantId),
        eq(ledgerMerchants.workspaceId, workspaceId),
      ))
      .where(and(
        eq(ledgerTransactions.workspaceId, workspaceId),
        eq(ledgerTransactions.merchantId, merchantId),
        ne(ledgerTransactions.id, excludedTransactionId),
        isNull(ledgerTransactions.reversalOfTransactionId),
        notExists(db.select({ id: reversal.id }).from(reversal).where(and(
          eq(reversal.workspaceId, workspaceId),
          eq(reversal.reversalOfTransactionId, ledgerTransactions.id),
        ))),
        notExists(db.select({ id: correction.id }).from(correction).where(and(
          eq(correction.workspaceId, workspaceId),
          or(
            eq(correction.originalTransactionId, ledgerTransactions.id),
            eq(correction.reversalTransactionId, ledgerTransactions.id),
          ),
        ))),
      ))
      .orderBy(desc(ledgerTransactions.occurredAt), desc(ledgerTransactions.id))
      .limit(Math.max(1, Math.min(limit, 3)));
    return records.map(asTransactionBundle);
  }
}

function asTransactionBundle(record: {
  readonly transaction: LedgerTransactionListRow["transaction"];
  readonly account: LedgerTransactionListRow["account"];
  readonly category: LedgerTransactionListRow["category"];
  readonly merchant: LedgerTransactionListRow["merchant"];
}): LedgerTransactionListRow {
  return {
    transaction: record.transaction,
    account: record.account,
    category: record.category,
    merchant: record.merchant,
  };
}

function effectiveTransactionIdFor(
  sourceTransactionId: string,
  corrections: readonly { readonly originalTransactionId: string; readonly reversalTransactionId: string; readonly replacementTransactionId: string }[],
): string {
  const replacements = new Map<string, string>();
  for (const correction of corrections) {
    replacements.set(correction.originalTransactionId, correction.replacementTransactionId);
    replacements.set(correction.reversalTransactionId, correction.replacementTransactionId);
  }

  let current = sourceTransactionId;
  const seen = new Set<string>();
  while (replacements.has(current) && !seen.has(current)) {
    seen.add(current);
    current = replacements.get(current)!;
  }
  return current;
}
