import { randomUUID } from "node:crypto";

import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { AuthenticatedActor } from "@/authorization/session";
import type { LedgerCategoryRecord, LedgerTransactionRecord } from "@/modules/ledger/domain";
import { currentFinancialTransactions } from "@/modules/ledger/correction-chain";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { classifyMerchant, type AiClassificationSuggestion } from "./classification";
import {
  type ClassifiedTransaction,
  type FinancialInboxItemRecord,
  type InboxAction,
  type InboxReason,
  isClassifiableTransaction,
  type RecurringPaymentRecord,
  type ResolveInboxInput,
  type TransactionClassificationRecord,
} from "./domain";
import { detectRecurringCandidates } from "./recurring-detection";
import type { FinancialInboxRepository } from "./repositories/financial-inbox-repository";

export interface TransactionClassificationRequest {
  transaction: LedgerTransactionRecord;
  aiSuggestion?: AiClassificationSuggestion | null;
}

export interface FinancialInboxView {
  id: string;
  reason: InboxReason;
  actions: InboxAction[];
  status: FinancialInboxItemRecord["status"];
  details: Record<string, unknown>;
  createdAt: string;
  transaction: {
    id: string;
    kind: LedgerTransactionRecord["kind"];
    amountMinor: string;
    currency: string;
    occurredAt: string;
    note: string | null;
    merchantName: string | null;
  };
  classification: {
    id: string;
    source: TransactionClassificationRecord["source"];
    confidence: number;
    status: TransactionClassificationRecord["status"];
    normalizedMerchant: string | null;
    suggestedCategoryId: string | null;
    appliedCategoryId: string | null;
    explanation: Record<string, unknown>;
  } | null;
  recurring: {
    id: string;
    status: RecurringPaymentRecord["status"];
    cadenceDays: number;
    typicalAmountMinor: string;
    currency: string;
  } | null;
}

export interface FinancialInboxPreviewView {
  unresolvedCount: number;
  items: FinancialInboxView[];
}

export interface RecurringPaymentView {
  id: string;
  normalizedMerchant: string;
  status: RecurringPaymentRecord["status"];
  cadenceDays: number;
  typicalAmountMinor: string;
  currency: string;
  firstOccurredAt: string;
  lastOccurredAt: string;
  sampleTransactionIds: string[];
}

/**
 * M4 classification lives beside the immutable ledger. It can enrich a
 * transaction and create review work, but it does not update money, account,
 * or ledger rows. Those mutations remain solely in the approved M3 action.
 */
export class FinancialInboxService {
  constructor(
    private readonly repository: FinancialInboxRepository,
    private readonly ledger: Pick<
      LedgerRepository,
      "findCategory" | "findMerchant" | "findTransaction" | "listCategories" | "listTransactions"
    >,
    private readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">,
  ) {}

  async ingestTransaction(
    actor: AuthenticatedActor,
    workspaceId: string,
    request: TransactionClassificationRequest,
  ): Promise<ClassifiedTransaction | null> {
    await this.requirePermission(actor.userId, workspaceId, "manage_ledger");
    const { transaction } = request;
    if (transaction.workspaceId !== workspaceId || !isClassifiableTransaction(transaction.kind)) return null;

    const existing = await this.repository.findClassificationByTransaction(workspaceId, transaction.id);
    if (existing) {
      return {
        transaction,
        classification: existing,
        inboxItems: await this.openItemsForTransaction(workspaceId, transaction.id),
        recurringCandidate: null,
      };
    }

    const [categories, rules, merchant] = await Promise.all([
      this.ledger.listCategories(workspaceId),
      this.repository.listRules(workspaceId),
      transaction.merchantId ? this.ledger.findMerchant(workspaceId, transaction.merchantId) : null,
    ]);
    const classification = classifyMerchant({
      kind: transaction.kind,
      merchantName: merchant?.name ?? null,
      existingCategoryId: transaction.categoryId,
      existingCategoryIsAuthoritative: transaction.source.provider === "manual",
      categories,
      userRules: rules,
      aiSuggestion: request.aiSuggestion,
    });
    const record = await this.repository.createClassification({
      id: randomUUID(),
      workspaceId,
      transactionId: transaction.id,
      merchantName: merchant?.name ?? null,
      normalizedMerchant: classification.normalizedMerchant,
      suggestedCategoryId: classification.categoryId,
      appliedCategoryId: classification.requiresReview ? null : classification.categoryId,
      source: classification.source,
      confidence: classification.confidence,
      status: classification.requiresReview ? "NEEDS_REVIEW" : "APPLIED",
      explanation: classification.explanation,
      resolvedByUserId: null,
      resolvedAt: classification.requiresReview ? null : new Date(),
    });
    await this.audit(workspaceId, {
      classificationId: record.id,
      actorUserId: actor.userId,
      event: classification.requiresReview ? "CLASSIFICATION_REVIEW_CREATED" : "CLASSIFICATION_AUTO_APPLIED",
      metadata: {
        source: record.source,
        confidence: record.confidence,
        suggestedCategoryId: record.suggestedCategoryId,
        explanation: record.explanation,
      },
    });

    const inboxItems: FinancialInboxItemRecord[] = [];
    if (classification.requiresReview) {
      inboxItems.push(
        await this.createInboxItemIfMissing({
          workspaceId,
          transactionId: transaction.id,
          classificationId: record.id,
          recurringPaymentId: null,
          reason: classification.merchantAmbiguous ? "MERCHANT_AMBIGUITY" : classification.categoryId ? "CLASSIFICATION_REVIEW" : "UNKNOWN_CATEGORY",
          actions: classification.normalizedMerchant
            ? ["CLASSIFY_TRANSACTION", "CREATE_RULE", "DISMISS"]
            : ["CLASSIFY_TRANSACTION", "DISMISS"],
          details: {
            classificationSource: record.source,
            confidence: record.confidence,
            explanation: record.explanation,
          },
        }),
      );
    }

    if (isPossibleTransfer(transaction, merchant?.name ?? null)) {
      inboxItems.push(
        await this.createInboxItemIfMissing({
          workspaceId,
          transactionId: transaction.id,
          classificationId: record.id,
          recurringPaymentId: null,
          reason: "POSSIBLE_TRANSFER",
          actions: ["REVIEW_TRANSFER", "DISMISS"],
          details: { code: "transfer_like_merchant" },
        }),
      );
    }

    const recurringCandidate = await this.detectAndPersistRecurringCandidate(actor, workspaceId, transaction);
    if (recurringCandidate) {
      inboxItems.push(
        await this.createInboxItemIfMissing({
          workspaceId,
          transactionId: transaction.id,
          classificationId: record.id,
          recurringPaymentId: recurringCandidate.id,
          reason: "POSSIBLE_RECURRING",
          actions: ["CONFIRM_RECURRING", "IGNORE_RECURRING"],
          details: {
            cadenceDays: recurringCandidate.cadenceDays,
            typicalAmountMinor: recurringCandidate.typicalAmountMinor.toString(),
            sampleCount: recurringCandidate.sampleTransactionIds.length,
          },
        }),
      );
    }

    return { transaction, classification: record, inboxItems, recurringCandidate };
  }

  async listInbox(actor: AuthenticatedActor, workspaceId: string): Promise<FinancialInboxView[]> {
    await this.requirePermission(actor.userId, workspaceId, "read");
    const items = await this.repository.listInboxItems(workspaceId);
    return Promise.all(items.map((item) => this.toInboxView(workspaceId, item)));
  }

  async listInboxPreview(
    actor: AuthenticatedActor,
    workspaceId: string,
    limit: number,
  ): Promise<FinancialInboxPreviewView> {
    await this.requirePermission(actor.userId, workspaceId, "read");
    const previewLimit = Math.min(Math.max(Math.floor(limit), 1), 12);
    const [items, unresolvedCount] = await Promise.all([
      this.repository.listInboxItems(workspaceId, "OPEN", previewLimit),
      this.repository.countInboxItems(workspaceId, "OPEN"),
    ]);

    return {
      unresolvedCount,
      items: await Promise.all(items.map((item) => this.toInboxView(workspaceId, item))),
    };
  }

  async listRecurring(actor: AuthenticatedActor, workspaceId: string): Promise<RecurringPaymentView[]> {
    await this.requirePermission(actor.userId, workspaceId, "read");
    const payments = await this.repository.listRecurringPayments(workspaceId);
    return payments.map((payment) => this.presentRecurring(payment));
  }

  async resolveInboxItem(
    actor: AuthenticatedActor,
    workspaceId: string,
    inboxItemId: string,
    input: ResolveInboxInput,
  ): Promise<FinancialInboxItemRecord> {
    await this.requirePermission(actor.userId, workspaceId, "manage_ledger");
    const item = await this.repository.findInboxItem(workspaceId, inboxItemId);
    if (!item) throw new NotFoundError("Financial Inbox item not found in this workspace.");
    if (item.status !== "OPEN") throw new ConflictError("This financial Inbox item has already been resolved.");
    if (!item.actions.includes(input.action)) throw new AuthorizationError("This action is not available for the Inbox item.");

    if (input.action === "CLASSIFY_TRANSACTION" || input.action === "CREATE_RULE") {
      await this.applyUserClassification(actor, workspaceId, item, input);
    } else if (input.action === "CONFIRM_RECURRING" || input.action === "IGNORE_RECURRING") {
      await this.resolveRecurring(actor, workspaceId, item, input.action);
    } else if (input.action === "DISMISS" && item.classificationId) {
      await this.repository.updateClassification(workspaceId, item.classificationId, {
        status: "DISMISSED",
        resolvedByUserId: actor.userId,
        resolvedAt: new Date(),
      });
    }

    const status = input.action === "DISMISS" ? "DISMISSED" : "RESOLVED";
    const resolved = await this.repository.updateInboxItem(workspaceId, item.id, {
      status,
      resolvedByUserId: actor.userId,
      resolvedAt: new Date(),
    });
    if (!resolved) throw new ConflictError("Financial Inbox item changed before it could be resolved.");
    await this.audit(workspaceId, {
      inboxItemId: item.id,
      classificationId: item.classificationId,
      recurringPaymentId: item.recurringPaymentId,
      actorUserId: actor.userId,
      event: `INBOX_${input.action}`,
      metadata: { status },
    });
    return resolved;
  }

  private async applyUserClassification(
    actor: AuthenticatedActor,
    workspaceId: string,
    item: FinancialInboxItemRecord,
    input: ResolveInboxInput,
  ): Promise<void> {
    if (!input.categoryId) throw new ConflictError("A category is required to resolve this classification.");
    if (!item.classificationId) throw new ConflictError("This Inbox item has no transaction classification.");
    const [classification, transaction] = await Promise.all([
      this.repository.findClassification(workspaceId, item.classificationId),
      this.ledger.findTransaction(workspaceId, item.transactionId),
    ]);
    if (!classification || !transaction || !isClassifiableTransaction(transaction.kind)) {
      throw new NotFoundError("The transaction classification is no longer available.");
    }
    const category = await this.requireCategory(workspaceId, input.categoryId, transaction.kind);
    const now = new Date();
    await this.repository.updateClassification(workspaceId, classification.id, {
      suggestedCategoryId: category.id,
      appliedCategoryId: category.id,
      source: "USER_CORRECTION",
      confidence: 1,
      status: "APPLIED",
      explanation: { code: "user_correction", priorSource: classification.source },
      resolvedByUserId: actor.userId,
      resolvedAt: now,
    });
    await this.audit(workspaceId, {
      inboxItemId: item.id,
      classificationId: classification.id,
      actorUserId: actor.userId,
      event: "CLASSIFICATION_CORRECTED",
      metadata: { categoryId: category.id, previousSource: classification.source },
    });

    if (input.action !== "CREATE_RULE") return;
    if (!classification.normalizedMerchant) {
      throw new ConflictError("A merchant is required before a reusable rule can be created.");
    }
    const existing = await this.repository.findRule(
      workspaceId,
      classification.normalizedMerchant,
      transaction.kind,
    );
    const rule = existing
      ? await this.repository.updateRule(workspaceId, existing.id, {
          categoryId: category.id,
          updatedByUserId: actor.userId,
        })
      : await this.repository.createRule({
          id: randomUUID(),
          workspaceId,
          normalizedMerchant: classification.normalizedMerchant,
          categoryId: category.id,
          kind: transaction.kind,
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
        });
    if (!rule) throw new ConflictError("The classification rule changed before it could be saved.");
    await this.audit(workspaceId, {
      inboxItemId: item.id,
      classificationId: classification.id,
      actorUserId: actor.userId,
      event: existing ? "CLASSIFICATION_RULE_UPDATED" : "CLASSIFICATION_RULE_CREATED",
      metadata: { categoryId: category.id, normalizedMerchant: classification.normalizedMerchant, ruleId: rule.id },
    });
  }

  private async resolveRecurring(
    actor: AuthenticatedActor,
    workspaceId: string,
    item: FinancialInboxItemRecord,
    action: Extract<InboxAction, "CONFIRM_RECURRING" | "IGNORE_RECURRING">,
  ): Promise<void> {
    if (!item.recurringPaymentId) throw new ConflictError("This Inbox item has no recurring-payment candidate.");
    const payment = await this.repository.findRecurringPaymentById(workspaceId, item.recurringPaymentId);
    if (!payment) throw new NotFoundError("Recurring-payment candidate not found in this workspace.");
    if (payment.status !== "CANDIDATE") {
      throw new ConflictError("This recurring-payment candidate has already been resolved.");
    }
    const now = new Date();
    const confirmed = action === "CONFIRM_RECURRING";
    await this.repository.updateRecurringPayment(workspaceId, payment.id, {
      status: confirmed ? "CONFIRMED" : "IGNORED",
      confirmedByUserId: confirmed ? actor.userId : null,
      confirmedAt: confirmed ? now : null,
      ignoredByUserId: confirmed ? null : actor.userId,
      ignoredAt: confirmed ? null : now,
    });
    await this.audit(workspaceId, {
      inboxItemId: item.id,
      recurringPaymentId: payment.id,
      actorUserId: actor.userId,
      event: confirmed ? "RECURRING_CONFIRMED" : "RECURRING_IGNORED",
      metadata: { cadenceDays: payment.cadenceDays, detectionKey: payment.detectionKey },
    });
  }

  private async detectAndPersistRecurringCandidate(
    actor: AuthenticatedActor,
    workspaceId: string,
    newTransaction: LedgerTransactionRecord,
  ): Promise<RecurringPaymentRecord | null> {
    const transactions = currentFinancialTransactions(
      await this.ledger.listTransactions(workspaceId, { statuses: ["POSTED"] }),
    );
    const merchantPairs = await Promise.all(
      transactions.map(async (transaction) => ({
        transaction,
        merchant: transaction.merchantId
          ? await this.ledger.findMerchant(workspaceId, transaction.merchantId)
          : null,
      })),
    );
    const candidates = detectRecurringCandidates(
      merchantPairs.map(({ transaction, merchant }) => ({
        transaction,
        normalizedMerchant: merchant ? normalizeMerchantForDetection(merchant.name) : "",
      })),
    );
    const candidate = candidates.find((entry) => entry.sampleTransactionIds.includes(newTransaction.id));
    if (!candidate) return null;

    const existing = await this.repository.findRecurringPayment(workspaceId, candidate.detectionKey);
    if (existing) {
      await this.repository.updateRecurringPayment(workspaceId, existing.id, {
        lastOccurredAt: candidate.lastOccurredAt,
        sampleTransactionIds: candidate.sampleTransactionIds,
      });
      return null;
    }

    const created = await this.repository.createRecurringPayment({
      id: randomUUID(),
      workspaceId,
      ...candidate,
      status: "CANDIDATE",
      confirmedByUserId: null,
      confirmedAt: null,
      ignoredByUserId: null,
      ignoredAt: null,
    });
    await this.audit(workspaceId, {
      recurringPaymentId: created.id,
      actorUserId: actor.userId,
      event: "RECURRING_CANDIDATE_DETECTED",
      metadata: {
        cadenceDays: created.cadenceDays,
        amountToleranceBps: created.amountToleranceBps,
        sampleTransactionIds: created.sampleTransactionIds,
      },
    });
    return created;
  }

  private async createInboxItemIfMissing(input: {
    workspaceId: string;
    transactionId: string;
    classificationId: string | null;
    recurringPaymentId: string | null;
    reason: InboxReason;
    actions: InboxAction[];
    details: Record<string, unknown>;
  }): Promise<FinancialInboxItemRecord> {
    const existing = await this.repository.findOpenInboxItem(
      input.workspaceId,
      input.transactionId,
      input.reason,
    );
    if (existing) return existing;
    const item = await this.repository.createInboxItem({
      id: randomUUID(),
      ...input,
      status: "OPEN",
      resolvedByUserId: null,
      resolvedAt: null,
    });
    await this.audit(input.workspaceId, {
      inboxItemId: item.id,
      classificationId: item.classificationId,
      recurringPaymentId: item.recurringPaymentId,
      actorUserId: null,
      event: "INBOX_ITEM_CREATED",
      metadata: { reason: item.reason, actions: item.actions },
    });
    return item;
  }

  private async openItemsForTransaction(
    workspaceId: string,
    transactionId: string,
  ): Promise<FinancialInboxItemRecord[]> {
    const items = await this.repository.listInboxItems(workspaceId, "OPEN");
    return items.filter((item) => item.transactionId === transactionId);
  }

  private async toInboxView(
    workspaceId: string,
    item: FinancialInboxItemRecord,
  ): Promise<FinancialInboxView> {
    const [transaction, classification, recurring] = await Promise.all([
      this.ledger.findTransaction(workspaceId, item.transactionId),
      item.classificationId ? this.repository.findClassification(workspaceId, item.classificationId) : null,
      item.recurringPaymentId
        ? this.repository.findRecurringPaymentById(workspaceId, item.recurringPaymentId)
        : null,
    ]);
    if (!transaction) throw new NotFoundError("Inbox transaction not found in this workspace.");
    const merchant = transaction.merchantId
      ? await this.ledger.findMerchant(workspaceId, transaction.merchantId)
      : null;
    return {
      id: item.id,
      reason: item.reason,
      actions: item.actions,
      status: item.status,
      details: item.details,
      createdAt: item.createdAt.toISOString(),
      transaction: {
        id: transaction.id,
        kind: transaction.kind,
        amountMinor: transaction.amountMinor.toString(),
        currency: transaction.currency,
        occurredAt: transaction.occurredAt.toISOString(),
        note: transaction.note,
        merchantName: merchant?.name ?? classification?.merchantName ?? null,
      },
      classification: classification
        ? {
            id: classification.id,
            source: classification.source,
            confidence: classification.confidence,
            status: classification.status,
            normalizedMerchant: classification.normalizedMerchant,
            suggestedCategoryId: classification.suggestedCategoryId,
            appliedCategoryId: classification.appliedCategoryId,
            explanation: classification.explanation,
          }
        : null,
      recurring: recurring
        ? {
            id: recurring.id,
            status: recurring.status,
            cadenceDays: recurring.cadenceDays,
            typicalAmountMinor: recurring.typicalAmountMinor.toString(),
            currency: recurring.currency,
          }
        : null,
    };
  }

  private presentRecurring(payment: RecurringPaymentRecord): RecurringPaymentView {
    return {
      id: payment.id,
      normalizedMerchant: payment.normalizedMerchant,
      status: payment.status,
      cadenceDays: payment.cadenceDays,
      typicalAmountMinor: payment.typicalAmountMinor.toString(),
      currency: payment.currency,
      firstOccurredAt: payment.firstOccurredAt.toISOString(),
      lastOccurredAt: payment.lastOccurredAt.toISOString(),
      sampleTransactionIds: payment.sampleTransactionIds,
    };
  }

  private async requireCategory(
    workspaceId: string,
    categoryId: string,
    kind: LedgerCategoryRecord["kind"],
  ): Promise<LedgerCategoryRecord> {
    const category = await this.ledger.findCategory(workspaceId, categoryId);
    if (!category || category.kind !== kind) {
      throw new NotFoundError("Category not found for this transaction type in this workspace.");
    }
    return category;
  }

  private async requirePermission(
    userId: string,
    workspaceId: string,
    action: "read" | "manage_ledger",
  ): Promise<void> {
    const context = await this.workspaces.findMemberContext(workspaceId, userId);
    if (!context) throw new AuthorizationError("You are not a member of this workspace.");
    assertWorkspacePermission(context.membership.role, action);
  }

  private async audit(
    workspaceId: string,
    input: Omit<Parameters<FinancialInboxRepository["createAudit"]>[0], "id" | "workspaceId">,
  ): Promise<void> {
    await this.repository.createAudit({ id: randomUUID(), workspaceId, ...input });
  }
}

function normalizeMerchantForDetection(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

function isPossibleTransfer(transaction: LedgerTransactionRecord, merchantName: string | null): boolean {
  if (transaction.kind !== "EXPENSE") return false;
  const source = `${merchantName ?? ""} ${transaction.note ?? ""}`.toLocaleLowerCase("en-US");
  // A generic word such as “transfer station” is deliberately insufficient.
  // We only flag specific wallet/bank transfer rail descriptions.
  return /\b(?:mtn momo|orange money|mobile money|wallet transfer|bank transfer|cash out)\b/.test(source);
}
