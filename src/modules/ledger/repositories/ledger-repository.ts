import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  or,
} from "drizzle-orm";

import { db, neonSql } from "@/db/client";
import {
  ledgerAccounts,
  ledgerCategories,
  ledgerMerchants,
  ledgerTransactionAudits,
  ledgerTransactions,
} from "@/db/schema";

import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerTransactionAuditRecord,
  LedgerTransactionListFilters,
  LedgerTransactionListPageInput,
  LedgerTransactionListRow,
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
export type CreateLedgerTransactionAuditRecord = Omit<LedgerTransactionAuditRecord, "createdAt">;

/**
 * This is intentionally a closed, detail-only persistence shape. It has no
 * amount, currency, account, kind, source, status, or transfer fields.
 */
export interface UpdateLedgerTransactionDetailsRecord {
  workspaceId: string;
  transactionId: string;
  expectedUpdatedAt: Date;
  categoryId: string | null;
  merchantId: string | null;
  occurredAt: Date;
  note: string | null;
  merchantToCreate: CreateLedgerMerchantRecord | null;
  audit: CreateLedgerTransactionAuditRecord;
}

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
  /**
   * Persists a newly discovered merchant and its transaction in one database
   * batch. Existing merchants continue through createTransaction.
   */
  createTransactionWithMerchant(
    input: CreateLedgerTransactionRecord,
    merchant: CreateLedgerMerchantRecord,
  ): Promise<LedgerTransactionRecord>;
  updateTransactionDetails(
    input: UpdateLedgerTransactionDetailsRecord,
  ): Promise<LedgerTransactionRecord | null>;
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
  countTransactionList(workspaceId: string, filters: LedgerTransactionListFilters): Promise<number>;
  listTransactionListCurrencies(
    workspaceId: string,
    filters: LedgerTransactionListFilters,
  ): Promise<readonly string[]>;
  listTransactionListPage(
    workspaceId: string,
    input: LedgerTransactionListPageInput,
  ): Promise<readonly LedgerTransactionListRow[]>;
  listRefundsForTransaction(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionRecord[]>;
  listTransactionAudit(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionAuditRecord[]>;
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

  async createTransactionWithMerchant(
    input: CreateLedgerTransactionRecord,
    merchant: CreateLedgerMerchantRecord,
  ): Promise<LedgerTransactionRecord> {
    const [, transactions] = await db.batch([
      db.insert(ledgerMerchants).values(merchant).returning({ id: ledgerMerchants.id }),
      db.insert(ledgerTransactions).values(input).returning(),
    ]);
    const [record] = transactions;
    if (!record) throw new Error("Failed to create ledger transaction.");
    return record;
  }

  async updateTransactionDetails(
    input: UpdateLedgerTransactionDetailsRecord,
  ): Promise<LedgerTransactionRecord | null> {
    const merchant = input.merchantToCreate;
    // Neon HTTP cannot use Drizzle's interactive transaction API. This single
    // Postgres statement is atomic: the optimistic-lock candidate must exist
    // before an optional merchant is created, the transaction is updated, and
    // its audit record is written. Any failure rolls back every CTE.
    const rows = await neonSql`
      WITH candidate AS (
        SELECT id
        FROM ledger_transaction
        WHERE workspace_id = ${input.workspaceId}
          AND id = ${input.transactionId}
          AND date_trunc('milliseconds', updated_at) = ${input.expectedUpdatedAt}
        FOR UPDATE
      ),
      merchant_to_upsert AS (
        INSERT INTO ledger_merchant (id, workspace_id, name, normalized_name, created_by_user_id)
        SELECT ${merchant?.id ?? null}, ${merchant?.workspaceId ?? null}, ${merchant?.name ?? null},
          ${merchant?.normalizedName ?? null}, ${merchant?.createdByUserId ?? null}
        WHERE ${merchant !== null} AND EXISTS (SELECT 1 FROM candidate)
        ON CONFLICT (workspace_id, normalized_name)
          DO UPDATE SET normalized_name = EXCLUDED.normalized_name
        RETURNING id
      ),
      updated AS (
        UPDATE ledger_transaction
        SET category_id = ${input.categoryId},
          merchant_id = COALESCE((SELECT id FROM merchant_to_upsert), ${input.merchantId}),
          occurred_at = ${input.occurredAt},
          note = ${input.note},
          -- Detail DTO timestamps have millisecond precision. Move every
          -- successful write at least one millisecond for a reliable token.
          updated_at = greatest(clock_timestamp(), updated_at + interval '1 millisecond')
        WHERE id IN (SELECT id FROM candidate)
        RETURNING id, workspace_id AS "workspaceId", kind, status,
          amount_minor AS "amountMinor", currency, occurred_at AS "occurredAt",
          account_id AS "accountId", transfer_account_id AS "transferAccountId",
          category_id AS "categoryId", merchant_id AS "merchantId",
          created_by_user_id AS "createdByUserId", paid_by_user_id AS "paidByUserId",
          transfer_group_id AS "transferGroupId", refunded_transaction_id AS "refundedTransactionId",
          source, deduplication_fingerprint AS "deduplicationFingerprint", note,
          created_at AS "createdAt", updated_at AS "updatedAt"
      ),
      audited AS (
        INSERT INTO ledger_transaction_audit (
          id, workspace_id, transaction_id, actor_user_id, action, metadata
        )
        SELECT ${input.audit.id}, ${input.audit.workspaceId}, updated.id,
          ${input.audit.actorUserId}, ${input.audit.action}, ${JSON.stringify(input.audit.metadata)}::jsonb
        FROM updated
      )
      SELECT * FROM updated;
    ` as unknown as readonly RawLedgerTransaction[];
    const record = rows[0];
    return record ? mapLedgerTransaction(record) : null;
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

  async countTransactionList(
    workspaceId: string,
    filters: LedgerTransactionListFilters,
  ): Promise<number> {
    const [result] = await db
      .select({ value: count() })
      .from(ledgerTransactions)
      .leftJoin(ledgerMerchants, eq(ledgerMerchants.id, ledgerTransactions.merchantId))
      .where(and(...this.transactionListPredicates(workspaceId, filters)));
    return Number(result?.value ?? 0);
  }

  async listTransactionListCurrencies(
    workspaceId: string,
    filters: LedgerTransactionListFilters,
  ): Promise<readonly string[]> {
    const records = await db
      .selectDistinct({ currency: ledgerTransactions.currency })
      .from(ledgerTransactions)
      .leftJoin(ledgerMerchants, eq(ledgerMerchants.id, ledgerTransactions.merchantId))
      .where(and(...this.transactionListPredicates(workspaceId, filters)))
      .limit(2);
    return records.map((record) => record.currency);
  }

  async listTransactionListPage(
    workspaceId: string,
    input: LedgerTransactionListPageInput,
  ): Promise<readonly LedgerTransactionListRow[]> {
    const orderBy = transactionListOrder(input.sort);
    const records = await db
      .select({
        transaction: ledgerTransactions,
        account: ledgerAccounts,
        category: ledgerCategories,
        merchant: ledgerMerchants,
      })
      .from(ledgerTransactions)
      .leftJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerTransactions.accountId))
      .leftJoin(ledgerCategories, eq(ledgerCategories.id, ledgerTransactions.categoryId))
      .leftJoin(ledgerMerchants, eq(ledgerMerchants.id, ledgerTransactions.merchantId))
      .where(and(...this.transactionListPredicates(workspaceId, input)))
      .orderBy(...orderBy)
      .offset(input.offset)
      .limit(input.limit);

    return records.map((record) => ({
      transaction: record.transaction,
      account: record.account,
      category: record.category,
      merchant: record.merchant,
    }));
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

  async listTransactionAudit(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionAuditRecord[]> {
    const records = await db
      .select()
      .from(ledgerTransactionAudits)
      .where(
        and(
          eq(ledgerTransactionAudits.workspaceId, workspaceId),
          eq(ledgerTransactionAudits.transactionId, transactionId),
        ),
      )
      .orderBy(asc(ledgerTransactionAudits.createdAt), asc(ledgerTransactionAudits.id));
    return records.map((record) => ({ ...record, action: record.action as LedgerTransactionAuditRecord["action"] }));
  }

  private transactionListPredicates(
    workspaceId: string,
    filters: LedgerTransactionListFilters,
  ) {
    const predicates = [eq(ledgerTransactions.workspaceId, workspaceId)];
    if (filters.kind) predicates.push(eq(ledgerTransactions.kind, filters.kind));
    if (filters.accountId) predicates.push(eq(ledgerTransactions.accountId, filters.accountId));
    if (filters.categoryId) predicates.push(eq(ledgerTransactions.categoryId, filters.categoryId));
    if (filters.occurredFrom) predicates.push(gte(ledgerTransactions.occurredAt, filters.occurredFrom));
    if (filters.occurredToExclusive) {
      predicates.push(lt(ledgerTransactions.occurredAt, filters.occurredToExclusive));
    }
    if (filters.search) {
      // Treat user-entered wildcard characters literally; free-text search must
      // not let a query parameter widen the matched ledger set unexpectedly.
      const pattern = `%${filters.search.replace(/[\\%_]/g, "\\$&")}%`;
      predicates.push(or(ilike(ledgerMerchants.name, pattern), ilike(ledgerTransactions.note, pattern))!);
    }
    return predicates;
  }
}

type RawLedgerTransaction = Omit<
  LedgerTransactionRecord,
  "amountMinor" | "occurredAt" | "createdAt" | "updatedAt" | "source"
> & {
  amountMinor: bigint | string | number;
  occurredAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  source: Record<string, unknown> | string;
};

function mapLedgerTransaction(record: RawLedgerTransaction): LedgerTransactionRecord {
  const source = typeof record.source === "string" ? JSON.parse(record.source) : record.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Updated transaction has invalid source metadata.");
  }
  return {
    ...record,
    amountMinor: typeof record.amountMinor === "bigint" ? record.amountMinor : BigInt(record.amountMinor),
    occurredAt: new Date(record.occurredAt),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    source,
  };
}

function transactionListOrder(sort: LedgerTransactionListPageInput["sort"]) {
  switch (sort) {
    case "OLDEST":
      return [asc(ledgerTransactions.occurredAt), asc(ledgerTransactions.createdAt), asc(ledgerTransactions.id)] as const;
    case "HIGHEST":
      return [desc(ledgerTransactions.amountMinor), desc(ledgerTransactions.occurredAt), desc(ledgerTransactions.id)] as const;
    case "LOWEST":
      return [asc(ledgerTransactions.amountMinor), asc(ledgerTransactions.occurredAt), asc(ledgerTransactions.id)] as const;
    case "NEWEST":
    default:
      return [desc(ledgerTransactions.occurredAt), desc(ledgerTransactions.createdAt), desc(ledgerTransactions.id)] as const;
  }
}
