import type {
  ClassificationRuleRecord,
  FinancialInboxAuditRecord,
  FinancialInboxItemRecord,
  InboxItemStatus,
  InboxReason,
  RecurringPaymentRecord,
  TransactionClassificationRecord,
} from "@/modules/financial-inbox/domain";
import type {
  CreateClassificationRuleInput,
  CreateFinancialInboxAuditInput,
  CreateFinancialInboxItemInput,
  CreateRecurringPaymentInput,
  CreateTransactionClassificationInput,
  FinancialInboxRepository,
} from "@/modules/financial-inbox/repositories/financial-inbox-repository";

export class InMemoryFinancialInboxRepository implements FinancialInboxRepository {
  readonly rules = new Map<string, ClassificationRuleRecord>();
  readonly classifications = new Map<string, TransactionClassificationRecord>();
  readonly items = new Map<string, FinancialInboxItemRecord>();
  readonly recurring = new Map<string, RecurringPaymentRecord>();
  readonly audit = new Map<string, FinancialInboxAuditRecord>();

  async listRules(workspaceId: string): Promise<ClassificationRuleRecord[]> {
    return [...this.rules.values()].filter((rule) => rule.workspaceId === workspaceId);
  }

  async findRule(
    workspaceId: string,
    normalizedMerchant: string,
    kind: ClassificationRuleRecord["kind"],
  ): Promise<ClassificationRuleRecord | null> {
    return (
      [...this.rules.values()].find(
        (rule) =>
          rule.workspaceId === workspaceId &&
          rule.normalizedMerchant === normalizedMerchant &&
          rule.kind === kind,
      ) ?? null
    );
  }

  async createRule(input: CreateClassificationRuleInput): Promise<ClassificationRuleRecord> {
    const now = new Date();
    const record = { ...input, createdAt: now, updatedAt: now };
    this.rules.set(record.id, record);
    return record;
  }

  async updateRule(
    workspaceId: string,
    ruleId: string,
    input: Pick<ClassificationRuleRecord, "categoryId" | "updatedByUserId">,
  ): Promise<ClassificationRuleRecord | null> {
    const current = this.rules.get(ruleId);
    if (!current || current.workspaceId !== workspaceId) return null;
    const record = { ...current, ...input, updatedAt: new Date() };
    this.rules.set(ruleId, record);
    return record;
  }

  async findClassificationByTransaction(
    workspaceId: string,
    transactionId: string,
  ): Promise<TransactionClassificationRecord | null> {
    return (
      [...this.classifications.values()].find(
        (classification) =>
          classification.workspaceId === workspaceId && classification.transactionId === transactionId,
      ) ?? null
    );
  }

  async findClassification(
    workspaceId: string,
    classificationId: string,
  ): Promise<TransactionClassificationRecord | null> {
    const record = this.classifications.get(classificationId);
    return record?.workspaceId === workspaceId ? record : null;
  }

  async createClassification(
    input: CreateTransactionClassificationInput,
  ): Promise<TransactionClassificationRecord> {
    const now = new Date();
    const record = { ...input, createdAt: now, updatedAt: now };
    this.classifications.set(record.id, record);
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
    const current = await this.findClassification(workspaceId, classificationId);
    if (!current) return null;
    const record = { ...current, ...input, updatedAt: new Date() };
    this.classifications.set(record.id, record);
    return record;
  }

  async createInboxItem(input: CreateFinancialInboxItemInput): Promise<FinancialInboxItemRecord> {
    const now = new Date();
    const record = { ...input, createdAt: now, updatedAt: now };
    this.items.set(record.id, record);
    return record;
  }

  async findInboxItem(workspaceId: string, inboxItemId: string): Promise<FinancialInboxItemRecord | null> {
    const record = this.items.get(inboxItemId);
    return record?.workspaceId === workspaceId ? record : null;
  }

  async findOpenInboxItem(
    workspaceId: string,
    transactionId: string,
    reason: InboxReason,
  ): Promise<FinancialInboxItemRecord | null> {
    return (
      [...this.items.values()].find(
        (item) =>
          item.workspaceId === workspaceId &&
          item.transactionId === transactionId &&
          item.reason === reason &&
          item.status === "OPEN",
      ) ?? null
    );
  }

  async listInboxItems(
    workspaceId: string,
    status?: InboxItemStatus,
    limit?: number,
  ): Promise<FinancialInboxItemRecord[]> {
    const items = [...this.items.values()]
      .filter((item) => item.workspaceId === workspaceId && (!status || item.status === status))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return limit === undefined ? items : items.slice(0, limit);
  }

  async countInboxItems(workspaceId: string, status?: InboxItemStatus): Promise<number> {
    return [...this.items.values()].filter(
      (item) => item.workspaceId === workspaceId && (!status || item.status === status),
    ).length;
  }

  async updateInboxItem(
    workspaceId: string,
    inboxItemId: string,
    input: Partial<
      Pick<FinancialInboxItemRecord, "status" | "resolvedByUserId" | "resolvedAt" | "details">
    >,
  ): Promise<FinancialInboxItemRecord | null> {
    const current = await this.findInboxItem(workspaceId, inboxItemId);
    if (!current) return null;
    const record = { ...current, ...input, updatedAt: new Date() };
    this.items.set(record.id, record);
    return record;
  }

  async findRecurringPayment(
    workspaceId: string,
    detectionKey: string,
  ): Promise<RecurringPaymentRecord | null> {
    return (
      [...this.recurring.values()].find(
        (payment) => payment.workspaceId === workspaceId && payment.detectionKey === detectionKey,
      ) ?? null
    );
  }

  async findRecurringPaymentById(
    workspaceId: string,
    recurringPaymentId: string,
  ): Promise<RecurringPaymentRecord | null> {
    const record = this.recurring.get(recurringPaymentId);
    return record?.workspaceId === workspaceId ? record : null;
  }

  async findRecurringPaymentByIdempotencyKey(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<RecurringPaymentRecord | null> {
    return (
      [...this.recurring.values()].find(
        (payment) =>
          payment.workspaceId === workspaceId &&
          payment.createdByUserId === actorUserId &&
          payment.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async createRecurringPayment(input: CreateRecurringPaymentInput): Promise<RecurringPaymentRecord> {
    const now = new Date();
    const record = { ...input, createdAt: now, updatedAt: now };
    this.recurring.set(record.id, record);
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
    const current = await this.findRecurringPaymentById(workspaceId, recurringPaymentId);
    if (!current) return null;
    const record = { ...current, ...input, updatedAt: new Date() };
    this.recurring.set(record.id, record);
    return record;
  }

  async listRecurringPayments(workspaceId: string): Promise<RecurringPaymentRecord[]> {
    return [...this.recurring.values()]
      .filter((payment) => payment.workspaceId === workspaceId)
      .sort((left, right) => right.lastOccurredAt.getTime() - left.lastOccurredAt.getTime());
  }

  async createAudit(input: CreateFinancialInboxAuditInput): Promise<FinancialInboxAuditRecord> {
    const record: FinancialInboxAuditRecord = {
      ...input,
      inboxItemId: input.inboxItemId ?? null,
      classificationId: input.classificationId ?? null,
      recurringPaymentId: input.recurringPaymentId ?? null,
      actorUserId: input.actorUserId ?? null,
      createdAt: new Date(),
    };
    this.audit.set(record.id, record);
    return record;
  }

  async listAudit(
    workspaceId: string,
    classificationId?: string,
    inboxItemId?: string,
  ): Promise<FinancialInboxAuditRecord[]> {
    return [...this.audit.values()]
      .filter(
        (entry) =>
          entry.workspaceId === workspaceId &&
          (!classificationId || entry.classificationId === classificationId) &&
          (!inboxItemId || entry.inboxItemId === inboxItemId),
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }
}
