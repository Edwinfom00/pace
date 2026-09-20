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
  notExists,
  or,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, neonSql } from "@/db/client";
import {
  ledgerAccounts,
  ledgerCategories,
  ledgerMerchants,
  ledgerTransactionAudits,
  ledgerTransactionCorrections,
  ledgerTransactions,
} from "@/db/schema";

import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerTransactionAuditRecord,
  LedgerTransactionCorrectionRecord,
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
export type CreateLedgerTransactionCorrectionRecord = Omit<
  LedgerTransactionCorrectionRecord,
  "createdAt"
>;

export interface CreateLedgerFinancialCorrectionRecord {
  workspaceId: string;
  originalTransactionId: string;
  expectedOriginalUpdatedAt: Date | undefined;
  correction: CreateLedgerTransactionCorrectionRecord;
  reversal: CreateLedgerTransactionRecord;
  replacement: CreateLedgerTransactionRecord;
  /** Created inside the same all-or-nothing correction write when needed. */
  merchantToCreate: CreateLedgerMerchantRecord | null;
  audits: readonly [
    CreateLedgerTransactionAuditRecord,
    CreateLedgerTransactionAuditRecord,
    CreateLedgerTransactionAuditRecord,
  ];
}

export interface CreateLedgerFinancialRefundRecord {
  workspaceId: string;
  sourceExpenseId: string;
  refund: CreateLedgerTransactionRecord;
  audits: readonly [CreateLedgerTransactionAuditRecord, CreateLedgerTransactionAuditRecord];
}

export interface CreateLedgerFinancialReversalRecord {
  workspaceId: string;
  originalTransactionId: string;
  expectedOriginalUpdatedAt: Date | undefined;
  reversal: CreateLedgerTransactionRecord;
  audits: readonly [CreateLedgerTransactionAuditRecord, CreateLedgerTransactionAuditRecord];
}


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
  /** Internal correction validation only; never exposed to an untrusted caller. */
  findAccountById(accountId: string): Promise<LedgerAccountRecord | null>;

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
  /** Finds any canonical bookkeeping reversal of the specified original. */
  findTransactionReversalByOriginal(
    workspaceId: string,
    originalTransactionId: string,
  ): Promise<LedgerTransactionRecord | null>;
  findTransactionCorrectionByOriginal(
    workspaceId: string,
    originalTransactionId: string,
  ): Promise<LedgerTransactionCorrectionRecord | null>;
  findTransactionCorrectionByTransactionId(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionCorrectionRecord | null>;
  /** Finds the canonical correction immediately preceding a replacement version. */
  findTransactionCorrectionByReplacement(
    workspaceId: string,
    replacementTransactionId: string,
  ): Promise<LedgerTransactionCorrectionRecord | null>;
  findTransactionCorrectionByIdempotencyKey(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<LedgerTransactionCorrectionRecord | null>;
  /** Returns null when the optimistic candidate is no longer current. */
  createFinancialCorrection(
    input: CreateLedgerFinancialCorrectionRecord,
  ): Promise<LedgerTransactionCorrectionRecord | null>;
  /**
   * Writes a standalone reversal and both audit rows atomically. A null result
   * means the original stopped being the current effective transaction.
   */
  createFinancialReversal(
    input: CreateLedgerFinancialReversalRecord,
  ): Promise<LedgerTransactionRecord | null>;
  /**
   * Creates a real REFUND and its audit linkage in one serializable database
   * transaction. A null result means the source was no longer refundable at
   * the point of the atomic check.
   */
  createFinancialRefund(
    input: CreateLedgerFinancialRefundRecord,
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
  /** Includes refunds attached to prior corrected versions of this expense. */
  listRefundsForEffectiveExpense(
    workspaceId: string,
    effectiveExpenseTransactionId: string,
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

  async findAccountById(accountId: string): Promise<LedgerAccountRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.id, accountId))
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
          reversal_of_transaction_id AS "reversalOfTransactionId",
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

  async findTransactionReversalByOriginal(
    workspaceId: string,
    originalTransactionId: string,
  ): Promise<LedgerTransactionRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerTransactions)
      .where(
        and(
          eq(ledgerTransactions.workspaceId, workspaceId),
          eq(ledgerTransactions.reversalOfTransactionId, originalTransactionId),
        ),
      )
      .orderBy(asc(ledgerTransactions.createdAt), asc(ledgerTransactions.id))
      .limit(1);
    return record ?? null;
  }

  async findTransactionCorrectionByOriginal(
    workspaceId: string,
    originalTransactionId: string,
  ): Promise<LedgerTransactionCorrectionRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerTransactionCorrections)
      .where(
        and(
          eq(ledgerTransactionCorrections.workspaceId, workspaceId),
          eq(ledgerTransactionCorrections.originalTransactionId, originalTransactionId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findTransactionCorrectionByTransactionId(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionCorrectionRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerTransactionCorrections)
      .where(
        and(
          eq(ledgerTransactionCorrections.workspaceId, workspaceId),
          or(
            eq(ledgerTransactionCorrections.originalTransactionId, transactionId),
            eq(ledgerTransactionCorrections.reversalTransactionId, transactionId),
            eq(ledgerTransactionCorrections.replacementTransactionId, transactionId),
          ),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findTransactionCorrectionByReplacement(
    workspaceId: string,
    replacementTransactionId: string,
  ): Promise<LedgerTransactionCorrectionRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerTransactionCorrections)
      .where(
        and(
          eq(ledgerTransactionCorrections.workspaceId, workspaceId),
          eq(ledgerTransactionCorrections.replacementTransactionId, replacementTransactionId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findTransactionCorrectionByIdempotencyKey(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<LedgerTransactionCorrectionRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerTransactionCorrections)
      .where(
        and(
          eq(ledgerTransactionCorrections.workspaceId, workspaceId),
          eq(ledgerTransactionCorrections.actorUserId, actorUserId),
          eq(ledgerTransactionCorrections.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async createFinancialCorrection(
    input: CreateLedgerFinancialCorrectionRecord,
  ): Promise<LedgerTransactionCorrectionRecord | null> {
    const merchant = input.merchantToCreate;
    const [originalAudit, reversalAudit, replacementAudit] = input.audits;
    const rows = await neonSql`
      WITH candidate AS (
        SELECT id
        FROM ledger_transaction
        WHERE workspace_id = ${input.workspaceId}
          AND id = ${input.originalTransactionId}
          AND reversal_of_transaction_id IS NULL
          AND (
            ${input.expectedOriginalUpdatedAt ?? null}::timestamptz IS NULL
            OR date_trunc('milliseconds', updated_at) = ${input.expectedOriginalUpdatedAt ?? null}
          )
          AND NOT EXISTS (
            SELECT 1
            FROM ledger_transaction_correction
            WHERE original_transaction_id = ${input.originalTransactionId}
          )
          AND NOT EXISTS (
            SELECT 1
            FROM ledger_transaction
            WHERE workspace_id = ${input.workspaceId}
              AND reversal_of_transaction_id = ${input.originalTransactionId}
          )
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
      reversal AS (
        INSERT INTO ledger_transaction (
          id, workspace_id, kind, status, amount_minor, currency, occurred_at,
          account_id, transfer_account_id, category_id, merchant_id,
          created_by_user_id, paid_by_user_id, transfer_group_id,
          refunded_transaction_id, reversal_of_transaction_id, source,
          deduplication_fingerprint, note
        )
        SELECT ${input.reversal.id}, ${input.reversal.workspaceId}, ${input.reversal.kind},
          ${input.reversal.status}, ${input.reversal.amountMinor}, ${input.reversal.currency},
          ${input.reversal.occurredAt}, ${input.reversal.accountId}, ${input.reversal.transferAccountId},
          ${input.reversal.categoryId}, ${input.reversal.merchantId}, ${input.reversal.createdByUserId},
          ${input.reversal.paidByUserId}, ${input.reversal.transferGroupId},
          ${input.reversal.refundedTransactionId}, ${input.reversal.reversalOfTransactionId},
          ${JSON.stringify(input.reversal.source)}::jsonb, ${input.reversal.deduplicationFingerprint},
          ${input.reversal.note}
        WHERE EXISTS (SELECT 1 FROM candidate)
        RETURNING id
      ),
      replacement AS (
        INSERT INTO ledger_transaction (
          id, workspace_id, kind, status, amount_minor, currency, occurred_at,
          account_id, transfer_account_id, category_id, merchant_id,
          created_by_user_id, paid_by_user_id, transfer_group_id,
          refunded_transaction_id, reversal_of_transaction_id, source,
          deduplication_fingerprint, note
        )
        SELECT ${input.replacement.id}, ${input.replacement.workspaceId}, ${input.replacement.kind},
          ${input.replacement.status}, ${input.replacement.amountMinor}, ${input.replacement.currency},
          ${input.replacement.occurredAt}, ${input.replacement.accountId}, ${input.replacement.transferAccountId},
          ${input.replacement.categoryId}, COALESCE((SELECT id FROM merchant_to_upsert), ${input.replacement.merchantId}), ${input.replacement.createdByUserId},
          ${input.replacement.paidByUserId}, ${input.replacement.transferGroupId},
          ${input.replacement.refundedTransactionId}, ${input.replacement.reversalOfTransactionId},
          ${JSON.stringify(input.replacement.source)}::jsonb, ${input.replacement.deduplicationFingerprint},
          ${input.replacement.note}
        WHERE EXISTS (SELECT 1 FROM reversal)
        RETURNING id
      ),
      correction AS (
        INSERT INTO ledger_transaction_correction (
          id, workspace_id, original_transaction_id, reversal_transaction_id,
          replacement_transaction_id, actor_user_id, idempotency_key,
          command_fingerprint, reason
        )
        SELECT ${input.correction.id}, ${input.correction.workspaceId}, candidate.id,
          reversal.id, replacement.id, ${input.correction.actorUserId},
          ${input.correction.idempotencyKey}, ${input.correction.commandFingerprint},
          ${input.correction.reason}
        FROM candidate
        CROSS JOIN reversal
        CROSS JOIN replacement
        RETURNING id
      ),
      original_audit AS (
        INSERT INTO ledger_transaction_audit (id, workspace_id, transaction_id, actor_user_id, action, metadata)
        SELECT ${originalAudit.id}, ${originalAudit.workspaceId}, ${originalAudit.transactionId},
          ${originalAudit.actorUserId}, ${originalAudit.action}, ${JSON.stringify(originalAudit.metadata)}::jsonb
        WHERE EXISTS (SELECT 1 FROM correction)
      ),
      reversal_audit AS (
        INSERT INTO ledger_transaction_audit (id, workspace_id, transaction_id, actor_user_id, action, metadata)
        SELECT ${reversalAudit.id}, ${reversalAudit.workspaceId}, ${reversalAudit.transactionId},
          ${reversalAudit.actorUserId}, ${reversalAudit.action}, ${JSON.stringify(reversalAudit.metadata)}::jsonb
        WHERE EXISTS (SELECT 1 FROM correction)
      ),
      replacement_audit AS (
        INSERT INTO ledger_transaction_audit (id, workspace_id, transaction_id, actor_user_id, action, metadata)
        SELECT ${replacementAudit.id}, ${replacementAudit.workspaceId}, ${replacementAudit.transactionId},
          ${replacementAudit.actorUserId}, ${replacementAudit.action}, ${JSON.stringify(replacementAudit.metadata)}::jsonb
        WHERE EXISTS (SELECT 1 FROM correction)
      )
      SELECT id FROM correction;
    ` as unknown as readonly { id: string }[];
    if (!rows[0]) return null;
    return this.findTransactionCorrectionByOriginal(input.workspaceId, input.originalTransactionId);
  }

  async createFinancialReversal(
    input: CreateLedgerFinancialReversalRecord,
  ): Promise<LedgerTransactionRecord | null> {
    const [originalAudit, reversalAudit] = input.audits;
    // The candidate lock and both audit inserts live in this one statement, so
    // no opposite ledger entry can escape without its history linkage.
    const records = await neonSql`
      WITH candidate AS (
        SELECT id
        FROM ledger_transaction
        WHERE workspace_id = ${input.workspaceId}
          AND id = ${input.originalTransactionId}
          AND reversal_of_transaction_id IS NULL
          AND (
            ${input.expectedOriginalUpdatedAt ?? null}::timestamptz IS NULL
            OR date_trunc('milliseconds', updated_at) = ${input.expectedOriginalUpdatedAt ?? null}
          )
          AND NOT EXISTS (
            SELECT 1
            FROM ledger_transaction_correction
            WHERE workspace_id = ${input.workspaceId}
              AND original_transaction_id = ${input.originalTransactionId}
          )
          AND NOT EXISTS (
            SELECT 1
            FROM ledger_transaction
            WHERE workspace_id = ${input.workspaceId}
              AND reversal_of_transaction_id = ${input.originalTransactionId}
          )
          AND NOT EXISTS (
            WITH RECURSIVE lineage(id) AS (
              SELECT ${input.originalTransactionId}::text
              UNION
              SELECT correction.original_transaction_id
              FROM ledger_transaction_correction AS correction
              INNER JOIN lineage ON lineage.id = correction.replacement_transaction_id
              WHERE correction.workspace_id = ${input.workspaceId}
            )
            SELECT 1
            FROM ledger_transaction AS refund
            INNER JOIN lineage ON lineage.id = refund.refunded_transaction_id
            WHERE refund.workspace_id = ${input.workspaceId}
              AND refund.kind = 'REFUND'
              AND refund.status = 'POSTED'
          )
        FOR UPDATE
      ),
      reversal AS (
        INSERT INTO ledger_transaction (
          id, workspace_id, kind, status, amount_minor, currency, occurred_at,
          account_id, transfer_account_id, category_id, merchant_id,
          created_by_user_id, paid_by_user_id, transfer_group_id,
          refunded_transaction_id, reversal_of_transaction_id, source,
          deduplication_fingerprint, note
        )
        SELECT ${input.reversal.id}, ${input.reversal.workspaceId}, ${input.reversal.kind},
          ${input.reversal.status}, ${input.reversal.amountMinor}, ${input.reversal.currency},
          ${input.reversal.occurredAt}, ${input.reversal.accountId}, ${input.reversal.transferAccountId},
          ${input.reversal.categoryId}, ${input.reversal.merchantId}, ${input.reversal.createdByUserId},
          ${input.reversal.paidByUserId}, ${input.reversal.transferGroupId},
          ${input.reversal.refundedTransactionId}, ${input.reversal.reversalOfTransactionId},
          ${JSON.stringify(input.reversal.source)}::jsonb, ${input.reversal.deduplicationFingerprint},
          ${input.reversal.note}
        FROM candidate
        RETURNING id, workspace_id AS "workspaceId", kind, status,
          amount_minor AS "amountMinor", currency, occurred_at AS "occurredAt",
          account_id AS "accountId", transfer_account_id AS "transferAccountId",
          category_id AS "categoryId", merchant_id AS "merchantId",
          created_by_user_id AS "createdByUserId", paid_by_user_id AS "paidByUserId",
          transfer_group_id AS "transferGroupId", refunded_transaction_id AS "refundedTransactionId",
          reversal_of_transaction_id AS "reversalOfTransactionId",
          source, deduplication_fingerprint AS "deduplicationFingerprint", note,
          created_at AS "createdAt", updated_at AS "updatedAt"
      ),
      original_audit AS (
        INSERT INTO ledger_transaction_audit (id, workspace_id, transaction_id, actor_user_id, action, metadata)
        SELECT ${originalAudit.id}, ${originalAudit.workspaceId}, ${originalAudit.transactionId},
          ${originalAudit.actorUserId}, ${originalAudit.action}, ${JSON.stringify(originalAudit.metadata)}::jsonb
        FROM reversal
      ),
      reversal_audit AS (
        INSERT INTO ledger_transaction_audit (id, workspace_id, transaction_id, actor_user_id, action, metadata)
        SELECT ${reversalAudit.id}, ${reversalAudit.workspaceId}, reversal.id,
          ${reversalAudit.actorUserId}, ${reversalAudit.action}, ${JSON.stringify(reversalAudit.metadata)}::jsonb
        FROM reversal
      )
      SELECT * FROM reversal;
    ` as unknown as readonly RawLedgerTransaction[];
    const record = records[0];
    return record ? mapLedgerTransaction(record) : null;
  }

  async createFinancialRefund(
    input: CreateLedgerFinancialRefundRecord,
  ): Promise<LedgerTransactionRecord | null> {
    const [sourceAudit, refundAudit] = input.audits;
    const [rows] = await neonSql.transaction(
      (transaction) => [transaction`
        WITH RECURSIVE source_expense AS (
          SELECT id, amount_minor, currency
          FROM ledger_transaction
          WHERE workspace_id = ${input.workspaceId}
            AND id = ${input.sourceExpenseId}
            AND kind = 'EXPENSE'
            AND status = 'POSTED'
            AND NOT EXISTS (
              SELECT 1
              FROM ledger_transaction_correction
              WHERE workspace_id = ${input.workspaceId}
                AND original_transaction_id = ${input.sourceExpenseId}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM ledger_transaction_correction
              WHERE workspace_id = ${input.workspaceId}
                AND reversal_transaction_id = ${input.sourceExpenseId}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM ledger_transaction
              WHERE workspace_id = ${input.workspaceId}
                AND reversal_of_transaction_id = ${input.sourceExpenseId}
            )
          FOR UPDATE
        ),
        lineage(id) AS (
          SELECT id FROM source_expense
          UNION
          SELECT correction.original_transaction_id
          FROM ledger_transaction_correction AS correction
          INNER JOIN lineage ON lineage.id = correction.replacement_transaction_id
          WHERE correction.workspace_id = ${input.workspaceId}
        ),
        refundable AS (
          SELECT source_expense.id
          FROM source_expense
          CROSS JOIN (
            SELECT COALESCE(SUM(refund.amount_minor), 0) AS refunded_minor
            FROM ledger_transaction AS refund
            INNER JOIN lineage ON lineage.id = refund.refunded_transaction_id
            WHERE refund.workspace_id = ${input.workspaceId}
              AND refund.kind = 'REFUND'
              AND refund.status = 'POSTED'
          ) AS existing_refunds
          WHERE existing_refunds.refunded_minor + ${input.refund.amountMinor} <= source_expense.amount_minor
        ),
        created_refund AS (
          INSERT INTO ledger_transaction (
            id, workspace_id, kind, status, amount_minor, currency, occurred_at,
            account_id, transfer_account_id, category_id, merchant_id,
            created_by_user_id, paid_by_user_id, transfer_group_id,
            refunded_transaction_id, reversal_of_transaction_id, source,
            deduplication_fingerprint, note
          )
          SELECT ${input.refund.id}, ${input.refund.workspaceId}, ${input.refund.kind},
            ${input.refund.status}, ${input.refund.amountMinor}, ${input.refund.currency},
            ${input.refund.occurredAt}, ${input.refund.accountId}, ${input.refund.transferAccountId},
            ${input.refund.categoryId}, ${input.refund.merchantId}, ${input.refund.createdByUserId},
            ${input.refund.paidByUserId}, ${input.refund.transferGroupId},
            ${input.refund.refundedTransactionId}, ${input.refund.reversalOfTransactionId},
            ${JSON.stringify(input.refund.source)}::jsonb, ${input.refund.deduplicationFingerprint},
            ${input.refund.note}
          FROM refundable
          RETURNING id, workspace_id AS "workspaceId", kind, status,
            amount_minor AS "amountMinor", currency, occurred_at AS "occurredAt",
            account_id AS "accountId", transfer_account_id AS "transferAccountId",
            category_id AS "categoryId", merchant_id AS "merchantId",
            created_by_user_id AS "createdByUserId", paid_by_user_id AS "paidByUserId",
            transfer_group_id AS "transferGroupId", refunded_transaction_id AS "refundedTransactionId",
            reversal_of_transaction_id AS "reversalOfTransactionId",
            source, deduplication_fingerprint AS "deduplicationFingerprint", note,
            created_at AS "createdAt", updated_at AS "updatedAt"
        ),
        source_audit AS (
          INSERT INTO ledger_transaction_audit (
            id, workspace_id, transaction_id, actor_user_id, action, metadata
          )
          SELECT ${sourceAudit.id}, ${sourceAudit.workspaceId}, ${sourceAudit.transactionId},
            ${sourceAudit.actorUserId}, ${sourceAudit.action}, ${JSON.stringify(sourceAudit.metadata)}::jsonb
          FROM created_refund
        ),
        refund_audit AS (
          INSERT INTO ledger_transaction_audit (
            id, workspace_id, transaction_id, actor_user_id, action, metadata
          )
          SELECT ${refundAudit.id}, ${refundAudit.workspaceId}, created_refund.id,
            ${refundAudit.actorUserId}, ${refundAudit.action}, ${JSON.stringify(refundAudit.metadata)}::jsonb
          FROM created_refund
        )
        SELECT * FROM created_refund;
      `],
      { isolationLevel: "Serializable" },
    );
    const record = (rows as unknown as readonly RawLedgerTransaction[])[0];
    return record ? mapLedgerTransaction(record) : null;
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
          eq(ledgerTransactions.status, "POSTED"),
          eq(ledgerTransactions.refundedTransactionId, transactionId),
        ),
      );
  }

  async listRefundsForEffectiveExpense(
    workspaceId: string,
    effectiveExpenseTransactionId: string,
  ): Promise<LedgerTransactionRecord[]> {
    const records = await neonSql`
      WITH RECURSIVE lineage(id) AS (
        SELECT ${effectiveExpenseTransactionId}::text
        UNION
        SELECT correction.original_transaction_id
        FROM ledger_transaction_correction AS correction
        INNER JOIN lineage ON lineage.id = correction.replacement_transaction_id
        WHERE correction.workspace_id = ${workspaceId}
      )
      SELECT id, workspace_id AS "workspaceId", kind, status,
        amount_minor AS "amountMinor", currency, occurred_at AS "occurredAt",
        account_id AS "accountId", transfer_account_id AS "transferAccountId",
        category_id AS "categoryId", merchant_id AS "merchantId",
        created_by_user_id AS "createdByUserId", paid_by_user_id AS "paidByUserId",
        transfer_group_id AS "transferGroupId", refunded_transaction_id AS "refundedTransactionId",
        reversal_of_transaction_id AS "reversalOfTransactionId",
        source, deduplication_fingerprint AS "deduplicationFingerprint", note,
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM ledger_transaction
      WHERE workspace_id = ${workspaceId}
        AND kind = 'REFUND'
        AND status = 'POSTED'
        AND refunded_transaction_id IN (SELECT id FROM lineage)
      ORDER BY created_at ASC, id ASC;
    ` as unknown as readonly RawLedgerTransaction[];
    return records.map(mapLedgerTransaction);
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
    const reversal = alias(ledgerTransactions, "ledger_transaction_reversal");
    const predicates = [
      eq(ledgerTransactions.workspaceId, workspaceId),
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
      // The correction table, not presentational fields, identifies obsolete
      // originals and bookkeeping reversals in the append-only chain.
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
