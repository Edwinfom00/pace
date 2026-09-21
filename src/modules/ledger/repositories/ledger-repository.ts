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
import { toCurrencyCode } from "@/money/currency";
import {
  ledgerAccounts,
  ledgerCategories,
  ledgerMerchants,
  ledgerTransactionAudits,
  ledgerTransactionCorrections,
  ledgerTransactions,
} from "@/db/schema";
import {
  getAccountSpendability,
  type AccountSpendability,
  type DebitSpendabilityGuard,
} from "../spendability-policy";

import type {
  LedgerAccountBalance,
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
  /** Applied after the reversal, inside this same atomic financial transition. */
  spendabilityGuard: DebitSpendabilityGuard | null;
  /** Created inside the same all-or-nothing correction write when needed. */
  merchantToCreate: CreateLedgerMerchantRecord | null;
  audits: readonly [
    CreateLedgerTransactionAuditRecord,
    CreateLedgerTransactionAuditRecord,
    CreateLedgerTransactionAuditRecord,
  ];
}

export interface CreateLedgerSpendableTransactionRecord {
  transaction: CreateLedgerTransactionRecord;
  merchantToCreate: CreateLedgerMerchantRecord | null;
  spendabilityGuard: DebitSpendabilityGuard | null;
}

export type LedgerSpendableTransactionWriteResult =
  | { readonly outcome: "CREATED"; readonly transaction: LedgerTransactionRecord }
  | { readonly outcome: "INSUFFICIENT_FUNDS"; readonly spendability: AccountSpendability };

export type LedgerFinancialCorrectionWriteResult =
  | { readonly outcome: "CREATED"; readonly correction: LedgerTransactionCorrectionRecord }
  | { readonly outcome: "INSUFFICIENT_FUNDS"; readonly spendability: AccountSpendability }
  | { readonly outcome: "CONFLICT" };

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

export type AccountDetailMovementSummaryInput = {
  readonly workspaceId: string;
  readonly accountId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
};

export type LedgerAccountDetailMovementSummary = {
  readonly hasCurrencyMismatch: boolean;
  readonly inflowsMinor: bigint;
  readonly outflowsMinor: bigint;
  readonly netTransfersMinor: bigint;
  readonly transactionCount: number;
};

export type AccountDetailBalanceDeltasInput = {
  readonly workspaceId: string;
  readonly accountId: string;
  readonly chartStart: Date;
  readonly chartEnd: Date;
  readonly timeZone: string;
};

export type LedgerAccountDetailBalanceDelta = {
  readonly date: string | null;
  readonly movementMinor: bigint;
};

export type AccountDetailTopExpenseCategoriesInput = {
  readonly workspaceId: string;
  readonly accountId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly limit: number;
};

export type LedgerAccountDetailCategoryTotal = {
  readonly id: string;
  readonly name: string;
  readonly amountMinor: bigint;
  readonly totalMinor: bigint;
};

export interface LedgerAccountDetailRecentTransactionRow {
  readonly transaction: LedgerTransactionRecord;
  readonly sourceAccount: LedgerAccountRecord | null;
  readonly destinationAccount: LedgerAccountRecord | null;
  readonly category: LedgerCategoryRecord | null;
  readonly merchant: LedgerMerchantRecord | null;
}

export interface LedgerRepository {
  createAccount(input: CreateLedgerAccountRecord): Promise<LedgerAccountRecord>;
  listAccounts(workspaceId: string): Promise<LedgerAccountRecord[]>;
  findAccount(workspaceId: string, accountId: string): Promise<LedgerAccountRecord | null>;
  /**
   * Canonical current-balance reads. Implementations aggregate the complete
   * posted ledger; callers must never reconstruct balances from list UI state.
   */
  getAccountBalance(workspaceId: string, accountId: string): Promise<LedgerAccountBalance | null>;
  getWorkspaceAccountBalances(workspaceId: string): Promise<readonly LedgerAccountBalance[]>;
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

  createTransactionWithSpendability(
    input: CreateLedgerSpendableTransactionRecord,
  ): Promise<LedgerSpendableTransactionWriteResult>;
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
  ): Promise<LedgerFinancialCorrectionWriteResult>;
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

  async getAccountBalance(
    workspaceId: string,
    accountId: string,
  ): Promise<LedgerAccountBalance | null> {
    const [balance] = await this.queryAccountBalances(workspaceId, accountId);
    return balance ?? null;
  }

  async getWorkspaceAccountBalances(workspaceId: string): Promise<readonly LedgerAccountBalance[]> {
    return this.queryAccountBalances(workspaceId);
  }

  
  async getAccountDetailMovementSummary(
    input: AccountDetailMovementSummaryInput,
  ): Promise<LedgerAccountDetailMovementSummary> {
    const records = await neonSql`
      WITH account AS (
        SELECT id, currency
        FROM ledger_account
        WHERE workspace_id = ${input.workspaceId}
          AND id = ${input.accountId}
      ),
      current_account_transactions AS (
        SELECT entry.id, entry.kind, entry.amount_minor, entry.occurred_at,
          CASE
            WHEN entry.kind = 'TRANSFER' AND entry.account_id = ${input.accountId} THEN -entry.amount_minor
            WHEN entry.kind = 'TRANSFER' AND entry.transfer_account_id = ${input.accountId} THEN entry.amount_minor
            WHEN entry.kind = 'EXPENSE' THEN -entry.amount_minor
            WHEN entry.kind IN ('INCOME', 'REFUND') THEN entry.amount_minor
            ELSE 0::bigint
          END AS movement_minor
        FROM ledger_transaction AS entry
        WHERE entry.workspace_id = ${input.workspaceId}
          AND entry.status = 'POSTED'
          AND (entry.account_id = ${input.accountId} OR entry.transfer_account_id = ${input.accountId})
          AND entry.reversal_of_transaction_id IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM ledger_transaction AS reversal
            WHERE reversal.workspace_id = ${input.workspaceId}
              AND reversal.reversal_of_transaction_id = entry.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM ledger_transaction_correction AS correction
            WHERE correction.workspace_id = ${input.workspaceId}
              AND (
                correction.original_transaction_id = entry.id
                OR correction.reversal_transaction_id = entry.id
              )
          )
      )
      SELECT
        EXISTS (
          SELECT 1
          FROM ledger_transaction AS entry
          INNER JOIN account ON TRUE
          WHERE entry.workspace_id = ${input.workspaceId}
            AND entry.status = 'POSTED'
            AND (entry.account_id = account.id OR entry.transfer_account_id = account.id)
            AND entry.currency <> account.currency
        ) AS "hasCurrencyMismatch",
        COALESCE(SUM(CASE
          WHEN occurred_at >= ${input.periodStart} AND occurred_at < ${input.periodEnd} AND movement_minor > 0
            THEN movement_minor
          ELSE 0::bigint
        END), 0::bigint) AS "inflowsMinor",
        COALESCE(SUM(CASE
          WHEN occurred_at >= ${input.periodStart} AND occurred_at < ${input.periodEnd} AND movement_minor < 0
            THEN -movement_minor
          ELSE 0::bigint
        END), 0::bigint) AS "outflowsMinor",
        COALESCE(SUM(CASE
          WHEN occurred_at >= ${input.periodStart} AND occurred_at < ${input.periodEnd} AND kind = 'TRANSFER'
            THEN movement_minor
          ELSE 0::bigint
        END), 0::bigint) AS "netTransfersMinor",
        COUNT(*) FILTER (
          WHERE occurred_at >= ${input.periodStart} AND occurred_at < ${input.periodEnd}
        ) AS "transactionCount"
      FROM current_account_transactions;
    ` as unknown as readonly RawAccountDetailMovementSummary[];

    return mapAccountDetailMovementSummary(records[0]);
  }

  
  async getAccountDetailBalanceDeltas(
    input: AccountDetailBalanceDeltasInput,
  ): Promise<readonly LedgerAccountDetailBalanceDelta[]> {
    const records = await neonSql`
      WITH account_movement_legs AS (
        SELECT entry.occurred_at,
          CASE
            WHEN entry.kind = 'TRANSFER' AND entry.account_id = ${input.accountId} THEN -entry.amount_minor
            WHEN entry.kind = 'TRANSFER' AND entry.transfer_account_id = ${input.accountId} THEN entry.amount_minor
            WHEN entry.kind = 'EXPENSE' AND entry.reversal_of_transaction_id IS NULL THEN -entry.amount_minor
            WHEN entry.kind = 'EXPENSE' THEN entry.amount_minor
            WHEN entry.kind IN ('INCOME', 'REFUND') AND entry.reversal_of_transaction_id IS NULL THEN entry.amount_minor
            WHEN entry.kind IN ('INCOME', 'REFUND') THEN -entry.amount_minor
            ELSE 0::bigint
          END AS movement_minor
        FROM ledger_transaction AS entry
        WHERE entry.workspace_id = ${input.workspaceId}
          AND entry.status = 'POSTED'
          AND (entry.account_id = ${input.accountId} OR entry.transfer_account_id = ${input.accountId})
          AND entry.occurred_at < ${input.chartEnd}
      ),
      base_movement AS (
        SELECT COALESCE(
          SUM(CASE WHEN occurred_at < ${input.chartStart} THEN movement_minor ELSE 0::bigint END),
          0::bigint
        ) AS movement_minor
        FROM account_movement_legs
      ),
      daily_movements AS (
        SELECT
          to_char(occurred_at AT TIME ZONE ${input.timeZone}, 'YYYY-MM-DD') AS local_date,
          SUM(movement_minor) AS movement_minor
        FROM account_movement_legs
        WHERE occurred_at >= ${input.chartStart}
          AND occurred_at < ${input.chartEnd}
        GROUP BY 1
      ),
      balance_deltas AS (
        SELECT 'BASE'::text AS kind, NULL::text AS date, movement_minor AS "movementMinor"
        FROM base_movement
        UNION ALL
        SELECT 'DAY'::text AS kind, local_date AS date, movement_minor AS "movementMinor"
        FROM daily_movements
      )
      SELECT kind, date, "movementMinor"
      FROM balance_deltas
      ORDER BY kind, date;
    ` as unknown as readonly RawAccountDetailBalanceDelta[];

    return records.map((record) => ({
      date: record.date,
      movementMinor: toBigInt(record.movementMinor),
    }));
  }

  async getAccountDetailTopExpenseCategories(
    input: AccountDetailTopExpenseCategoriesInput,
  ): Promise<readonly LedgerAccountDetailCategoryTotal[]> {
    const safeLimit = Math.min(Math.max(Math.floor(input.limit), 1), 12);
    const records = await neonSql`
      WITH current_expenses AS (
        SELECT entry.category_id, entry.amount_minor
        FROM ledger_transaction AS entry
        WHERE entry.workspace_id = ${input.workspaceId}
          AND entry.account_id = ${input.accountId}
          AND entry.kind = 'EXPENSE'
          AND entry.status = 'POSTED'
          AND entry.occurred_at >= ${input.periodStart}
          AND entry.occurred_at < ${input.periodEnd}
          AND entry.reversal_of_transaction_id IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM ledger_transaction AS reversal
            WHERE reversal.workspace_id = ${input.workspaceId}
              AND reversal.reversal_of_transaction_id = entry.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM ledger_transaction_correction AS correction
            WHERE correction.workspace_id = ${input.workspaceId}
              AND (
                correction.original_transaction_id = entry.id
                OR correction.reversal_transaction_id = entry.id
              )
          )
      )
      SELECT category.id, category.name,
        SUM(expense.amount_minor) AS "amountMinor",
        SUM(SUM(expense.amount_minor)) OVER () AS "totalMinor"
      FROM current_expenses AS expense
      INNER JOIN ledger_category AS category ON category.id = expense.category_id
      GROUP BY category.id, category.name
      ORDER BY SUM(expense.amount_minor) DESC, category.name ASC
      LIMIT ${safeLimit};
    ` as unknown as readonly RawAccountDetailCategoryTotal[];

    return records.map((record) => ({
      id: record.id,
      name: record.name,
      amountMinor: toBigInt(record.amountMinor),
      totalMinor: toBigInt(record.totalMinor),
    }));
  }

  async listAccountDetailRecentTransactions(
    workspaceId: string,
    accountId: string,
    limit = 5,
  ): Promise<readonly LedgerAccountDetailRecentTransactionRow[]> {
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 24);
    const reversal = alias(ledgerTransactions, "ledger_account_detail_reversal");
    const sourceAccount = alias(ledgerAccounts, "ledger_account_detail_source_account");
    const destinationAccount = alias(ledgerAccounts, "ledger_account_detail_destination_account");
    const records = await db
      .select({
        transaction: ledgerTransactions,
        sourceAccount,
        destinationAccount,
        category: ledgerCategories,
        merchant: ledgerMerchants,
      })
      .from(ledgerTransactions)
      .leftJoin(sourceAccount, eq(sourceAccount.id, ledgerTransactions.accountId))
      .leftJoin(destinationAccount, eq(destinationAccount.id, ledgerTransactions.transferAccountId))
      .leftJoin(ledgerCategories, eq(ledgerCategories.id, ledgerTransactions.categoryId))
      .leftJoin(ledgerMerchants, eq(ledgerMerchants.id, ledgerTransactions.merchantId))
      .where(
        and(
          eq(ledgerTransactions.workspaceId, workspaceId),
          or(eq(ledgerTransactions.accountId, accountId), eq(ledgerTransactions.transferAccountId, accountId)),
          isNull(ledgerTransactions.reversalOfTransactionId),
          notExists(
            db
              .select({ id: reversal.id })
              .from(reversal)
              .where(and(eq(reversal.workspaceId, workspaceId), eq(reversal.reversalOfTransactionId, ledgerTransactions.id))),
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
        ),
      )
      .orderBy(desc(ledgerTransactions.occurredAt), desc(ledgerTransactions.createdAt), desc(ledgerTransactions.id))
      .limit(safeLimit);

    return records;
  }

  async findAccountById(accountId: string): Promise<LedgerAccountRecord | null> {
    const [record] = await db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.id, accountId))
      .limit(1);
    return record ?? null;
  }

 
  private async queryAccountBalances(
    workspaceId: string,
    requestedAccountId?: string,
  ): Promise<readonly LedgerAccountBalance[]> {
    const accountId = requestedAccountId ?? null;
    const records = await neonSql`
      WITH scoped_accounts AS (
        SELECT id, type, currency, opening_balance_minor
        FROM ledger_account
        WHERE workspace_id = ${workspaceId}
          AND (${accountId}::text IS NULL OR id = ${accountId})
      ),
      account_movement_legs AS (
        SELECT entry.account_id AS account_id,
          CASE
            WHEN entry.kind = 'TRANSFER' THEN -entry.amount_minor
            WHEN entry.kind = 'EXPENSE'
              AND entry.reversal_of_transaction_id IS NULL THEN -entry.amount_minor
            WHEN entry.kind = 'EXPENSE' THEN entry.amount_minor
            WHEN entry.kind IN ('INCOME', 'REFUND')
              AND entry.reversal_of_transaction_id IS NULL THEN entry.amount_minor
            WHEN entry.kind IN ('INCOME', 'REFUND') THEN -entry.amount_minor
            ELSE 0::bigint
          END AS movement_minor
        FROM ledger_transaction AS entry
        INNER JOIN scoped_accounts AS account ON account.id = entry.account_id
        WHERE entry.workspace_id = ${workspaceId}
          AND entry.status = 'POSTED'

        UNION ALL

        SELECT entry.transfer_account_id AS account_id,
          entry.amount_minor AS movement_minor
        FROM ledger_transaction AS entry
        INNER JOIN scoped_accounts AS account ON account.id = entry.transfer_account_id
        WHERE entry.workspace_id = ${workspaceId}
          AND entry.status = 'POSTED'
          AND entry.kind = 'TRANSFER'
      ),
      account_movement_totals AS (
        SELECT account_id, SUM(movement_minor) AS movement_minor
        FROM account_movement_legs
        GROUP BY account_id
      )
      SELECT account.id AS "accountId",
        account.type AS "accountType",
        account.currency AS currency,
        account.opening_balance_minor + COALESCE(total.movement_minor, 0) AS "currentBalanceMinor"
      FROM scoped_accounts AS account
      LEFT JOIN account_movement_totals AS total ON total.account_id = account.id
      ORDER BY account.id ASC;
    ` as unknown as readonly RawLedgerAccountBalance[];

    return records.map(mapLedgerAccountBalance);
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

  async createTransactionWithSpendability(
    input: CreateLedgerSpendableTransactionRecord,
  ): Promise<LedgerSpendableTransactionWriteResult> {
    const { transaction: record, merchantToCreate: merchant, spendabilityGuard: guard } = input;
    // Every canonical real-time account write locks its affected account rows
    // and runs at SERIALIZABLE isolation. A concurrent debit therefore either
    // observes the committed first write or is retried by its command boundary;
    // it can never insert after a stale balance check.
    const [rows] = await neonSql.transaction(
      (databaseTransaction) => [databaseTransaction`
        WITH affected_account_ids(id) AS (
          SELECT DISTINCT id
          FROM (VALUES (${record.accountId}::text), (${record.transferAccountId ?? null}::text)) AS ids(id)
          WHERE id IS NOT NULL
        ),
        locked_accounts AS (
          SELECT account.id, account.type, account.currency, account.opening_balance_minor
          FROM ledger_account AS account
          INNER JOIN affected_account_ids AS affected ON affected.id = account.id
          WHERE account.workspace_id = ${record.workspaceId}
          ORDER BY account.id
          FOR UPDATE
        ),
        current_guard_balance AS (
          SELECT account.id AS "accountId", account.type::text AS "accountType", account.currency,
            account.opening_balance_minor + COALESCE((
              SELECT SUM(
                CASE
                  WHEN entry.kind = 'TRANSFER' AND entry.account_id = account.id THEN -entry.amount_minor
                  WHEN entry.kind = 'TRANSFER' AND entry.transfer_account_id = account.id THEN entry.amount_minor
                  WHEN entry.kind = 'EXPENSE' AND entry.reversal_of_transaction_id IS NULL THEN -entry.amount_minor
                  WHEN entry.kind = 'EXPENSE' THEN entry.amount_minor
                  WHEN entry.kind IN ('INCOME', 'REFUND') AND entry.reversal_of_transaction_id IS NULL THEN entry.amount_minor
                  WHEN entry.kind IN ('INCOME', 'REFUND') THEN -entry.amount_minor
                  ELSE 0::bigint
                END
              )
              FROM ledger_transaction AS entry
              WHERE entry.workspace_id = ${record.workspaceId}
                AND entry.status = 'POSTED'
                AND (entry.account_id = account.id OR entry.transfer_account_id = account.id)
            ), 0) AS "currentBalanceMinor"
          FROM locked_accounts AS account
          WHERE ${guard?.accountId ?? null}::text IS NOT NULL
            AND account.id = ${guard?.accountId ?? null}
        ),
        eligible AS (
          SELECT 1
          WHERE (SELECT COUNT(*) FROM locked_accounts) = (SELECT COUNT(*) FROM affected_account_ids)
            AND (
              ${guard === null}
              OR EXISTS (
                SELECT 1
                FROM current_guard_balance
                WHERE currency = ${guard?.currency ?? null}
                  AND "currentBalanceMinor" - ${guard?.requestedDebitMinor ?? 0n}
                    >= ${guard?.minimumAllowedBalanceMinor ?? 0n}
              )
            )
        ),
        merchant_to_upsert AS (
          INSERT INTO ledger_merchant (id, workspace_id, name, normalized_name, created_by_user_id)
          SELECT ${merchant?.id ?? null}, ${merchant?.workspaceId ?? null}, ${merchant?.name ?? null},
            ${merchant?.normalizedName ?? null}, ${merchant?.createdByUserId ?? null}
          FROM eligible
          WHERE ${merchant !== null}
          ON CONFLICT (workspace_id, normalized_name)
            DO UPDATE SET normalized_name = EXCLUDED.normalized_name
          RETURNING id
        ),
        created AS (
          INSERT INTO ledger_transaction (
            id, workspace_id, kind, status, amount_minor, currency, occurred_at,
            account_id, transfer_account_id, category_id, merchant_id,
            created_by_user_id, paid_by_user_id, transfer_group_id,
            refunded_transaction_id, reversal_of_transaction_id, source,
            deduplication_fingerprint, note
          )
          SELECT ${record.id}, ${record.workspaceId}, ${record.kind}, ${record.status},
            ${record.amountMinor}, ${record.currency}, ${record.occurredAt},
            ${record.accountId}, ${record.transferAccountId}, ${record.categoryId},
            COALESCE((SELECT id FROM merchant_to_upsert), ${record.merchantId}),
            ${record.createdByUserId}, ${record.paidByUserId}, ${record.transferGroupId},
            ${record.refundedTransactionId}, ${record.reversalOfTransactionId},
            ${JSON.stringify(record.source)}::jsonb, ${record.deduplicationFingerprint}, ${record.note}
          FROM eligible
          RETURNING id
        )
        SELECT 'CREATED'::text AS outcome, id AS "transactionId",
          NULL::text AS "accountId", NULL::text AS "accountType", NULL::text AS currency,
          NULL::bigint AS "availableBalanceMinor"
        FROM created
        UNION ALL
        SELECT 'INSUFFICIENT_FUNDS'::text AS outcome, NULL::text AS "transactionId",
          "accountId", "accountType", currency, "currentBalanceMinor" AS "availableBalanceMinor"
        FROM current_guard_balance
        WHERE ${guard !== null}
          AND "currentBalanceMinor" - ${guard?.requestedDebitMinor ?? 0n}
            < ${guard?.minimumAllowedBalanceMinor ?? 0n}
          AND NOT EXISTS (SELECT 1 FROM created);
      `],
      { isolationLevel: "Serializable" },
    );
    const result = (rows as unknown as readonly RawSpendabilityWriteResult[])[0];
    if (!result) throw new Error("Canonical transaction write did not produce a result.");
    if (result.outcome === "CREATED") {
      if (!result.transactionId) throw new Error("Atomic transaction write did not return an ID.");
      const created = await this.findTransaction(record.workspaceId, result.transactionId);
      if (!created) throw new Error("Financial transaction was not found after its atomic write.");
      return { outcome: "CREATED", transaction: created };
    }
    if (!guard || !result.accountId || !result.accountType || !result.currency || result.availableBalanceMinor === null) {
      throw new Error("Spendability rejection did not contain its authoritative balance.");
    }
    return {
      outcome: "INSUFFICIENT_FUNDS",
      spendability: getAccountSpendability({
        accountId: result.accountId,
        accountType: result.accountType,
        currency: toCurrencyCode(result.currency),
        currentBalanceMinor: BigInt(result.availableBalanceMinor),
        requestedDebitMinor: guard.requestedDebitMinor,
      }),
    };
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
  ): Promise<LedgerFinancialCorrectionWriteResult> {
    const merchant = input.merchantToCreate;
    const guard = input.spendabilityGuard;
    const [originalAudit, reversalAudit, replacementAudit] = input.audits;
    const [rows] = await neonSql.transaction(
      (databaseTransaction) => [databaseTransaction`
      WITH RECURSIVE affected_account_ids(id) AS (
        SELECT DISTINCT id
        FROM (VALUES (${input.reversal.accountId}::text), (${input.reversal.transferAccountId ?? null}::text),
          (${input.replacement.accountId}::text), (${input.replacement.transferAccountId ?? null}::text)) AS ids(id)
        WHERE id IS NOT NULL
      ),
      locked_accounts AS (
        SELECT account.id, account.type, account.currency, account.opening_balance_minor
        FROM ledger_account AS account
        INNER JOIN affected_account_ids AS affected ON affected.id = account.id
        WHERE account.workspace_id = ${input.workspaceId}
        ORDER BY account.id
        FOR UPDATE
      ),
      current_guard_balance AS (
        SELECT account.id AS "accountId", account.type::text AS "accountType", account.currency,
          account.opening_balance_minor + COALESCE((
            SELECT SUM(
              CASE
                WHEN entry.kind = 'TRANSFER' AND entry.account_id = account.id THEN -entry.amount_minor
                WHEN entry.kind = 'TRANSFER' AND entry.transfer_account_id = account.id THEN entry.amount_minor
                WHEN entry.kind = 'EXPENSE' AND entry.reversal_of_transaction_id IS NULL THEN -entry.amount_minor
                WHEN entry.kind = 'EXPENSE' THEN entry.amount_minor
                WHEN entry.kind IN ('INCOME', 'REFUND') AND entry.reversal_of_transaction_id IS NULL THEN entry.amount_minor
                WHEN entry.kind IN ('INCOME', 'REFUND') THEN -entry.amount_minor
                ELSE 0::bigint
              END
            )
            FROM ledger_transaction AS entry
            WHERE entry.workspace_id = ${input.workspaceId}
              AND entry.status = 'POSTED'
              AND (entry.account_id = account.id OR entry.transfer_account_id = account.id)
          ), 0)
          + CASE
            WHEN ${input.reversal.kind} = 'TRANSFER' AND ${input.reversal.accountId} = account.id
              THEN -${input.reversal.amountMinor}
            WHEN ${input.reversal.kind} = 'TRANSFER' AND ${input.reversal.transferAccountId ?? null} = account.id
              THEN ${input.reversal.amountMinor}
            WHEN ${input.reversal.kind} = 'EXPENSE' AND ${input.reversal.accountId} = account.id
              THEN ${input.reversal.amountMinor}
            WHEN ${input.reversal.kind} = 'INCOME' AND ${input.reversal.accountId} = account.id
              THEN -${input.reversal.amountMinor}
            ELSE 0::bigint
          END AS "postReversalBalanceMinor"
        FROM locked_accounts AS account
        WHERE ${guard?.accountId ?? null}::text IS NOT NULL
          AND account.id = ${guard?.accountId ?? null}
      ),
      spendability_eligible AS (
        SELECT 1
        WHERE ${guard === null}
          OR EXISTS (
            SELECT 1
            FROM current_guard_balance
            WHERE currency = ${guard?.currency ?? null}
              AND "postReversalBalanceMinor" - ${guard?.requestedDebitMinor ?? 0n}
                >= ${guard?.minimumAllowedBalanceMinor ?? 0n}
          )
      ),
      lineage(id) AS (
        SELECT ${input.originalTransactionId}::text
        UNION
        SELECT correction.original_transaction_id
        FROM ledger_transaction_correction AS correction
        INNER JOIN lineage ON lineage.id = correction.replacement_transaction_id
        WHERE correction.workspace_id = ${input.workspaceId}
      ),
      candidate AS (
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
          AND (
            ${input.replacement.kind !== "EXPENSE"}
            OR COALESCE((
              SELECT SUM(refund.amount_minor)
              FROM ledger_transaction AS refund
              WHERE refund.workspace_id = ${input.workspaceId}
                AND refund.kind = 'REFUND'
                AND refund.status = 'POSTED'
                AND refund.refunded_transaction_id IN (SELECT id FROM lineage)
            ), 0) <= ${input.replacement.amountMinor}
          )
          AND EXISTS (SELECT 1 FROM spendability_eligible)
          AND (SELECT COUNT(*) FROM locked_accounts) = (SELECT COUNT(*) FROM affected_account_ids)
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
      SELECT 'CREATED'::text AS outcome, id AS "correctionId", NULL::text AS "accountId",
        NULL::text AS "accountType", NULL::text AS currency, NULL::bigint AS "availableBalanceMinor"
      FROM correction
      UNION ALL
      SELECT 'INSUFFICIENT_FUNDS'::text AS outcome, NULL::text AS "correctionId", "accountId",
        "accountType", currency, "postReversalBalanceMinor" AS "availableBalanceMinor"
      FROM current_guard_balance
      WHERE ${guard !== null}
        AND "postReversalBalanceMinor" - ${guard?.requestedDebitMinor ?? 0n}
          < ${guard?.minimumAllowedBalanceMinor ?? 0n}
        AND NOT EXISTS (SELECT 1 FROM correction);
    `],
      { isolationLevel: "Serializable" },
    );
    const result = (rows as unknown as readonly RawCorrectionSpendabilityWriteResult[])[0];
    if (!result) return { outcome: "CONFLICT" };
    if (result.outcome === "CREATED") {
      const correction = await this.findTransactionCorrectionByOriginal(input.workspaceId, input.originalTransactionId);
      if (!correction) throw new Error("Financial correction was not found after its atomic write.");
      return { outcome: "CREATED", correction };
    }
    if (!guard || !result.accountId || !result.accountType || !result.currency || result.availableBalanceMinor === null) {
      throw new Error("Correction spendability rejection did not contain its authoritative balance.");
    }
    return {
      outcome: "INSUFFICIENT_FUNDS",
      spendability: getAccountSpendability({
        accountId: result.accountId,
        accountType: result.accountType,
        currency: toCurrencyCode(result.currency),
        currentBalanceMinor: BigInt(result.availableBalanceMinor),
        requestedDebitMinor: guard.requestedDebitMinor,
      }),
    };
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
    if (filters.accountId) {
      // An account filter describes the account's activity, so a transfer is
      // relevant on both its source and destination account histories.
      predicates.push(or(
        eq(ledgerTransactions.accountId, filters.accountId),
        eq(ledgerTransactions.transferAccountId, filters.accountId),
      )!);
    }
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

type RawSpendabilityWriteResult = {
  outcome: "CREATED" | "INSUFFICIENT_FUNDS";
  transactionId: string | null;
  accountId: string | null;
  accountType: LedgerAccountRecord["type"] | null;
  currency: string | null;
  availableBalanceMinor: bigint | string | null;
};

type RawCorrectionSpendabilityWriteResult = {
  outcome: "CREATED" | "INSUFFICIENT_FUNDS";
  correctionId: string | null;
  accountId: string | null;
  accountType: LedgerAccountRecord["type"] | null;
  currency: string | null;
  availableBalanceMinor: bigint | string | null;
};

type RawLedgerAccountBalance = {
  accountId: string;
  accountType: LedgerAccountRecord["type"];
  currency: string;
  currentBalanceMinor: bigint | string;
};

type RawAccountDetailMovementSummary = {
  hasCurrencyMismatch: boolean | "true" | "false";
  inflowsMinor: bigint | string | number;
  outflowsMinor: bigint | string | number;
  netTransfersMinor: bigint | string | number;
  transactionCount: bigint | string | number;
};

type RawAccountDetailBalanceDelta = {
  kind: "BASE" | "DAY";
  date: string | null;
  movementMinor: bigint | string | number;
};

type RawAccountDetailCategoryTotal = {
  id: string;
  name: string;
  amountMinor: bigint | string | number;
  totalMinor: bigint | string | number;
};

function mapLedgerAccountBalance(record: RawLedgerAccountBalance): LedgerAccountBalance {
  const currency = toCurrencyCode(record.currency);
  const currentBalanceMinor = typeof record.currentBalanceMinor === "bigint"
    ? record.currentBalanceMinor
    : BigInt(record.currentBalanceMinor);
  const spendability = getAccountSpendability({
    accountId: record.accountId,
    accountType: record.accountType,
    currency,
    currentBalanceMinor,
    requestedDebitMinor: 0n,
  });
  return {
    accountId: record.accountId,
    currency,
    currentBalanceMinor,
    availableBalanceMinor: spendability.availableBalanceMinor,
    spendabilityMode: spendability.mode,
  };
}

function mapAccountDetailMovementSummary(
  record: RawAccountDetailMovementSummary | undefined,
): LedgerAccountDetailMovementSummary {
  if (!record) throw new Error("Unable to calculate account movement summary.");
  return {
    hasCurrencyMismatch: record.hasCurrencyMismatch === true || record.hasCurrencyMismatch === "true",
    inflowsMinor: toBigInt(record.inflowsMinor),
    outflowsMinor: toBigInt(record.outflowsMinor),
    netTransfersMinor: toBigInt(record.netTransfersMinor),
    transactionCount: Number(record.transactionCount),
  };
}

function toBigInt(value: bigint | string | number): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

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
