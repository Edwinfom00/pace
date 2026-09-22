import { createHash, randomUUID } from "node:crypto";

import { AuthorizationError, ConflictError, DomainConflictError, NotFoundError } from "@/authorization/errors";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { WorkspaceRole } from "@/authorization/workspace-permissions";
import type { AuthenticatedActor } from "@/authorization/session";
import { toCurrencyCode } from "@/money/currency";
import type { LedgerCategoryRecord, LedgerTransactionRecord } from "@/modules/ledger/domain";
import { currentFinancialTransactions } from "@/modules/ledger/correction-chain";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";
import { getRecurringCapabilities } from "@/modules/recurring/domain/recurring-action-policy";

import { classifyMerchant, type AiClassificationSuggestion } from "./classification";
import {
  type ClassifiedTransaction,
  type FinancialInboxItemRecord,
  type InboxAction,
  type InboxReason,
  isClassifiableTransaction,
  type RecurringPaymentDirection,
  type RecurringPaymentRecord,
  type ResolveInboxInput,
  type TransactionClassificationRecord,
} from "./domain";
import {
  detectRecurringCandidates,
  RECURRING_AMOUNT_TOLERANCE_BPS,
  type RecurringCandidate,
  withinAmountTolerance,
} from "./recurring-detection";
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
  normalizedMerchant: string | null;
  displayName: string | null;
  origin: "DETECTED" | "MANUAL";
  direction: "EXPENSE" | "INCOME";
  accountId: string | null;
  categoryId: string | null;
  status: RecurringPaymentRecord["status"];
  cadenceDays: number;
  typicalAmountMinor: string;
  currency: string;
  firstOccurredAt: string;
  lastOccurredAt: string;
  nextOccurrenceAt: string | null;
  sampleTransactionIds: string[];
  /** Canonical optimistic-concurrency token for later server mutations. */
  updatedAt: string;
}

export const MAX_MANUAL_RECURRING_NAME_LENGTH = 160;
export const MAX_MANUAL_RECURRING_IDEMPOTENCY_KEY_LENGTH = 180;
const MAX_POSTGRES_BIGINT_MINOR = 9_223_372_036_854_775_807n;

/**
 * The canonical server/domain command for an intentional recurring pattern.
 * It only creates the pattern; it never creates a ledger transaction.
 */
export interface CreateManualRecurringCommand {
  readonly workspaceId: string;
  readonly direction: RecurringPaymentDirection;
  readonly name: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly cadenceDays: number;
  readonly nextOccurrenceAt: Date;
  readonly accountId?: string | null;
  readonly categoryId?: string | null;
  readonly merchantOrSource?: string | null;
  readonly idempotencyKey: string;
}

export interface ConfirmRecurringCommand {
  readonly workspaceId: string;
  readonly recurringId: string;
  readonly expectedUpdatedAt?: Date;
  readonly idempotencyKey: string;
}

export interface IgnoreRecurringCommand extends ConfirmRecurringCommand {
  readonly reason?: string;
}

export type RestoreRecurringCommand = ConfirmRecurringCommand;


export class FinancialInboxService {
  constructor(
    private readonly repository: FinancialInboxRepository,
    private readonly ledger: Pick<
      LedgerRepository,
      "findAccount" | "findCategory" | "findMerchant" | "findTransaction" | "listCategories" | "listTransactions"
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

  /**
   * Creates an intentional M4 recurring pattern. This method does not call a
   * ledger write path: balances, reporting, and transactions stay untouched.
   */
  async createManualRecurring(
    actor: AuthenticatedActor,
    command: CreateManualRecurringCommand,
  ): Promise<RecurringPaymentView> {
    await this.requirePermission(actor.userId, command.workspaceId, "manage_ledger");
    const prepared = prepareManualRecurringCommand(command);
    const commandFingerprint = fingerprintManualRecurringCommand(prepared);

    const previous = await this.repository.findRecurringPaymentByIdempotencyKey(
      command.workspaceId,
      actor.userId,
      prepared.idempotencyKey,
    );
    if (previous) return this.resolveExistingManualCommand(previous, commandFingerprint);

    const [account, category] = await Promise.all([
      prepared.accountId ? this.ledger.findAccount(command.workspaceId, prepared.accountId) : null,
      prepared.categoryId
        ? this.ledger.findCategory(command.workspaceId, prepared.categoryId)
        : null,
    ]);
    if (prepared.accountId && !account) {
      throw new DomainConflictError("ACCOUNT_NOT_FOUND", "The selected account was not found in this workspace.");
    }
    if (account?.archivedAt) {
      throw new DomainConflictError("ACCOUNT_UNAVAILABLE", "The selected account is archived and cannot be used.");
    }
    if (account && account.currency !== prepared.currency) {
      throw new DomainConflictError(
        "CURRENCY_MISMATCH",
        "The recurring currency must match the selected account currency.",
      );
    }
    if (prepared.categoryId && !category) {
      throw new DomainConflictError("CATEGORY_NOT_FOUND", "The selected category was not found in this workspace.");
    }
    if (category && category.kind !== prepared.direction) {
      throw new DomainConflictError(
        "INVALID_RECURRING_CATEGORY",
        "The category does not match the recurring direction.",
      );
    }

    const now = new Date();
    const id = randomUUID();
    const input = {
      id,
      workspaceId: command.workspaceId,
      // Manual patterns use a private key. Detection matching intentionally
      // evaluates the richer evidence below instead of relying on key equality.
      detectionKey: `manual:${id}`,
      normalizedMerchant: prepared.normalizedMerchant,
      displayName: prepared.name,
      origin: "MANUAL" as const,
      direction: prepared.direction,
      accountId: prepared.accountId,
      categoryId: prepared.categoryId,
      currency: prepared.currency,
      typicalAmountMinor: prepared.amountMinor,
      amountToleranceBps: RECURRING_AMOUNT_TOLERANCE_BPS,
      cadenceDays: prepared.cadenceDays,
      // M4's required historical anchors are retained for compatibility. The
      // separate nextOccurrenceAt field is authoritative for this manual plan.
      firstOccurredAt: prepared.nextOccurrenceAt,
      lastOccurredAt: prepared.nextOccurrenceAt,
      nextOccurrenceAt: prepared.nextOccurrenceAt,
      sampleTransactionIds: [],
      status: "CONFIRMED" as const,
      createdByUserId: actor.userId,
      idempotencyKey: prepared.idempotencyKey,
      commandFingerprint,
      confirmedByUserId: actor.userId,
      confirmedAt: now,
      ignoredByUserId: null,
      ignoredAt: null,
    };

    let created: RecurringPaymentRecord;
    try {
      created = await this.repository.createRecurringPayment(input);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const concurrent = await this.repository.findRecurringPaymentByIdempotencyKey(
        command.workspaceId,
        actor.userId,
        prepared.idempotencyKey,
      );
      if (!concurrent) {
        throw new DomainConflictError(
          "CONCURRENT_MODIFICATION",
          "The recurring pattern could not be created because another write changed concurrently.",
        );
      }
      return this.resolveExistingManualCommand(concurrent, commandFingerprint);
    }

    await this.audit(command.workspaceId, {
      recurringPaymentId: created.id,
      actorUserId: actor.userId,
      event: "RECURRING_MANUAL_CREATED",
      metadata: {
        origin: created.origin,
        direction: created.direction,
        amountMinor: created.typicalAmountMinor.toString(),
        currency: created.currency,
        cadenceDays: created.cadenceDays,
        nextOccurrenceAt: created.nextOccurrenceAt?.toISOString() ?? null,
        accountId: created.accountId,
        categoryId: created.categoryId,
      },
    });
    return this.presentRecurring(created);
  }

  /**
   * Canonical detected-recurring review action. It changes only M4 review
   * state and audit metadata; it never calls any ledger mutation path.
   */
  async confirmRecurring(
    actor: AuthenticatedActor,
    command: ConfirmRecurringCommand,
  ): Promise<RecurringPaymentView> {
    return this.reviewRecurring(actor, command, "CONFIRM");
  }

  /**
   * Canonical detected-recurring review action. Ignore is a retained review
   * state, never a deletion of matching evidence or transactions.
   */
  async ignoreRecurring(
    actor: AuthenticatedActor,
    command: IgnoreRecurringCommand,
  ): Promise<RecurringPaymentView> {
    return this.reviewRecurring(actor, command, "IGNORE");
  }

  /**
   * Canonical detected-recurring review action. Restore returns an ignored
   * detection to review; it never changes matching transactions or balances.
   */
  async restoreRecurring(
    actor: AuthenticatedActor,
    command: RestoreRecurringCommand,
  ): Promise<RecurringPaymentView> {
    return this.reviewRecurring(actor, command, "RESTORE");
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
    const command = {
      workspaceId,
      recurringId: item.recurringPaymentId,
      // The Inbox item is a legacy presentation of the same review action.
      // Its deterministic key gives retries exactly the same semantics as the
      // direct M9.5 commands without accepting new mutable input.
      idempotencyKey: `inbox:${item.id}:${action}`,
    };
    await this.reviewRecurring(
      actor,
      action === "CONFIRM_RECURRING" ? command : { ...command, reason: undefined },
      action === "CONFIRM_RECURRING" ? "CONFIRM" : "IGNORE",
      { inboxItemId: item.id },
    );
  }

  private async reviewRecurring(
    actor: AuthenticatedActor,
    command: ConfirmRecurringCommand | IgnoreRecurringCommand | RestoreRecurringCommand,
    action: "CONFIRM" | "IGNORE" | "RESTORE",
    auditContext?: { readonly inboxItemId: string },
  ): Promise<RecurringPaymentView> {
    const workspaceRole = await this.requireWorkspaceRole(actor.userId, command.workspaceId);
    const prepared = prepareRecurringReviewCommand(command, action);
    const commandFingerprint = fingerprintRecurringReviewCommand(prepared);
    const replay = await this.repository.findRecurringAuditByIdempotencyKey(
      command.workspaceId,
      actor.userId,
      prepared.idempotencyKey,
    );
    if (replay) {
      return this.resolveExistingRecurringReviewCommand(
        command.workspaceId,
        command.recurringId,
        action,
        commandFingerprint,
        replay,
      );
    }

    const payment = await this.repository.findRecurringPaymentById(command.workspaceId, command.recurringId);
    if (!payment) throw new NotFoundError("Recurring payment not found in this workspace.");

    const capabilities = getRecurringCapabilities({ recurring: payment, workspaceRole });
    const allowed = action === "CONFIRM"
      ? capabilities.canConfirm
      : action === "IGNORE"
        ? capabilities.canIgnore
        : capabilities.canRestore;
    if (!allowed) this.throwRecurringActionNotAllowed(action, capabilities, workspaceRole);

    const now = new Date();
    const before = recurringReviewAuditState(payment.status);
    const afterStatus = action === "CONFIRM"
      ? "CONFIRMED"
      : action === "IGNORE"
        ? "IGNORED"
        : "CANDIDATE";
    const updated = {
      status: afterStatus,
      confirmedByUserId: action === "CONFIRM" ? actor.userId : null,
      confirmedAt: action === "CONFIRM" ? now : null,
      ignoredByUserId: action === "IGNORE" ? actor.userId : null,
      ignoredAt: action === "IGNORE" ? now : null,
    } as const;

    try {
      const persisted = await this.repository.transitionRecurringPayment({
        workspaceId: command.workspaceId,
        recurringPaymentId: payment.id,
        expectedStatus: payment.status,
        expectedUpdatedAt: prepared.expectedUpdatedAt,
        ...updated,
        audit: {
          id: randomUUID(),
          workspaceId: command.workspaceId,
          recurringPaymentId: payment.id,
          ...(auditContext ? { inboxItemId: auditContext.inboxItemId } : {}),
          actorUserId: actor.userId,
          event: recurringReviewAuditEvent(action),
          commandFingerprint,
          idempotencyKey: prepared.idempotencyKey,
          metadata: {
            origin: payment.origin,
            detectionKey: payment.detectionKey,
            before,
            after: recurringReviewAuditState(afterStatus),
            ...(action === "IGNORE" && prepared.reason ? { reason: prepared.reason } : {}),
          },
        },
      });
      if (persisted) return this.presentRecurring(persisted);
    } catch (error) {
      const concurrentReplay = await this.repository.findRecurringAuditByIdempotencyKey(
        command.workspaceId,
        actor.userId,
        prepared.idempotencyKey,
      );
      if (concurrentReplay) {
        return this.resolveExistingRecurringReviewCommand(
          command.workspaceId,
          command.recurringId,
          action,
          commandFingerprint,
          concurrentReplay,
        );
      }
      if (isSerializationFailure(error)) {
        throw new DomainConflictError(
          "CONCURRENT_MODIFICATION",
          "This recurring pattern changed while the review action was being saved. Refresh and retry.",
        );
      }
      throw error;
    }

    const concurrentReplay = await this.repository.findRecurringAuditByIdempotencyKey(
      command.workspaceId,
      actor.userId,
      prepared.idempotencyKey,
    );
    if (concurrentReplay) {
      return this.resolveExistingRecurringReviewCommand(
        command.workspaceId,
        command.recurringId,
        action,
        commandFingerprint,
        concurrentReplay,
      );
    }
    throw new DomainConflictError(
      "CONCURRENT_MODIFICATION",
      "This recurring pattern changed while the review action was being saved. Refresh and retry.",
    );
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

    const matchingManual = (await this.repository.listRecurringPayments(workspaceId)).find((payment) =>
      isStrongManualRecurringMatch(payment, candidate),
    );
    if (matchingManual) {
      await this.repository.updateRecurringPayment(workspaceId, matchingManual.id, {
        lastOccurredAt: candidate.lastOccurredAt,
        sampleTransactionIds: uniqueTransactionIds([
          ...matchingManual.sampleTransactionIds,
          ...candidate.sampleTransactionIds,
        ]),
      });
      return null;
    }

    const created = await this.repository.createRecurringPayment({
      id: randomUUID(),
      workspaceId,
      ...candidate,
      displayName: null,
      origin: "DETECTED",
      direction: "EXPENSE",
      nextOccurrenceAt: null,
      status: "CANDIDATE",
      createdByUserId: actor.userId,
      idempotencyKey: null,
      commandFingerprint: null,
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
      displayName: payment.displayName,
      origin: payment.origin,
      direction: payment.direction,
      accountId: payment.accountId,
      categoryId: payment.categoryId,
      status: payment.status,
      cadenceDays: payment.cadenceDays,
      typicalAmountMinor: payment.typicalAmountMinor.toString(),
      currency: payment.currency,
      firstOccurredAt: payment.firstOccurredAt.toISOString(),
      lastOccurredAt: payment.lastOccurredAt.toISOString(),
      nextOccurrenceAt: payment.nextOccurrenceAt?.toISOString() ?? null,
      sampleTransactionIds: payment.sampleTransactionIds,
      updatedAt: payment.updatedAt.toISOString(),
    };
  }

  private async resolveExistingRecurringReviewCommand(
    workspaceId: string,
    recurringId: string,
    action: "CONFIRM" | "IGNORE" | "RESTORE",
    commandFingerprint: string,
    audit: import("./domain").FinancialInboxAuditRecord,
  ): Promise<RecurringPaymentView> {
    const expectedEvent = recurringReviewAuditEvent(action);
    if (
      audit.recurringPaymentId !== recurringId
      || audit.event !== expectedEvent
      || audit.commandFingerprint !== commandFingerprint
    ) {
      throw new DomainConflictError(
        "RECURRING_ACTION_ALREADY_PROCESSED",
        "This idempotency key has already been used for another recurring review action.",
      );
    }
    const payment = await this.repository.findRecurringPaymentById(workspaceId, recurringId);
    if (!payment) throw new NotFoundError("Recurring payment not found in this workspace.");
    return this.presentRecurring(payment);
  }

  private throwRecurringActionNotAllowed(
    action: "CONFIRM" | "IGNORE" | "RESTORE",
    capabilities: ReturnType<typeof getRecurringCapabilities>,
    workspaceRole: WorkspaceRole,
  ): never {
    const reason = action === "CONFIRM"
      ? capabilities.reasons.confirm
      : action === "IGNORE"
        ? capabilities.reasons.ignore
        : capabilities.reasons.restore;
    if (reason === "READ_ONLY_ROLE") {
      throw new AuthorizationError("You do not have permission to review recurring patterns in this workspace.");
    }
    if (action === "CONFIRM" && reason === "ALREADY_CONFIRMED") {
      throw new DomainConflictError("RECURRING_ALREADY_CONFIRMED", "This recurring pattern is already confirmed.");
    }
    if (action === "IGNORE" && reason === "ALREADY_IGNORED") {
      throw new DomainConflictError("RECURRING_ALREADY_IGNORED", "This recurring pattern is already ignored.");
    }
    if (action === "RESTORE" && reason === "NOT_RESTORABLE") {
      throw new DomainConflictError(
        "RECURRING_NOT_RESTORABLE",
        "This recurring pattern can no longer be restored to review.",
      );
    }
    if (workspaceRole === "VIEWER") {
      throw new AuthorizationError("You do not have permission to review recurring patterns in this workspace.");
    }
    throw new DomainConflictError(
      "RECURRING_ACTION_NOT_ALLOWED",
      "This recurring review action is not allowed in its current canonical state.",
    );
  }

  private resolveExistingManualCommand(
    existing: RecurringPaymentRecord,
    commandFingerprint: string,
  ): RecurringPaymentView {
    if (
      existing.origin !== "MANUAL" ||
      !existing.commandFingerprint ||
      existing.commandFingerprint !== commandFingerprint
    ) {
      throw new DomainConflictError(
        "RECURRING_ALREADY_PROCESSED",
        "This idempotency key was already used for a different recurring pattern.",
      );
    }
    return this.presentRecurring(existing);
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
    const workspaceRole = await this.requireWorkspaceRole(userId, workspaceId);
    assertWorkspacePermission(workspaceRole, action);
  }

  private async requireWorkspaceRole(userId: string, workspaceId: string): Promise<WorkspaceRole> {
    const context = await this.workspaces.findMemberContext(workspaceId, userId);
    if (!context) throw new AuthorizationError("You are not a member of this workspace.");
    return context.membership.role;
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

type PreparedManualRecurringCommand = {
  readonly name: string;
  readonly direction: RecurringPaymentDirection;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly cadenceDays: number;
  readonly nextOccurrenceAt: Date;
  readonly accountId: string | null;
  readonly categoryId: string | null;
  readonly normalizedMerchant: string | null;
  readonly idempotencyKey: string;
};

type PreparedRecurringReviewCommand = {
  readonly action: "CONFIRM" | "IGNORE" | "RESTORE";
  readonly recurringId: string;
  readonly expectedUpdatedAt: Date | undefined;
  readonly idempotencyKey: string;
  readonly reason: string | undefined;
};

function prepareManualRecurringCommand(
  command: CreateManualRecurringCommand,
): PreparedManualRecurringCommand {
  if (typeof command.name !== "string") {
    throw new DomainConflictError("INVALID_RECURRING_NAME", "A recurring name is required.");
  }
  const name = command.name.normalize("NFKC").trim().replaceAll(/\s+/g, " ");
  if (!name || name.length > MAX_MANUAL_RECURRING_NAME_LENGTH) {
    throw new DomainConflictError(
      "INVALID_RECURRING_NAME",
      `A recurring name must contain 1 to ${MAX_MANUAL_RECURRING_NAME_LENGTH} characters.`,
    );
  }
  if (command.direction !== "EXPENSE" && command.direction !== "INCOME") {
    throw new DomainConflictError(
      "INVALID_RECURRING_DIRECTION",
      "A manual recurring pattern must be an expense or income.",
    );
  }
  if (
    typeof command.amountMinor !== "bigint" ||
    command.amountMinor <= 0n ||
    command.amountMinor > MAX_POSTGRES_BIGINT_MINOR
  ) {
    throw new DomainConflictError(
      "INVALID_RECURRING_AMOUNT",
      "A recurring amount must be a positive bigint minor-unit value.",
    );
  }
  if (
    !Number.isInteger(command.cadenceDays) ||
    command.cadenceDays < 7 ||
    command.cadenceDays > 400
  ) {
    throw new DomainConflictError(
      "INVALID_RECURRING_FREQUENCY",
      "The recurring cadence must use the canonical 7 to 400 day interval.",
    );
  }
  if (!(command.nextOccurrenceAt instanceof Date) || Number.isNaN(command.nextOccurrenceAt.getTime())) {
    throw new DomainConflictError(
      "INVALID_NEXT_OCCURRENCE",
      "A valid next occurrence date is required.",
    );
  }
  if (typeof command.idempotencyKey !== "string") {
    throw new DomainConflictError("RECURRING_CREATE_NOT_ALLOWED", "An idempotency key is required.");
  }
  const idempotencyKey = command.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > MAX_MANUAL_RECURRING_IDEMPOTENCY_KEY_LENGTH) {
    throw new DomainConflictError(
      "RECURRING_CREATE_NOT_ALLOWED",
      `An idempotency key must contain 1 to ${MAX_MANUAL_RECURRING_IDEMPOTENCY_KEY_LENGTH} characters.`,
    );
  }

  let currency: string;
  try {
    currency = toCurrencyCode(command.currency);
  } catch {
    throw new DomainConflictError("INVALID_RECURRING_CURRENCY", "Use a supported ISO currency code.");
  }

  const merchantOrSource = normalizeOptionalMerchantOrSource(command.merchantOrSource);
  return {
    name,
    direction: command.direction,
    amountMinor: command.amountMinor,
    currency,
    cadenceDays: command.cadenceDays,
    nextOccurrenceAt: new Date(command.nextOccurrenceAt),
    accountId: optionalIdentifier(command.accountId, "ACCOUNT_NOT_FOUND"),
    categoryId: optionalIdentifier(command.categoryId, "CATEGORY_NOT_FOUND"),
    normalizedMerchant: merchantOrSource,
    idempotencyKey,
  };
}

function normalizeOptionalMerchantOrSource(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new DomainConflictError("INVALID_RECURRING_SOURCE", "The recurring source must be text.");
  }
  const trimmed = value.normalize("NFKC").trim().replaceAll(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > MAX_MANUAL_RECURRING_NAME_LENGTH) {
    throw new DomainConflictError(
      "INVALID_RECURRING_SOURCE",
      `The recurring source must contain at most ${MAX_MANUAL_RECURRING_NAME_LENGTH} characters.`,
    );
  }
  const normalized = normalizeMerchantForDetection(trimmed);
  if (!normalized) {
    throw new DomainConflictError("INVALID_RECURRING_SOURCE", "The recurring source must contain letters or numbers.");
  }
  return normalized;
}

function prepareRecurringReviewCommand(
  command: ConfirmRecurringCommand | IgnoreRecurringCommand | RestoreRecurringCommand,
  action: "CONFIRM" | "IGNORE" | "RESTORE",
): PreparedRecurringReviewCommand {
  if (typeof command.recurringId !== "string" || !command.recurringId.trim()) {
    throw new DomainConflictError("RECURRING_ACTION_NOT_ALLOWED", "A recurring payment identifier is required.");
  }
  if (typeof command.idempotencyKey !== "string") {
    throw new DomainConflictError("RECURRING_ACTION_NOT_ALLOWED", "An idempotency key is required.");
  }
  const idempotencyKey = command.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > MAX_MANUAL_RECURRING_IDEMPOTENCY_KEY_LENGTH) {
    throw new DomainConflictError(
      "RECURRING_ACTION_NOT_ALLOWED",
      `An idempotency key must contain 1 to ${MAX_MANUAL_RECURRING_IDEMPOTENCY_KEY_LENGTH} characters.`,
    );
  }
  if (
    command.expectedUpdatedAt !== undefined
    && (!(command.expectedUpdatedAt instanceof Date) || Number.isNaN(command.expectedUpdatedAt.getTime()))
  ) {
    throw new DomainConflictError("RECURRING_ACTION_NOT_ALLOWED", "Expected version must be a valid timestamp.");
  }

  const rawReason = action === "IGNORE" ? (command as IgnoreRecurringCommand).reason : undefined;
  if (rawReason !== undefined && typeof rawReason !== "string") {
    throw new DomainConflictError("RECURRING_ACTION_NOT_ALLOWED", "Ignore reason must be text.");
  }
  const reason = rawReason?.normalize("NFKC").trim().replaceAll(/\s+/g, " ") || undefined;
  if (reason && reason.length > 500) {
    throw new DomainConflictError("RECURRING_ACTION_NOT_ALLOWED", "Ignore reason must contain at most 500 characters.");
  }

  return {
    action,
    recurringId: command.recurringId.trim(),
    expectedUpdatedAt: command.expectedUpdatedAt ? new Date(command.expectedUpdatedAt) : undefined,
    idempotencyKey,
    reason,
  };
}

function recurringReviewAuditEvent(action: PreparedRecurringReviewCommand["action"]): string {
  switch (action) {
    case "CONFIRM":
      return "RECURRING_CONFIRMED";
    case "IGNORE":
      return "RECURRING_IGNORED";
    case "RESTORE":
      return "RECURRING_RESTORED";
  }
}

function optionalIdentifier(
  value: string | null | undefined,
  code: "ACCOUNT_NOT_FOUND" | "CATEGORY_NOT_FOUND",
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new DomainConflictError(code, "A linked resource identifier must be non-empty text.");
  }
  return value.trim();
}

function fingerprintManualRecurringCommand(command: PreparedManualRecurringCommand): string {
  return createHash("sha256")
    .update(JSON.stringify({
      name: command.name,
      direction: command.direction,
      amountMinor: command.amountMinor.toString(),
      currency: command.currency,
      cadenceDays: command.cadenceDays,
      nextOccurrenceAt: command.nextOccurrenceAt.toISOString(),
      accountId: command.accountId,
      categoryId: command.categoryId,
      normalizedMerchant: command.normalizedMerchant,
    }))
    .digest("hex");
}

function fingerprintRecurringReviewCommand(command: PreparedRecurringReviewCommand): string {
  return createHash("sha256")
    .update(JSON.stringify({
      action: command.action,
      recurringId: command.recurringId,
      expectedUpdatedAt: command.expectedUpdatedAt?.toISOString() ?? null,
      reason: command.reason ?? null,
    }))
    .digest("hex");
}

function recurringReviewAuditState(status: RecurringPaymentRecord["status"]): {
  readonly status: RecurringPaymentRecord["status"];
  readonly reviewState: "NEEDS_REVIEW" | null;
} {
  return { status, reviewState: status === "CANDIDATE" ? "NEEDS_REVIEW" : null };
}

function isStrongManualRecurringMatch(
  payment: RecurringPaymentRecord,
  candidate: RecurringCandidate,
): boolean {
  if (
    payment.origin !== "MANUAL" ||
    payment.direction !== "EXPENSE" ||
    payment.status !== "CONFIRMED" ||
    !payment.normalizedMerchant ||
    payment.normalizedMerchant !== candidate.normalizedMerchant ||
    payment.currency !== candidate.currency ||
    payment.accountId !== candidate.accountId ||
    !withinAmountTolerance(candidate.typicalAmountMinor, payment.typicalAmountMinor, payment.amountToleranceBps)
  ) {
    return false;
  }
  if (
    payment.categoryId !== null &&
    candidate.categoryId !== null &&
    payment.categoryId !== candidate.categoryId
  ) {
    return false;
  }
  const tolerance = Math.max(3, Math.round(Math.max(payment.cadenceDays, candidate.cadenceDays) * 0.2));
  return Math.abs(payment.cadenceDays - candidate.cadenceDays) <= tolerance;
}

function uniqueTransactionIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

function isSerializationFailure(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "40001";
}

function isPossibleTransfer(transaction: LedgerTransactionRecord, merchantName: string | null): boolean {
  if (transaction.kind !== "EXPENSE") return false;
  const source = `${merchantName ?? ""} ${transaction.note ?? ""}`.toLocaleLowerCase("en-US");
  // A generic word such as “transfer station” is deliberately insufficient.
  // We only flag specific wallet/bank transfer rail descriptions.
  return /\b(?:mtn momo|orange money|mobile money|wallet transfer|bank transfer|cash out)\b/.test(source);
}
