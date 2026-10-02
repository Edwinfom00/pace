import { and, asc, count, desc, eq, gte, isNull, ne, notExists, or, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db/client";
import {
  financialInboxItems,
  ledgerAccounts,
  ledgerCategories,
  ledgerMerchants,
  ledgerTransactionCorrections,
  ledgerTransactions,
  recurringPayments,
  transactionClassifications,
} from "@/db/schema";

import type { InboxReason } from "../domain";
import type {
  InboxOverviewReadInput,
  InboxOverviewReadResult,
  InboxOverviewReadRow,
  InboxReasonCount,
  InboxOverviewReader,
  InboxOverviewSort,
} from "../inbox-overview";

const REASON_SAMPLE_SCAN_LIMIT = 50;

export class DatabaseFinancialInboxOverviewReader implements InboxOverviewReader {
  async readInboxOverview(input: InboxOverviewReadInput): Promise<InboxOverviewReadResult> {
    const basePredicates = currentInboxPredicates(input.workspaceId, "OPEN");
    const recentlyResolvedPredicates = currentInboxPredicates(input.workspaceId, "RESOLVED");
    const filteredPredicates = input.reason
      ? [...basePredicates, eq(financialInboxItems.reason, input.reason)]
      : basePredicates;
    const suggestedCategory = alias(ledgerCategories, "inbox_suggested_category");

    const [records, recentlyResolvedRecords, unresolved, filtered, reasonCounts, resolvedSince, amountTotals, merchantSamples] = await Promise.all([
      db
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
        .innerJoin(
          ledgerTransactions,
          and(
            eq(ledgerTransactions.id, financialInboxItems.transactionId),
            eq(ledgerTransactions.workspaceId, input.workspaceId),
          ),
        )
        .leftJoin(
          ledgerAccounts,
          and(eq(ledgerAccounts.id, ledgerTransactions.accountId), eq(ledgerAccounts.workspaceId, input.workspaceId)),
        )
        .leftJoin(
          ledgerCategories,
          and(
            eq(ledgerCategories.id, ledgerTransactions.categoryId),
            or(isNull(ledgerCategories.workspaceId), eq(ledgerCategories.workspaceId, input.workspaceId)),
          ),
        )
        .leftJoin(
          ledgerMerchants,
          and(eq(ledgerMerchants.id, ledgerTransactions.merchantId), eq(ledgerMerchants.workspaceId, input.workspaceId)),
        )
        .leftJoin(
          transactionClassifications,
          and(
            eq(transactionClassifications.id, financialInboxItems.classificationId),
            eq(transactionClassifications.workspaceId, input.workspaceId),
          ),
        )
        .leftJoin(
          suggestedCategory,
          and(
            eq(suggestedCategory.id, transactionClassifications.suggestedCategoryId),
            or(isNull(suggestedCategory.workspaceId), eq(suggestedCategory.workspaceId, input.workspaceId)),
          ),
        )
        .leftJoin(
          recurringPayments,
          and(
            eq(recurringPayments.id, financialInboxItems.recurringPaymentId),
            eq(recurringPayments.workspaceId, input.workspaceId),
          ),
        )
        .where(and(...filteredPredicates))
        .orderBy(...overviewOrder(input.sort))
        .offset(input.offset)
        .limit(input.limit),
      db
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
        .innerJoin(
          ledgerTransactions,
          and(
            eq(ledgerTransactions.id, financialInboxItems.transactionId),
            eq(ledgerTransactions.workspaceId, input.workspaceId),
          ),
        )
        .leftJoin(
          ledgerAccounts,
          and(eq(ledgerAccounts.id, ledgerTransactions.accountId), eq(ledgerAccounts.workspaceId, input.workspaceId)),
        )
        .leftJoin(
          ledgerCategories,
          and(
            eq(ledgerCategories.id, ledgerTransactions.categoryId),
            or(isNull(ledgerCategories.workspaceId), eq(ledgerCategories.workspaceId, input.workspaceId)),
          ),
        )
        .leftJoin(
          ledgerMerchants,
          and(eq(ledgerMerchants.id, ledgerTransactions.merchantId), eq(ledgerMerchants.workspaceId, input.workspaceId)),
        )
        .leftJoin(
          transactionClassifications,
          and(
            eq(transactionClassifications.id, financialInboxItems.classificationId),
            eq(transactionClassifications.workspaceId, input.workspaceId),
          ),
        )
        .leftJoin(
          suggestedCategory,
          and(
            eq(suggestedCategory.id, transactionClassifications.suggestedCategoryId),
            or(isNull(suggestedCategory.workspaceId), eq(suggestedCategory.workspaceId, input.workspaceId)),
          ),
        )
        .leftJoin(
          recurringPayments,
          and(
            eq(recurringPayments.id, financialInboxItems.recurringPaymentId),
            eq(recurringPayments.workspaceId, input.workspaceId),
          ),
        )
        .where(and(...recentlyResolvedPredicates))
        .orderBy(desc(financialInboxItems.resolvedAt), desc(financialInboxItems.id))
        .limit(3),
      db
        .select({ total: count() })
        .from(financialInboxItems)
        .innerJoin(
          ledgerTransactions,
          and(
            eq(ledgerTransactions.id, financialInboxItems.transactionId),
            eq(ledgerTransactions.workspaceId, input.workspaceId),
          ),
        )
        .where(and(...basePredicates)),
      db
        .select({ total: count() })
        .from(financialInboxItems)
        .innerJoin(
          ledgerTransactions,
          and(
            eq(ledgerTransactions.id, financialInboxItems.transactionId),
            eq(ledgerTransactions.workspaceId, input.workspaceId),
          ),
        )
        .where(and(...filteredPredicates)),
      db
        .select({ reason: financialInboxItems.reason, total: count() })
        .from(financialInboxItems)
        .innerJoin(
          ledgerTransactions,
          and(
            eq(ledgerTransactions.id, financialInboxItems.transactionId),
            eq(ledgerTransactions.workspaceId, input.workspaceId),
          ),
        )
        .where(and(...basePredicates))
        .groupBy(financialInboxItems.reason),
      db
        .select({ total: count() })
        .from(financialInboxItems)
        .innerJoin(
          ledgerTransactions,
          and(
            eq(ledgerTransactions.id, financialInboxItems.transactionId),
            eq(ledgerTransactions.workspaceId, input.workspaceId),
          ),
        )
        .where(and(...recentlyResolvedPredicates, gte(financialInboxItems.resolvedAt, input.resolvedSince))),
      db
        .select({ currency: ledgerTransactions.currency, total: sum(ledgerTransactions.amountMinor), items: count() })
        .from(financialInboxItems)
        .innerJoin(
          ledgerTransactions,
          and(
            eq(ledgerTransactions.id, financialInboxItems.transactionId),
            eq(ledgerTransactions.workspaceId, input.workspaceId),
          ),
        )
        .where(and(...basePredicates))
        .groupBy(ledgerTransactions.currency),
      db
        .select({ reason: financialInboxItems.reason, merchantName: ledgerMerchants.name })
        .from(financialInboxItems)
        .innerJoin(
          ledgerTransactions,
          and(
            eq(ledgerTransactions.id, financialInboxItems.transactionId),
            eq(ledgerTransactions.workspaceId, input.workspaceId),
          ),
        )
        .leftJoin(
          ledgerMerchants,
          and(eq(ledgerMerchants.id, ledgerTransactions.merchantId), eq(ledgerMerchants.workspaceId, input.workspaceId)),
        )
        .where(and(...basePredicates))
        .orderBy(desc(financialInboxItems.createdAt), desc(financialInboxItems.id))
        .limit(REASON_SAMPLE_SCAN_LIMIT),
    ]);

    return {
      rows: records.map((record) => ({
        item: record.item,
        transaction: {
          transaction: record.transaction,
          account: record.account,
          category: record.category,
          merchant: record.merchant,
        },
        classification: record.classification,
        suggestedCategory: record.suggestedCategory,
        recurring: record.recurring
          ? {
              id: record.recurring.id,
              status: record.recurring.status,
              origin: record.recurring.origin,
              cadenceDays: record.recurring.cadenceDays,
            }
          : null,
      })) as readonly InboxOverviewReadRow[],
      recentlyResolvedRows: recentlyResolvedRecords.map((record) => ({
        item: record.item,
        transaction: {
          transaction: record.transaction,
          account: record.account,
          category: record.category,
          merchant: record.merchant,
        },
        classification: record.classification,
        suggestedCategory: record.suggestedCategory,
        recurring: record.recurring
          ? {
              id: record.recurring.id,
              status: record.recurring.status,
              origin: record.recurring.origin,
              cadenceDays: record.recurring.cadenceDays,
            }
          : null,
      })) as readonly InboxOverviewReadRow[],
      unresolvedCount: unresolved[0]?.total ?? 0,
      filteredCount: filtered[0]?.total ?? 0,
      reasonCounts: reasonCounts.map((entry) => ({
        reason: entry.reason as InboxReason,
        count: entry.total,
      })) satisfies readonly InboxReasonCount[],
      resolvedSinceCount: resolvedSince[0]?.total ?? 0,
      openAmountTotals: amountTotals.map((entry) => ({
        currency: entry.currency,
        minor: BigInt(entry.total ?? "0"),
        count: entry.items,
      })),
      reasonMerchantSamples: merchantSamples.map((sample) => ({
        reason: sample.reason as InboxReason,
        merchantName: sample.merchantName,
      })),
    };
  }
}

function overviewOrder(sort: InboxOverviewSort) {
  if (sort === "LARGEST") {
    return [desc(ledgerTransactions.amountMinor), desc(financialInboxItems.createdAt), desc(financialInboxItems.id)];
  }
  if (sort === "OLDEST") return [asc(financialInboxItems.createdAt), asc(financialInboxItems.id)];
  return [desc(financialInboxItems.createdAt), desc(financialInboxItems.id)];
}

function currentInboxPredicates(workspaceId: string, status: "OPEN" | "RESOLVED") {
  const reversal = alias(ledgerTransactions, "inbox_transaction_reversal");
  return [
    eq(financialInboxItems.workspaceId, workspaceId),
    eq(financialInboxItems.status, status),
    eq(ledgerTransactions.workspaceId, workspaceId),
    ne(ledgerTransactions.kind, "OPENING_BALANCE"),
    isNull(ledgerTransactions.reversalOfTransactionId),
    notExists(
      db
        .select({ id: reversal.id })
        .from(reversal)
        .where(
          and(
            eq(reversal.workspaceId, workspaceId),
            eq(reversal.reversalOfTransactionId, ledgerTransactions.id),
          ),
        ),
    ),
    notExists(
      db
        .select({ id: ledgerTransactionCorrections.id })
        .from(ledgerTransactionCorrections)
        .where(
          and(
            eq(ledgerTransactionCorrections.workspaceId, workspaceId),
            or(
              eq(ledgerTransactionCorrections.originalTransactionId, ledgerTransactions.id),
              eq(ledgerTransactionCorrections.reversalTransactionId, ledgerTransactions.id),
            ),
          ),
        ),
    ),
  ];
}
