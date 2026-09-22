import { and, asc, count, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
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
  RecurringPaymentRecord,
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
  "createdAt" | "inboxItemId" | "classificationId" | "recurringPaymentId" | "actorUserId"
> & {
  inboxItemId?: string | null;
  classificationId?: string | null;
  recurringPaymentId?: string | null;
  actorUserId?: string | null;
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
  createRecurringPayment(input: CreateRecurringPaymentInput): Promise<RecurringPaymentRecord>;
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

  async createRecurringPayment(input: CreateRecurringPaymentInput): Promise<RecurringPaymentRecord> {
    const [record] = await db.insert(recurringPayments).values(input).returning();
    if (!record) throw new Error("Failed to create recurring-payment candidate.");
    return record;
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
