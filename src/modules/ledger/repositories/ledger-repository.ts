import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";

import { db } from "@/db/client";
import {
  ledgerAccounts,
  ledgerCategories,
  ledgerMerchants,
  ledgerTransactions,
} from "@/db/schema";

import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerTransactionFilters,
  LedgerTransactionRecord,
} from "../domain";

export type CreateLedgerAccountRecord = Omit<
  LedgerAccountRecord,
  "archivedAt" | "createdAt" | "updatedAt"
>;
export type CreateLedgerCategoryRecord = Omit<LedgerCategoryRecord, "createdAt" | "updatedAt">;
export type CreateLedgerMerchantRecord = Omit<LedgerMerchantRecord, "createdAt" | "updatedAt">;
export type CreateLedgerTransactionRecord = Omit<
  LedgerTransactionRecord,
  "createdAt" | "updatedAt"
>;

export interface LedgerRepository {
  createAccount(input: CreateLedgerAccountRecord): Promise<LedgerAccountRecord>;
  listAccounts(workspaceId: string): Promise<LedgerAccountRecord[]>;
  findAccount(workspaceId: string, accountId: string): Promise<LedgerAccountRecord | null>;

  createCategory(input: CreateLedgerCategoryRecord): Promise<LedgerCategoryRecord>;
  listCategories(workspaceId: string): Promise<LedgerCategoryRecord[]>;
  findCategory(workspaceId: string, categoryId: string): Promise<LedgerCategoryRecord | null>;

  createMerchant(input: CreateLedgerMerchantRecord): Promise<LedgerMerchantRecord>;
  listMerchants(workspaceId: string): Promise<LedgerMerchantRecord[]>;
  findMerchant(workspaceId: string, merchantId: string): Promise<LedgerMerchantRecord | null>;
  findMerchantByNormalizedName(
    workspaceId: string,
    normalizedName: string,
  ): Promise<LedgerMerchantRecord | null>;

  createTransaction(input: CreateLedgerTransactionRecord): Promise<LedgerTransactionRecord>;
  findTransaction(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionRecord | null>;
  findTransactionByFingerprint(
    workspaceId: string,
    fingerprint: string,
  ): Promise<LedgerTransactionRecord | null>;
  listTransactions(
    workspaceId: string,
    filters?: LedgerTransactionFilters,
  ): Promise<LedgerTransactionRecord[]>;
  listRefundsForTransaction(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionRecord[]>;
}

export class DatabaseLedgerRepository implements LedgerRepository {
  async createAccount(input: CreateLedgerAccountRecord): Promise<LedgerAccountRecord> {
    const [record] = await db.insert(ledgerAccounts).values(input).returning();
    if (!record) throw new Error("Failed to create ledger account.");
    return record;
  }

  async listAccounts(workspaceId: string): Promise<LedgerAccountRecord[]> {
    return db.select().from(ledgerAccounts).where(eq(ledgerAccounts.workspaceId, workspaceId));
  }

  async findAccount(workspaceId: string, accountId: string): Promise<LedgerAccountRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.workspaceId, workspaceId), eq(ledgerAccounts.id, accountId)))
      .limit(1);
    return record ?? null;
  }

  async createCategory(input: CreateLedgerCategoryRecord): Promise<LedgerCategoryRecord> {
    const [record] = await db.insert(ledgerCategories).values(input).returning();
    if (!record) throw new Error("Failed to create ledger category.");
    return record;
  }

  async listCategories(workspaceId: string): Promise<LedgerCategoryRecord[]> {
    return db
      .select()
      .from(ledgerCategories)
      .where(or(eq(ledgerCategories.workspaceId, workspaceId), isNull(ledgerCategories.workspaceId)));
  }

  async findCategory(workspaceId: string, categoryId: string): Promise<LedgerCategoryRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerCategories)
      .where(
        and(
          eq(ledgerCategories.id, categoryId),
          or(eq(ledgerCategories.workspaceId, workspaceId), isNull(ledgerCategories.workspaceId)),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async createMerchant(input: CreateLedgerMerchantRecord): Promise<LedgerMerchantRecord> {
    const [record] = await db.insert(ledgerMerchants).values(input).returning();
    if (!record) throw new Error("Failed to create ledger merchant.");
    return record;
  }

  async listMerchants(workspaceId: string): Promise<LedgerMerchantRecord[]> {
    return db.select().from(ledgerMerchants).where(eq(ledgerMerchants.workspaceId, workspaceId));
  }

  async findMerchant(workspaceId: string, merchantId: string): Promise<LedgerMerchantRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerMerchants)
      .where(and(eq(ledgerMerchants.workspaceId, workspaceId), eq(ledgerMerchants.id, merchantId)))
      .limit(1);
    return record ?? null;
  }

  async findMerchantByNormalizedName(
    workspaceId: string,
    normalizedName: string,
  ): Promise<LedgerMerchantRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerMerchants)
      .where(
        and(
          eq(ledgerMerchants.workspaceId, workspaceId),
          eq(ledgerMerchants.normalizedName, normalizedName),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async createTransaction(input: CreateLedgerTransactionRecord): Promise<LedgerTransactionRecord> {
    const [record] = await db.insert(ledgerTransactions).values(input).returning();
    if (!record) throw new Error("Failed to create ledger transaction.");
    return record;
  }

  async findTransaction(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerTransactions)
      .where(
        and(
          eq(ledgerTransactions.workspaceId, workspaceId),
          eq(ledgerTransactions.id, transactionId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findTransactionByFingerprint(
    workspaceId: string,
    fingerprint: string,
  ): Promise<LedgerTransactionRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerTransactions)
      .where(
        and(
          eq(ledgerTransactions.workspaceId, workspaceId),
          eq(ledgerTransactions.deduplicationFingerprint, fingerprint),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async listTransactions(
    workspaceId: string,
    filters: LedgerTransactionFilters = {},
  ): Promise<LedgerTransactionRecord[]> {
    const predicates = [eq(ledgerTransactions.workspaceId, workspaceId)];

    if (filters.statuses?.length) {
      predicates.push(inArray(ledgerTransactions.status, [...filters.statuses]));
    }
    if (filters.accountId) predicates.push(eq(ledgerTransactions.accountId, filters.accountId));
    if (filters.categoryId) predicates.push(eq(ledgerTransactions.categoryId, filters.categoryId));
    if (filters.merchantId) predicates.push(eq(ledgerTransactions.merchantId, filters.merchantId));
    if (filters.occurredFrom) predicates.push(gte(ledgerTransactions.occurredAt, filters.occurredFrom));
    if (filters.occurredTo) predicates.push(lte(ledgerTransactions.occurredAt, filters.occurredTo));

    const query = db
      .select()
      .from(ledgerTransactions)
      .where(and(...predicates))
      .orderBy(desc(ledgerTransactions.occurredAt), desc(ledgerTransactions.createdAt));

    return filters.limit === undefined ? query : query.limit(filters.limit);
  }

  async listRefundsForTransaction(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionRecord[]> {
    return db
      .select()
      .from(ledgerTransactions)
      .where(
        and(
          eq(ledgerTransactions.workspaceId, workspaceId),
          eq(ledgerTransactions.kind, "REFUND"),
          eq(ledgerTransactions.refundedTransactionId, transactionId),
        ),
      );
  }
}
