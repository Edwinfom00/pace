import { and, asc, count, desc, eq } from "drizzle-orm";

import { db, neonSql } from "@/db/client";
import {
  financialInboxAudits,
  financialInboxItems,
  recurringPayments,
  transactionClassificationRules,
  transactionClassifications,
} from "@/db/schema";

import type {
  ClassificationRuleRecord,
  FinancialInboxAuditRecord,
  FinancialInboxItemRecord,
  InboxItemStatus,
  InboxReason,
  RecurringPaymentLifecycle,
  RecurringPaymentRecord,
  RecurringPaymentStatus,
  TransactionClassificationRecord,
} from "../domain";

export type CreateClassificationRuleInput = Omit<
  ClassificationRuleRecord,
  "createdAt" | "updatedAt"
>;
export type CreateTransactionClassificationInput = Omit<
  TransactionClassificationRecord,
  "createdAt" | "updatedAt"
>;
export type CreateFinancialInboxItemInput = Omit<
  FinancialInboxItemRecord,
  "createdAt" | "updatedAt"
>;
export type CreateRecurringPaymentInput = Omit<RecurringPaymentRecord, "createdAt" | "updatedAt">;
export type CreateFinancialInboxAuditInput = Omit<
  FinancialInboxAuditRecord,
  | "createdAt"
  | "inboxItemId"
  | "classificationId"
  | "recurringPaymentId"
  | "actorUserId"
  | "commandFingerprint"
  | "idempotencyKey"
> & {
  inboxItemId?: string | null;
  classificationId?: string | null;
  recurringPaymentId?: string | null;
  actorUserId?: string | null;
  commandFingerprint?: string | null;
  idempotencyKey?: string | null;
};

/** A review-state write and its audit are inseparable. */
export type TransitionRecurringPaymentInput = {
  readonly workspaceId: string;
  readonly recurringPaymentId: string;
  /** The state approved by the action policy at read time. */
  readonly expectedStatus: RecurringPaymentStatus;
  /** The optional read-model version supplied by a client. */
  readonly expectedUpdatedAt?: Date;
  readonly status: RecurringPaymentStatus;
  readonly confirmedByUserId: string | null;
  readonly confirmedAt: Date | null;
  readonly ignoredByUserId: string | null;
  readonly ignoredAt: Date | null;
  readonly audit: CreateFinancialInboxAuditInput & {
    readonly recurringPaymentId: string;
    readonly actorUserId: string;
    readonly commandFingerprint: string;
    readonly idempotencyKey: string;
  };
};

/** A future-only recurring mutation and its audit are inseparable. */
export type MutateRecurringPaymentInput = {
  readonly workspaceId: string;
  readonly recurringPaymentId: string;
  readonly expectedStatus: RecurringPaymentStatus;
  readonly expectedLifecycle: RecurringPaymentLifecycle;
  readonly expectedUpdatedAt?: Date;
  readonly displayName: string | null;
  readonly typicalAmountMinor: bigint;
  readonly cadenceDays: number;
  readonly nextOccurrenceAt: Date | null;
  readonly accountId: string | null;
  readonly categoryId: string | null;
  readonly lifecycle: RecurringPaymentLifecycle;
  readonly audit: CreateFinancialInboxAuditInput & {
    readonly recurringPaymentId: string;
    readonly actorUserId: string;
    readonly commandFingerprint: string;
    readonly idempotencyKey: string;
  };
};

export interface FinancialInboxRepository {
  listRules(workspaceId: string): Promise<ClassificationRuleRecord[]>;
  findRule(
    workspaceId: string,
    normalizedMerchant: string,
    kind: ClassificationRuleRecord["kind"],
  ): Promise<ClassificationRuleRecord | null>;
  createRule(input: CreateClassificationRuleInput): Promise<ClassificationRuleRecord>;
  updateRule(
    workspaceId: string,
    ruleId: string,
    input: Pick<ClassificationRuleRecord, "categoryId" | "updatedByUserId">,
  ): Promise<ClassificationRuleRecord | null>;

  findClassificationByTransaction(
    workspaceId: string,
    transactionId: string,
  ): Promise<TransactionClassificationRecord | null>;
  findClassification(
    workspaceId: string,
    classificationId: string,
  ): Promise<TransactionClassificationRecord | null>;
  createClassification(
    input: CreateTransactionClassificationInput,
  ): Promise<TransactionClassificationRecord>;
  updateClassification(
    workspaceId: string,
    classificationId: string,
    input: Partial<
      Pick<
        TransactionClassificationRecord,
        | "suggestedCategoryId"
        | "appliedCategoryId"
        | "source"
        | "confidence"
        | "status"
        | "explanation"
        | "resolvedByUserId"
        | "resolvedAt"
      >
    >,
  ): Promise<TransactionClassificationRecord | null>;

  createInboxItem(input: CreateFinancialInboxItemInput): Promise<FinancialInboxItemRecord>;
  findInboxItem(workspaceId: string, inboxItemId: string): Promise<FinancialInboxItemRecord | null>;
  findOpenInboxItem(
    workspaceId: string,
    transactionId: string,
    reason: InboxReason,
  ): Promise<FinancialInboxItemRecord | null>;
  listInboxItems(
    workspaceId: string,
    status?: InboxItemStatus,
    limit?: number,
  ): Promise<FinancialInboxItemRecord[]>;
  countInboxItems(workspaceId: string, status?: InboxItemStatus): Promise<number>;
  updateInboxItem(
    workspaceId: string,
    inboxItemId: string,
    input: Partial<
      Pick<FinancialInboxItemRecord, "status" | "resolvedByUserId" | "resolvedAt" | "details">
    >,
  ): Promise<FinancialInboxItemRecord | null>;

  findRecurringPayment(
    workspaceId: string,
    detectionKey: string,
  ): Promise<RecurringPaymentRecord | null>;
  findRecurringPaymentById(
    workspaceId: string,
    recurringPaymentId: string,
  ): Promise<RecurringPaymentRecord | null>;
  findRecurringPaymentByIdempotencyKey(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<RecurringPaymentRecord | null>;
  findRecurringAuditByIdempotencyKey(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<FinancialInboxAuditRecord | null>;
  createRecurringPayment(input: CreateRecurringPaymentInput): Promise<RecurringPaymentRecord>;
  /** Atomically applies a policy-approved review transition and writes its audit. */
  transitionRecurringPayment(input: TransitionRecurringPaymentInput): Promise<RecurringPaymentRecord | null>;
  /** Atomically applies a policy-approved future-only mutation and writes its audit. */
  mutateRecurringPayment(input: MutateRecurringPaymentInput): Promise<RecurringPaymentRecord | null>;
  updateRecurringPayment(
    workspaceId: string,
    recurringPaymentId: string,
    input: Partial<
      Pick<
        RecurringPaymentRecord,
        | "status"
        | "confirmedByUserId"
        | "confirmedAt"
        | "ignoredByUserId"
        | "ignoredAt"
        | "lastOccurredAt"
        | "sampleTransactionIds"
      >
    >,
  ): Promise<RecurringPaymentRecord | null>;
  listRecurringPayments(workspaceId: string): Promise<RecurringPaymentRecord[]>;

  createAudit(input: CreateFinancialInboxAuditInput): Promise<FinancialInboxAuditRecord>;
  listAudit(
    workspaceId: string,
    classificationId?: string,
    inboxItemId?: string,
  ): Promise<FinancialInboxAuditRecord[]>;
}

export class DatabaseFinancialInboxRepository implements FinancialInboxRepository {
  async listRules(workspaceId: string): Promise<ClassificationRuleRecord[]> {
    return db
      .select()
      .from(transactionClassificationRules)
      .where(eq(transactionClassificationRules.workspaceId, workspaceId))
      .orderBy(desc(transactionClassificationRules.updatedAt));
  }

  async findRule(
    workspaceId: string,
    normalizedMerchant: string,
    kind: ClassificationRuleRecord["kind"],
  ): Promise<ClassificationRuleRecord | null> {
    const [record] = await db
      .select()
      .from(transactionClassificationRules)
      .where(
        and(
          eq(transactionClassificationRules.workspaceId, workspaceId),
          eq(transactionClassificationRules.normalizedMerchant, normalizedMerchant),
          eq(transactionClassificationRules.kind, kind),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async createRule(input: CreateClassificationRuleInput): Promise<ClassificationRuleRecord> {
    const [record] = await db.insert(transactionClassificationRules).values(input).returning();
    if (!record) throw new Error("Failed to create classification rule.");
    return record;
  }

  async updateRule(
    workspaceId: string,
    ruleId: string,
    input: Pick<ClassificationRuleRecord, "categoryId" | "updatedByUserId">,
  ): Promise<ClassificationRuleRecord | null> {
    const [record] = await db
      .update(transactionClassificationRules)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(transactionClassificationRules.workspaceId, workspaceId),
          eq(transactionClassificationRules.id, ruleId),
        ),
      )
      .returning();
    return record ?? null;
  }

  async findClassificationByTransaction(
    workspaceId: string,
    transactionId: string,
  ): Promise<TransactionClassificationRecord | null> {
    const [record] = await db
      .select()
      .from(transactionClassifications)
      .where(
        and(
          eq(transactionClassifications.workspaceId, workspaceId),
          eq(transactionClassifications.transactionId, transactionId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findClassification(
    workspaceId: string,
    classificationId: string,
  ): Promise<TransactionClassificationRecord | null> {
    const [record] = await db
      .select()
      .from(transactionClassifications)
      .where(
        and(
          eq(transactionClassifications.workspaceId, workspaceId),
          eq(transactionClassifications.id, classificationId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async createClassification(
    input: CreateTransactionClassificationInput,
  ): Promise<TransactionClassificationRecord> {
    const [record] = await db.insert(transactionClassifications).values(input).returning();
    if (!record) throw new Error("Failed to create transaction classification.");
    return record;
  }

  async updateClassification(
    workspaceId: string,
    classificationId: string,
    input: Partial<
      Pick<
        TransactionClassificationRecord,
        | "suggestedCategoryId"
        | "appliedCategoryId"
        | "source"
        | "confidence"
        | "status"
        | "explanation"
        | "resolvedByUserId"
        | "resolvedAt"
      >
    >,
  ): Promise<TransactionClassificationRecord | null> {
    const [record] = await db
      .update(transactionClassifications)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(transactionClassifications.workspaceId, workspaceId),
          eq(transactionClassifications.id, classificationId),
        ),
      )
      .returning();
    return record ?? null;
  }

  async createInboxItem(input: CreateFinancialInboxItemInput): Promise<FinancialInboxItemRecord> {
    const [record] = await db.insert(financialInboxItems).values(input).returning();
    if (!record) throw new Error("Failed to create financial Inbox item.");
    return record;
  }

  async findInboxItem(workspaceId: string, inboxItemId: string): Promise<FinancialInboxItemRecord | null> {
    const [record] = await db
      .select()
      .from(financialInboxItems)
      .where(
        and(
          eq(financialInboxItems.workspaceId, workspaceId),
          eq(financialInboxItems.id, inboxItemId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findOpenInboxItem(
    workspaceId: string,
    transactionId: string,
    reason: InboxReason,
  ): Promise<FinancialInboxItemRecord | null> {
    const [record] = await db
      .select()
      .from(financialInboxItems)
      .where(
        and(
          eq(financialInboxItems.workspaceId, workspaceId),
          eq(financialInboxItems.transactionId, transactionId),
          eq(financialInboxItems.reason, reason),
          eq(financialInboxItems.status, "OPEN"),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async listInboxItems(
    workspaceId: string,
    status?: InboxItemStatus,
    limit?: number,
  ): Promise<FinancialInboxItemRecord[]> {
    const query = db
      .select()
      .from(financialInboxItems)
      .where(
        status
          ? and(eq(financialInboxItems.workspaceId, workspaceId), eq(financialInboxItems.status, status))
          : eq(financialInboxItems.workspaceId, workspaceId),
      )
      .orderBy(desc(financialInboxItems.createdAt));

    return limit === undefined ? query : query.limit(limit);
  }

  async countInboxItems(workspaceId: string, status?: InboxItemStatus): Promise<number> {
    const [result] = await db
      .select({ total: count() })
      .from(financialInboxItems)
      .where(
        status
          ? and(eq(financialInboxItems.workspaceId, workspaceId), eq(financialInboxItems.status, status))
          : eq(financialInboxItems.workspaceId, workspaceId),
      );

    return result?.total ?? 0;
  }

  async updateInboxItem(
    workspaceId: string,
    inboxItemId: string,
    input: Partial<
      Pick<FinancialInboxItemRecord, "status" | "resolvedByUserId" | "resolvedAt" | "details">
    >,
  ): Promise<FinancialInboxItemRecord | null> {
    const [record] = await db
      .update(financialInboxItems)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(financialInboxItems.workspaceId, workspaceId),
          eq(financialInboxItems.id, inboxItemId),
        ),
      )
      .returning();
    return record ?? null;
  }

  async findRecurringPayment(
    workspaceId: string,
    detectionKey: string,
  ): Promise<RecurringPaymentRecord | null> {
    const [record] = await db
      .select()
      .from(recurringPayments)
      .where(
        and(
          eq(recurringPayments.workspaceId, workspaceId),
          eq(recurringPayments.detectionKey, detectionKey),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findRecurringPaymentById(
    workspaceId: string,
    recurringPaymentId: string,
  ): Promise<RecurringPaymentRecord | null> {
    const [record] = await db
      .select()
      .from(recurringPayments)
      .where(
        and(
          eq(recurringPayments.workspaceId, workspaceId),
          eq(recurringPayments.id, recurringPaymentId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findRecurringPaymentByIdempotencyKey(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<RecurringPaymentRecord | null> {
    const [record] = await db
      .select()
      .from(recurringPayments)
      .where(
        and(
          eq(recurringPayments.workspaceId, workspaceId),
          eq(recurringPayments.createdByUserId, actorUserId),
          eq(recurringPayments.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findRecurringAuditByIdempotencyKey(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<FinancialInboxAuditRecord | null> {
    const [record] = await db
      .select()
      .from(financialInboxAudits)
      .where(
        and(
          eq(financialInboxAudits.workspaceId, workspaceId),
          eq(financialInboxAudits.actorUserId, actorUserId),
          eq(financialInboxAudits.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async createRecurringPayment(input: CreateRecurringPaymentInput): Promise<RecurringPaymentRecord> {
    const [record] = await db.insert(recurringPayments).values(input).returning();
    if (!record) throw new Error("Failed to create recurring-payment candidate.");
    return record;
  }

  async transitionRecurringPayment(
    input: TransitionRecurringPaymentInput,
  ): Promise<RecurringPaymentRecord | null> {
    // The row lock, state/version guard, state write, and existing audit write
    // share one serializable statement. No ledger table appears in this path.
    const [rows] = await neonSql.transaction(
      (transaction) => [transaction`
        WITH candidate AS (
          SELECT id
          FROM recurring_payment
          WHERE workspace_id = ${input.workspaceId}
            AND id = ${input.recurringPaymentId}
            AND status = ${input.expectedStatus}::recurring_payment_status
            AND (
              ${input.expectedUpdatedAt ?? null}::timestamptz IS NULL
              OR date_trunc('milliseconds', updated_at) = ${input.expectedUpdatedAt ?? null}
            )
          FOR UPDATE
        ),
        updated AS (
          UPDATE recurring_payment AS payment
          SET
            status = ${input.status}::recurring_payment_status,
            confirmed_by_user_id = ${input.confirmedByUserId},
            confirmed_at = ${input.confirmedAt},
            ignored_by_user_id = ${input.ignoredByUserId},
            ignored_at = ${input.ignoredAt},
            updated_at = greatest(clock_timestamp(), payment.updated_at + interval '1 millisecond')
          FROM candidate
          WHERE payment.id = candidate.id
          RETURNING
            payment.id,
            payment.workspace_id AS "workspaceId",
            payment.detection_key AS "detectionKey",
            payment.normalized_merchant AS "normalizedMerchant",
            payment.display_name AS "displayName",
            payment.origin::text AS origin,
            payment.direction::text AS direction,
            payment.account_id AS "accountId",
            payment.category_id AS "categoryId",
            payment.currency,
            payment.typical_amount_minor AS "typicalAmountMinor",
            payment.amount_tolerance_bps AS "amountToleranceBps",
            payment.cadence_days AS "cadenceDays",
            payment.first_occurred_at AS "firstOccurredAt",
            payment.last_occurred_at AS "lastOccurredAt",
            payment.next_occurrence_at AS "nextOccurrenceAt",
            payment.sample_transaction_ids AS "sampleTransactionIds",
            payment.status::text AS status,
            payment.lifecycle::text AS lifecycle,
            payment.created_by_user_id AS "createdByUserId",
            payment.idempotency_key AS "idempotencyKey",
            payment.command_fingerprint AS "commandFingerprint",
            payment.confirmed_by_user_id AS "confirmedByUserId",
            payment.confirmed_at AS "confirmedAt",
            payment.ignored_by_user_id AS "ignoredByUserId",
            payment.ignored_at AS "ignoredAt",
            payment.created_at AS "createdAt",
            payment.updated_at AS "updatedAt"
        ),
        audited AS (
          INSERT INTO financial_inbox_audit (
            id, workspace_id, inbox_item_id, classification_id, recurring_payment_id,
            actor_user_id, event, command_fingerprint, idempotency_key, metadata
          )
          SELECT
            ${input.audit.id}, ${input.audit.workspaceId}, ${input.audit.inboxItemId ?? null},
            ${input.audit.classificationId ?? null}, updated.id, ${input.audit.actorUserId},
            ${input.audit.event}, ${input.audit.commandFingerprint}, ${input.audit.idempotencyKey},
            ${JSON.stringify(input.audit.metadata)}::jsonb
          FROM updated
        )
        SELECT * FROM updated;
      `],
      { isolationLevel: "Serializable" },
    );
    const record = (rows as unknown as readonly RawRecurringPayment[])[0];
    return record ? mapRecurringPayment(record) : null;
  }

  async mutateRecurringPayment(
    input: MutateRecurringPaymentInput,
  ): Promise<RecurringPaymentRecord | null> {
    // This statement intentionally reads and writes recurring_payment plus its
    // audit only. It cannot alter transactions, balances, or ledger reporting.
    const [rows] = await neonSql.transaction(
      (transaction) => [transaction`
        WITH candidate AS (
          SELECT id
          FROM recurring_payment
          WHERE workspace_id = ${input.workspaceId}
            AND id = ${input.recurringPaymentId}
            AND status = ${input.expectedStatus}::recurring_payment_status
            AND lifecycle = ${input.expectedLifecycle}::recurring_payment_lifecycle
            AND (
              ${input.expectedUpdatedAt ?? null}::timestamptz IS NULL
              OR date_trunc('milliseconds', updated_at) = ${input.expectedUpdatedAt ?? null}
            )
          FOR UPDATE
        ),
        updated AS (
          UPDATE recurring_payment AS payment
          SET
            display_name = ${input.displayName},
            typical_amount_minor = ${input.typicalAmountMinor},
            cadence_days = ${input.cadenceDays},
            next_occurrence_at = ${input.nextOccurrenceAt},
            account_id = ${input.accountId},
            category_id = ${input.categoryId},
            lifecycle = ${input.lifecycle}::recurring_payment_lifecycle,
            updated_at = greatest(clock_timestamp(), payment.updated_at + interval '1 millisecond')
          FROM candidate
          WHERE payment.id = candidate.id
          RETURNING
            payment.id,
            payment.workspace_id AS "workspaceId",
            payment.detection_key AS "detectionKey",
            payment.normalized_merchant AS "normalizedMerchant",
            payment.display_name AS "displayName",
            payment.origin::text AS origin,
            payment.direction::text AS direction,
            payment.account_id AS "accountId",
            payment.category_id AS "categoryId",
            payment.currency,
            payment.typical_amount_minor AS "typicalAmountMinor",
            payment.amount_tolerance_bps AS "amountToleranceBps",
            payment.cadence_days AS "cadenceDays",
            payment.first_occurred_at AS "firstOccurredAt",
            payment.last_occurred_at AS "lastOccurredAt",
            payment.next_occurrence_at AS "nextOccurrenceAt",
            payment.sample_transaction_ids AS "sampleTransactionIds",
            payment.status::text AS status,
            payment.lifecycle::text AS lifecycle,
            payment.created_by_user_id AS "createdByUserId",
            payment.idempotency_key AS "idempotencyKey",
            payment.command_fingerprint AS "commandFingerprint",
            payment.confirmed_by_user_id AS "confirmedByUserId",
            payment.confirmed_at AS "confirmedAt",
            payment.ignored_by_user_id AS "ignoredByUserId",
            payment.ignored_at AS "ignoredAt",
            payment.created_at AS "createdAt",
            payment.updated_at AS "updatedAt"
        ),
        audited AS (
          INSERT INTO financial_inbox_audit (
            id, workspace_id, inbox_item_id, classification_id, recurring_payment_id,
            actor_user_id, event, command_fingerprint, idempotency_key, metadata
          )
          SELECT
            ${input.audit.id}, ${input.audit.workspaceId}, ${input.audit.inboxItemId ?? null},
            ${input.audit.classificationId ?? null}, updated.id, ${input.audit.actorUserId},
            ${input.audit.event}, ${input.audit.commandFingerprint}, ${input.audit.idempotencyKey},
            ${JSON.stringify(input.audit.metadata)}::jsonb
          FROM updated
        )
        SELECT * FROM updated;
      `],
      { isolationLevel: "Serializable" },
    );
    const record = (rows as unknown as readonly RawRecurringPayment[])[0];
    return record ? mapRecurringPayment(record) : null;
  }

  async updateRecurringPayment(
    workspaceId: string,
    recurringPaymentId: string,
    input: Partial<
      Pick<
        RecurringPaymentRecord,
        | "status"
        | "confirmedByUserId"
        | "confirmedAt"
        | "ignoredByUserId"
        | "ignoredAt"
        | "lastOccurredAt"
        | "sampleTransactionIds"
      >
    >,
  ): Promise<RecurringPaymentRecord | null> {
    const [record] = await db
      .update(recurringPayments)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(recurringPayments.workspaceId, workspaceId),
          eq(recurringPayments.id, recurringPaymentId),
        ),
      )
      .returning();
    return record ?? null;
  }

  async listRecurringPayments(workspaceId: string): Promise<RecurringPaymentRecord[]> {
    return db
      .select()
      .from(recurringPayments)
      .where(eq(recurringPayments.workspaceId, workspaceId))
      .orderBy(desc(recurringPayments.lastOccurredAt));
  }

  async createAudit(input: CreateFinancialInboxAuditInput): Promise<FinancialInboxAuditRecord> {
    const [record] = await db.insert(financialInboxAudits).values(input).returning();
    if (!record) throw new Error("Failed to write financial Inbox audit event.");
    return record;
  }

  async listAudit(
    workspaceId: string,
    classificationId?: string,
    inboxItemId?: string,
  ): Promise<FinancialInboxAuditRecord[]> {
    const predicates = [eq(financialInboxAudits.workspaceId, workspaceId)];
    if (classificationId) predicates.push(eq(financialInboxAudits.classificationId, classificationId));
    if (inboxItemId) predicates.push(eq(financialInboxAudits.inboxItemId, inboxItemId));
    return db
      .select()
      .from(financialInboxAudits)
      .where(and(...predicates))
      .orderBy(asc(financialInboxAudits.createdAt));
  }
}

type RawRecurringPayment = Omit<
  RecurringPaymentRecord,
  | "typicalAmountMinor"
  | "origin"
  | "direction"
  | "firstOccurredAt"
  | "lastOccurredAt"
  | "nextOccurrenceAt"
  | "sampleTransactionIds"
  | "status"
  | "lifecycle"
  | "confirmedAt"
  | "ignoredAt"
  | "createdAt"
  | "updatedAt"
> & {
  typicalAmountMinor: bigint | string;
  origin: string;
  direction: string;
  firstOccurredAt: Date | string;
  lastOccurredAt: Date | string;
  nextOccurrenceAt: Date | string | null;
  sampleTransactionIds: string[] | string;
  status: string;
  lifecycle: string;
  confirmedAt: Date | string | null;
  ignoredAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function mapRecurringPayment(record: RawRecurringPayment): RecurringPaymentRecord {
  const sampleTransactionIds = typeof record.sampleTransactionIds === "string"
    ? JSON.parse(record.sampleTransactionIds) as unknown
    : record.sampleTransactionIds;
  if (!Array.isArray(sampleTransactionIds) || sampleTransactionIds.some((value) => typeof value !== "string")) {
    throw new Error("Recurring payment has invalid sample transaction evidence.");
  }
  return {
    ...record,
    typicalAmountMinor: typeof record.typicalAmountMinor === "bigint"
      ? record.typicalAmountMinor
      : BigInt(record.typicalAmountMinor),
    origin: record.origin as RecurringPaymentRecord["origin"],
    direction: record.direction as RecurringPaymentRecord["direction"],
    firstOccurredAt: new Date(record.firstOccurredAt),
    lastOccurredAt: new Date(record.lastOccurredAt),
    nextOccurrenceAt: record.nextOccurrenceAt === null ? null : new Date(record.nextOccurrenceAt),
    sampleTransactionIds,
    status: record.status as RecurringPaymentRecord["status"],
    lifecycle: record.lifecycle as RecurringPaymentRecord["lifecycle"],
    confirmedAt: record.confirmedAt === null ? null : new Date(record.confirmedAt),
    ignoredAt: record.ignoredAt === null ? null : new Date(record.ignoredAt),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}
