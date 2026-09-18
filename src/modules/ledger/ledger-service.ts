import { createHash, randomUUID } from "node:crypto";

import {
  AuthorizationError,
  ConflictError,
  DomainConflictError,
  NotFoundError,
} from "@/authorization/errors";
import {
  assertWorkspacePermission,
  type WorkspaceAction,
} from "@/authorization/workspace-permissions";
import { toCurrencyCode } from "@/money/currency";
import type { AuthenticatedActor } from "@/authorization/session";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";
import { getTransactionCapabilities } from "@/modules/transactions/domain/transaction-action-policy";

import type {
  LedgerAccountRecord,
  LedgerCategoryKind,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerTransactionFilters,
  LedgerTransactionRecord,
} from "./domain";
import { normalizeMerchantName } from "./domain";
import type {
  CreateLedgerMerchantRecord,
  CreateLedgerTransactionRecord,
  CreateLedgerTransactionAuditRecord,
  CreateLedgerTransactionCorrectionRecord,
  LedgerRepository,
} from "./repositories/ledger-repository";
import type {
  CorrectTransactionCommand,
} from "./correct-transaction-contract";
import { resolveManualOccurredAt } from "./manual-transaction";
import {
  parseTransactionDetailsPatch,
  type TransactionDetailsPatch,
} from "./update-transaction-details-contract";
import {
  createLedgerAccountSchema,
  createLedgerCategorySchema,
  createLedgerMerchantSchema,
  createLedgerTransactionSchema,
  type CreateLedgerTransactionInput,
} from "./validation";


export class LedgerService {
  constructor(
    private readonly repository: LedgerRepository,
    private readonly workspaces: Pick<WorkspaceRepository, "findMembership">,
  ) { }

  async createAccount(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: unknown,
  ): Promise<LedgerAccountRecord> {
    const parsed = createLedgerAccountSchema.parse(input);
    await this.requireWorkspacePermission(actor.userId, workspaceId, "manage_ledger");

    return this.repository.createAccount({
      id: randomUUID(),
      workspaceId,
      name: parsed.name,
      type: parsed.type,
      currency: toCurrencyCode(parsed.currency),
      openingBalanceMinor: parsed.openingBalanceMinor,
      createdByUserId: actor.userId,
    });
  }

  async listAccounts(actor: AuthenticatedActor, workspaceId: string): Promise<LedgerAccountRecord[]> {
    await this.requireWorkspacePermission(actor.userId, workspaceId, "read");
    return this.repository.listAccounts(workspaceId);
  }

  async createCategory(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: unknown,
  ): Promise<LedgerCategoryRecord> {
    const parsed = createLedgerCategorySchema.parse(input);
    await this.requireWorkspacePermission(actor.userId, workspaceId, "manage_ledger");

    return this.repository.createCategory({
      id: randomUUID(),
      workspaceId,
      name: parsed.name,
      kind: parsed.kind,
      isSystem: false,
      systemKey: null,
      createdByUserId: actor.userId,
    });
  }

  async listCategories(actor: AuthenticatedActor, workspaceId: string): Promise<LedgerCategoryRecord[]> {
    await this.requireWorkspacePermission(actor.userId, workspaceId, "read");
    return this.repository.listCategories(workspaceId);
  }

  async createMerchant(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: unknown,
  ): Promise<LedgerMerchantRecord> {
    const parsed = createLedgerMerchantSchema.parse(input);
    await this.requireWorkspacePermission(actor.userId, workspaceId, "manage_ledger");

    const normalizedName = normalizeMerchantName(parsed.name);
    if (await this.repository.findMerchantByNormalizedName(workspaceId, normalizedName)) {
      throw new ConflictError("A merchant with that name already exists in this workspace.");
    }

    return this.repository.createMerchant({
      id: randomUUID(),
      workspaceId,
      name: parsed.name,
      normalizedName,
      createdByUserId: actor.userId,
    });
  }


  async createOrFindMerchant(
    actor: AuthenticatedActor,
    workspaceId: string,
    name: string,
  ): Promise<LedgerMerchantRecord> {
    const merchant = await this.findOrPrepareMerchant(actor, workspaceId, name);
    return merchant.existing ?? this.repository.createMerchant(merchant.record);
  }

  async listMerchants(actor: AuthenticatedActor, workspaceId: string): Promise<LedgerMerchantRecord[]> {
    await this.requireWorkspacePermission(actor.userId, workspaceId, "read");
    return this.repository.listMerchants(workspaceId);
  }

  async createTransaction(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: unknown,
  ): Promise<LedgerTransactionRecord> {
    const parsed = createLedgerTransactionSchema.parse(input);
    await this.requireWorkspacePermission(actor.userId, workspaceId, "manage_ledger");

    if (
      parsed.deduplicationFingerprint &&
      (await this.repository.findTransactionByFingerprint(workspaceId, parsed.deduplicationFingerprint))
    ) {
      throw new ConflictError("A transaction with this deduplication fingerprint already exists.");
    }

    return this.persistTransaction(actor, workspaceId, parsed);
  }

  /**
   * Creates one financial operation for one deduplication fingerprint. It
   * re-reads the stored row and recovers the committed winner of a concurrent
   * database unique-index race instead of duplicating money on retry.
   */
  async createTransactionIdempotently(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: unknown,
  ): Promise<LedgerTransactionRecord> {
    const parsed = createLedgerTransactionSchema.parse(input);
    const fingerprint = parsed.deduplicationFingerprint;
    if (!fingerprint) {
      throw new DomainConflictError(
        "MISSING_IDEMPOTENCY_KEY",
        "An idempotency key is required for this financial operation.",
      );
    }
    await this.requireWorkspacePermission(actor.userId, workspaceId, "manage_ledger");

    const existing = await this.repository.findTransactionByFingerprint(workspaceId, fingerprint);
    if (existing) return existing;

    try {
      const created = await this.persistTransaction(actor, workspaceId, parsed);
      const persisted = await this.repository.findTransaction(workspaceId, created.id);
      if (!persisted) throw new Error("Financial transaction was not found after persistence.");
      return persisted;
    } catch (error) {
      const persisted = await this.repository.findTransactionByFingerprint(workspaceId, fingerprint);
      if (persisted) return persisted;
      throw error;
    }
  }

  private async persistTransaction(
    actor: AuthenticatedActor,
    workspaceId: string,
    parsed: CreateLedgerTransactionInput,
  ): Promise<LedgerTransactionRecord> {
    const prepared = await this.prepareCanonicalTransaction(actor, workspaceId, parsed);
    return prepared.merchant
      ? this.repository.createTransactionWithMerchant(prepared.transaction, prepared.merchant)
      : this.repository.createTransaction(prepared.transaction);
  }

  private async prepareCanonicalTransaction(
    actor: AuthenticatedActor,
    workspaceId: string,
    parsed: CreateLedgerTransactionInput,
  ): Promise<{
    transaction: CreateLedgerTransactionRecord;
    merchant: CreateLedgerMerchantRecord | null;
  }> {

    const paidByUserId = parsed.paidByUserId ?? actor.userId;
    await this.requireMember(paidByUserId, workspaceId, "The paidBy member does not belong to this workspace.");

    const common = {
      id: randomUUID(),
      workspaceId,
      status: parsed.status,
      amountMinor: parsed.amountMinor,
      currency: toCurrencyCode(parsed.currency),
      occurredAt: parsed.occurredAt,
      createdByUserId: actor.userId,
      paidByUserId,
      source: parsed.source,
      deduplicationFingerprint: parsed.deduplicationFingerprint ?? null,
      note: parsed.note ?? null,
    };

    if (parsed.kind === "TRANSFER") {
      const fromAccount = await this.requireAccount(workspaceId, parsed.accountId, "From account");
      const toAccount = await this.requireAccount(workspaceId, parsed.transferAccountId, "To account");

      if (fromAccount.id === toAccount.id) {
        throw new DomainConflictError("SAME_TRANSFER_ACCOUNT", "A transfer must use two different accounts.");
      }
      if (fromAccount.currency !== toAccount.currency) {
        throw new DomainConflictError(
          "CROSS_CURRENCY_TRANSFER_UNSUPPORTED",
          "Transfers between accounts with different currencies are not supported.",
        );
      }
      this.assertCurrencyMatchesAccount(common.currency, fromAccount);

      // M2 represents both directions of a transfer in one append-only ledger
      // row. This one prepared record is therefore the complete financial write.
      return { transaction: {
        ...common,
        kind: "TRANSFER",
        accountId: fromAccount.id,
        transferAccountId: toAccount.id,
        categoryId: null,
        merchantId: null,
        transferGroupId: parsed.transferGroupId ?? randomUUID(),
        refundedTransactionId: null,
        reversalOfTransactionId: null,
      }, merchant: null };
    }

    const account = await this.requireAccount(workspaceId, parsed.accountId);
    this.assertCurrencyMatchesAccount(common.currency, account);

    if (parsed.kind === "REFUND") {
      const original = await this.requireTransaction(workspaceId, parsed.refundedTransactionId);
      if (original.kind !== "EXPENSE" || !original.categoryId) {
        throw new ConflictError("A refund must reference an expense transaction in this workspace.");
      }
      if (original.currency !== common.currency) {
        throw new ConflictError("A refund must use the currency of the original expense.");
      }

      const refundedMinor = (await this.repository.listRefundsForTransaction(workspaceId, original.id)).reduce(
        (total, refund) => total + refund.amountMinor,
        0n,
      );
      if (refundedMinor + common.amountMinor > original.amountMinor) {
        throw new ConflictError("Refunds cannot exceed the amount of the original expense.");
      }

      return { transaction: {
        ...common,
        kind: "REFUND",
        accountId: account.id,
        transferAccountId: null,
        categoryId: original.categoryId,
        merchantId: original.merchantId,
        transferGroupId: null,
        refundedTransactionId: original.id,
        reversalOfTransactionId: null,
      }, merchant: null };
    }

    const category = parsed.categoryId
      ? await this.requireCategory(workspaceId, parsed.categoryId, parsed.kind)
      : null;
    const merchant = await this.resolveTransactionMerchant(actor, workspaceId, parsed);
    const transaction = {
      ...common,
      kind: parsed.kind,
      accountId: account.id,
      transferAccountId: null,
      categoryId: category?.id ?? null,
      merchantId: merchant.id,
      transferGroupId: null,
      refundedTransactionId: null,
    };

    return {
      transaction: { ...transaction, reversalOfTransactionId: null },
      merchant: merchant.record,
    };
  }

 
  async correctTransaction(
    actor: AuthenticatedActor,
    command: CorrectTransactionCommand,
  ): Promise<LedgerFinancialCorrectionResult> {
    const membership = await this.requireWorkspacePermission(actor.userId, command.workspaceId, "manage_ledger");
    const idempotencyKey = correctionIdempotencyKey(actor.userId, command.idempotencyKey);
    const commandFingerprint = correctionCommandFingerprint(command);

    const replay = await this.repository.findTransactionCorrectionByIdempotencyKey(
      command.workspaceId,
      actor.userId,
      idempotencyKey,
    );
    if (replay) return this.resolveExistingCorrection(command, commandFingerprint, replay);

    const original = await this.requireTransaction(command.workspaceId, command.transactionId);
    if (
      command.expectedUpdatedAt
      && original.updatedAt.getTime() !== command.expectedUpdatedAt.getTime()
    ) {
      throw new DomainConflictError(
        "CONCURRENT_MODIFICATION",
        "This transaction changed since it was loaded. Refresh it before correcting it.",
      );
    }
    if (await this.repository.findTransactionCorrectionByOriginal(command.workspaceId, original.id)) {
      throw new DomainConflictError(
        "TRANSACTION_NOT_CURRENT",
        "This transaction has already been corrected. Correct the current replacement instead.",
      );
    }

    const refundedAmountMinor = (await this.repository.listRefundsForTransaction(command.workspaceId, original.id))
      .reduce((total, refund) => total + refund.amountMinor, 0n);
    const capabilities = getTransactionCapabilities({
      transaction: original,
      workspaceRole: membership.role,
      refundedAmountMinor,
      isCurrentEffective: true,
    });
    if (!capabilities.canCorrectFinancials || original.kind !== command.kind) {
      throw new DomainConflictError(
        "TRANSACTION_CORRECTION_NOT_ALLOWED",
        "This transaction cannot be financially corrected in its current state.",
      );
    }

    const correctionId = randomUUID();
    const replacementInput = this.buildCorrectionReplacementInput(original, command, correctionId);
    await this.assertCorrectionReplacementAccounts(command.workspaceId, replacementInput);
    const replacement = await this.prepareCanonicalTransaction(actor, command.workspaceId, replacementInput);
    if (replacement.merchant) {
      throw new DomainConflictError("INVALID_CORRECTION", "Correction cannot create a new merchant.");
    }
    const reversal = createCorrectionReversal(original, actor.userId, correctionId);
    const correction: CreateLedgerTransactionCorrectionRecord = {
      id: correctionId,
      workspaceId: command.workspaceId,
      originalTransactionId: original.id,
      reversalTransactionId: reversal.id,
      replacementTransactionId: replacement.transaction.id,
      actorUserId: actor.userId,
      idempotencyKey,
      commandFingerprint,
      reason: command.reason ?? null,
    };
    const audits = correctionAudits({
      actorUserId: actor.userId,
      correction,
      original,
      reversal,
      replacement: replacement.transaction,
    });
    let created;
    try {
      created = await this.repository.createFinancialCorrection({
        workspaceId: command.workspaceId,
        originalTransactionId: original.id,
        expectedOriginalUpdatedAt: command.expectedUpdatedAt,
        correction,
        reversal,
        replacement: replacement.transaction,
        audits,
      });
    } catch (error) {
      const concurrentReplay = await this.repository.findTransactionCorrectionByIdempotencyKey(
        command.workspaceId,
        actor.userId,
        idempotencyKey,
      );
      if (concurrentReplay) return this.resolveExistingCorrection(command, commandFingerprint, concurrentReplay);
      throw error;
    }

    if (!created) {
      const concurrentReplay = await this.repository.findTransactionCorrectionByIdempotencyKey(
        command.workspaceId,
        actor.userId,
        idempotencyKey,
      );
      if (concurrentReplay) return this.resolveExistingCorrection(command, commandFingerprint, concurrentReplay);
      if (await this.repository.findTransactionCorrectionByOriginal(command.workspaceId, original.id)) {
        throw new DomainConflictError(
          "TRANSACTION_NOT_CURRENT",
          "This transaction was corrected by another request. Refresh before correcting again.",
        );
      }
      throw new DomainConflictError(
        "CONCURRENT_MODIFICATION",
        "This transaction changed while its correction was being saved.",
      );
    }

    const result = await this.hydrateCorrection(created);
    assertVerifiedFinancialCorrection(result, original, replacement.transaction);
    const persistedAuditIds = new Set(
      (await Promise.all([
        this.repository.listTransactionAudit(command.workspaceId, original.id),
        this.repository.listTransactionAudit(command.workspaceId, reversal.id),
        this.repository.listTransactionAudit(command.workspaceId, replacement.transaction.id),
      ])).flat().map((audit) => audit.id),
    );
    if (audits.some((audit) => !persistedAuditIds.has(audit.id))) {
      throw new Error("Financial correction audit verification failed.");
    }
    return result;
  }

  /** Resolves the terminal replacement for any record in a correction chain. */
  async getCurrentEffectiveTransaction(
    actor: AuthenticatedActor,
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionRecord> {
    await this.requireWorkspacePermission(actor.userId, workspaceId, "read");
    let current = await this.requireTransaction(workspaceId, transactionId);
    const enclosingCorrection = await this.repository.findTransactionCorrectionByTransactionId(workspaceId, current.id);
    if (enclosingCorrection?.reversalTransactionId === current.id) {
      current = await this.requireTransaction(workspaceId, enclosingCorrection.originalTransactionId);
    }
    const visited = new Set<string>();
    while (true) {
      if (visited.has(current.id)) throw new Error("Correction chain contains a cycle.");
      visited.add(current.id);
      const correction = await this.repository.findTransactionCorrectionByOriginal(workspaceId, current.id);
      if (!correction) return current;
      current = await this.requireTransaction(workspaceId, correction.replacementTransactionId);
    }
  }

  async listTransactions(
    actor: AuthenticatedActor,
    workspaceId: string,
    filters: LedgerTransactionFilters = {},
  ): Promise<LedgerTransactionRecord[]> {
    await this.requireWorkspacePermission(actor.userId, workspaceId, "read");
    return this.repository.listTransactions(workspaceId, filters);
  }

  async updateTransactionDetails(
    actor: AuthenticatedActor,
    workspaceId: string,
    transactionId: string,
    patchInput: unknown,
    expectedUpdatedAt: Date,
    timeZone: string,
  ): Promise<LedgerTransactionRecord> {
    const membership = await this.requireWorkspacePermission(actor.userId, workspaceId, "manage_ledger");
    const transaction = await this.requireTransaction(workspaceId, transactionId);
    const refundedAmountMinor = (await this.repository.listRefundsForTransaction(workspaceId, transaction.id)).reduce(
      (total, refund) => total + refund.amountMinor,
      0n,
    );
    const capabilities = getTransactionCapabilities({
      transaction,
      workspaceRole: membership.role,
      refundedAmountMinor,
    });
    if (!capabilities.canEdit) {
      throw new DomainConflictError(
        "TRANSACTION_EDIT_NOT_ALLOWED",
        "This transaction cannot be edited in its current state.",
      );
    }

    const patch = parseTransactionDetailsPatch(transaction.kind, patchInput);
    const resolved = await this.resolveTransactionDetailsPatch(
      actor,
      workspaceId,
      transaction,
      patch,
      timeZone,
    );

    if (
      resolved.categoryId === transaction.categoryId
      && resolved.merchantId === transaction.merchantId
      && resolved.occurredAt.getTime() === transaction.occurredAt.getTime()
      && resolved.note === transaction.note
    ) {
      // Replaying an already-applied patch after the caller has reconciled its
      // Detail DTO is intentionally a no-op: no second financial record and no
      // noisy duplicate audit event are created.
      return transaction;
    }

    const auditId = randomUUID();
    const updated = await this.repository.updateTransactionDetails({
      workspaceId,
      transactionId,
      expectedUpdatedAt,
      categoryId: resolved.categoryId,
      merchantId: resolved.merchantId,
      occurredAt: resolved.occurredAt,
      note: resolved.note,
      merchantToCreate: resolved.merchantToCreate,
      audit: {
        id: auditId,
        workspaceId,
        transactionId,
        actorUserId: actor.userId,
        action: "UPDATE",
        metadata: { changes: transactionDetailAuditChanges(transaction, resolved) },
      },
    });
    if (!updated) {
      throw new DomainConflictError(
        "CONCURRENT_MODIFICATION",
        "This transaction changed since it was loaded. Refresh it before editing again.",
      );
    }

    this.assertSafeTransactionUpdate(transaction, updated, resolved);
    const persisted = await this.repository.findTransaction(workspaceId, transactionId);
    if (!persisted) throw new Error("Transaction was not found after its detail update.");
    this.assertSafeTransactionUpdate(transaction, persisted, resolved);

    const audit = (await this.repository.listTransactionAudit(workspaceId, transactionId)).find(
      (candidate) => candidate.id === auditId,
    );
    if (!audit) throw new Error("Transaction detail update was not audited.");
    return persisted;
  }

  private buildCorrectionReplacementInput(
    original: LedgerTransactionRecord,
    command: CorrectTransactionCommand,
    correctionId: string,
  ): CreateLedgerTransactionInput {
    const common = {
      status: "POSTED" as const,
      amountMinor: command.financialChanges.amountMinor ?? original.amountMinor,
      currency: toCurrencyCode(original.currency),
      occurredAt: original.occurredAt,
      paidByUserId: original.paidByUserId ?? undefined,
      source: correctionSource(original.source, "REPLACEMENT", correctionId, original.id) as CreateLedgerTransactionInput["source"],
      deduplicationFingerprint: correctionTransactionFingerprint(correctionId, "replacement"),
      note: original.note ?? undefined,
    };

    switch (command.kind) {
      case "EXPENSE": {
        const accountId = command.financialChanges.accountId ?? original.accountId;
        if (!accountId || original.kind !== "EXPENSE") throw invalidCorrection();
        if (common.amountMinor === original.amountMinor && accountId === original.accountId) throw invalidCorrection();
        return {
          kind: "EXPENSE",
          ...common,
          accountId,
          categoryId: original.categoryId ?? undefined,
          merchantId: original.merchantId ?? undefined,
        };
      }
      case "INCOME": {
        const accountId = command.financialChanges.accountId ?? original.accountId;
        if (!accountId || original.kind !== "INCOME") throw invalidCorrection();
        if (common.amountMinor === original.amountMinor && accountId === original.accountId) throw invalidCorrection();
        return {
          kind: "INCOME",
          ...common,
          accountId,
          categoryId: original.categoryId ?? undefined,
          merchantId: original.merchantId ?? undefined,
        };
      }
      case "TRANSFER": {
        const accountId = command.financialChanges.fromAccountId ?? original.accountId;
        const transferAccountId = command.financialChanges.toAccountId ?? original.transferAccountId;
        if (!accountId || !transferAccountId || original.kind !== "TRANSFER") throw invalidCorrection();
        if (
          common.amountMinor === original.amountMinor
          && accountId === original.accountId
          && transferAccountId === original.transferAccountId
        ) {
          throw invalidCorrection();
        }
        return {
          kind: "TRANSFER",
          ...common,
          accountId,
          transferAccountId,
          transferGroupId: randomUUID(),
        };
      }
    }
  }

  private async assertCorrectionReplacementAccounts(
    workspaceId: string,
    replacement: CreateLedgerTransactionInput,
  ): Promise<void> {
    const assertAccount = async (accountId: string, label: string) => {
      const account = await this.repository.findAccount(workspaceId, accountId);
      if (account) {
        if (account.archivedAt) throw new ConflictError("Archived accounts cannot accept new transactions.");
        return account;
      }
      if (await this.repository.findAccountById(accountId)) {
        throw new DomainConflictError(
          "ACCOUNT_WORKSPACE_MISMATCH",
          `${label} does not belong to this workspace.`,
        );
      }
      throw new NotFoundError(`${label} not found in this workspace.`);
    };

    const account = await assertAccount(replacement.accountId, replacement.kind === "TRANSFER" ? "From account" : "Account");
    if (replacement.kind === "TRANSFER") {
      const transferAccount = await assertAccount(replacement.transferAccountId, "To account");
      if (account.id === transferAccount.id) {
        throw new DomainConflictError("SAME_TRANSFER_ACCOUNT", "A transfer must use two different accounts.");
      }
      if (account.currency !== transferAccount.currency) {
        throw new DomainConflictError(
          "CROSS_CURRENCY_TRANSFER_UNSUPPORTED",
          "Transfers between accounts with different currencies are not supported.",
        );
      }
    }
    this.assertCurrencyMatchesAccount(replacement.currency, account);
  }

  private async resolveExistingCorrection(
    command: CorrectTransactionCommand,
    commandFingerprint: string,
    correction: import("./domain").LedgerTransactionCorrectionRecord,
  ): Promise<LedgerFinancialCorrectionResult> {
    if (
      correction.originalTransactionId !== command.transactionId
      || correction.commandFingerprint !== commandFingerprint
    ) {
      throw new DomainConflictError(
        "CORRECTION_ALREADY_PROCESSED",
        "This correction idempotency key has already been used for another command.",
      );
    }
    return this.hydrateCorrection(correction);
  }

  private async hydrateCorrection(
    correction: import("./domain").LedgerTransactionCorrectionRecord,
  ): Promise<LedgerFinancialCorrectionResult> {
    const [originalTransaction, reversalTransaction, replacementTransaction] = await Promise.all([
      this.requireTransaction(correction.workspaceId, correction.originalTransactionId),
      this.requireTransaction(correction.workspaceId, correction.reversalTransactionId),
      this.requireTransaction(correction.workspaceId, correction.replacementTransactionId),
    ]);
    return { correction, originalTransaction, reversalTransaction, replacementTransaction };
  }

  private async requireWorkspacePermission(
    userId: string,
    workspaceId: string,
    action: WorkspaceAction,
  ) {
    const membership = await this.workspaces.findMembership(workspaceId, userId);
    if (!membership) {
      throw new AuthorizationError("You are not a member of this workspace.");
    }
    assertWorkspacePermission(membership.role, action);
    return membership;
  }

  private async requireMember(userId: string, workspaceId: string, message: string): Promise<void> {
    if (!(await this.workspaces.findMembership(workspaceId, userId))) {
      throw new AuthorizationError(message);
    }
  }

  private async requireAccount(
    workspaceId: string,
    accountId: string,
    label = "Account",
  ): Promise<LedgerAccountRecord> {
    const account = await this.repository.findAccount(workspaceId, accountId);
    if (!account) throw new NotFoundError(`${label} not found in this workspace.`);
    if (account.archivedAt) throw new ConflictError("Archived accounts cannot accept new transactions.");
    return account;
  }

  private async resolveTransactionMerchant(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: Extract<ReturnType<typeof createLedgerTransactionSchema.parse>, { kind: "EXPENSE" | "INCOME" }>,
  ): Promise<{ id: string | null; record: CreateLedgerMerchantRecord | null }> {
    if (input.merchantId) {
      return { id: (await this.requireMerchant(workspaceId, input.merchantId)).id, record: null };
    }
    if (!input.merchantName) return { id: null, record: null };

    const merchant = await this.findOrPrepareMerchant(actor, workspaceId, input.merchantName);
    if (merchant.existing) return { id: merchant.existing.id, record: null };
    return {
      id: merchant.record.id,
      record: merchant.record,
    };
  }

  /** Shared deterministic merchant lookup/normalization for every write path. */
  private async findOrPrepareMerchant(
    actor: AuthenticatedActor,
    workspaceId: string,
    name: string,
  ): Promise<{ existing: LedgerMerchantRecord | null; record: CreateLedgerMerchantRecord }> {
    const parsed = createLedgerMerchantSchema.parse({ name });
    await this.requireWorkspacePermission(actor.userId, workspaceId, "manage_ledger");
    const normalizedName = normalizeMerchantName(parsed.name);
    const existing = await this.repository.findMerchantByNormalizedName(workspaceId, normalizedName);
    return {
      existing,
      record: {
        id: randomUUID(),
        workspaceId,
        name: parsed.name,
        normalizedName,
        createdByUserId: actor.userId,
      },
    };
  }

  private async requireCategory(
    workspaceId: string,
    categoryId: string,
    kind: LedgerCategoryKind,
  ): Promise<LedgerCategoryRecord> {
    const category = await this.repository.findCategory(workspaceId, categoryId);
    if (!category || category.kind !== kind) {
      throw new NotFoundError("Category not found for this transaction type in this workspace.");
    }
    return category;
  }

  private async requireMerchant(workspaceId: string, merchantId: string): Promise<LedgerMerchantRecord> {
    const merchant = await this.repository.findMerchant(workspaceId, merchantId);
    if (!merchant) throw new NotFoundError("Merchant not found in this workspace.");
    return merchant;
  }

  private async resolveTransactionDetailsPatch(
    actor: AuthenticatedActor,
    workspaceId: string,
    transaction: LedgerTransactionRecord,
    patch: TransactionDetailsPatch,
    timeZone: string,
  ): Promise<{
    categoryId: string | null;
    merchantId: string | null;
    occurredAt: Date;
    note: string | null;
    merchantToCreate: CreateLedgerMerchantRecord | null;
  }> {
    let categoryId = transaction.categoryId;
    let merchantId = transaction.merchantId;
    let occurredAt = transaction.occurredAt;
    let note = transaction.note;
    let merchantToCreate: CreateLedgerMerchantRecord | null = null;

    if ("categoryId" in patch && patch.categoryId !== undefined) {
      if (patch.categoryId === null) {
        categoryId = null;
      } else {
        const category = await this.repository.findCategory(workspaceId, patch.categoryId);
        if (!category || category.kind !== transaction.kind) {
          throw new DomainConflictError(
            "CATEGORY_NOT_ALLOWED",
            "Category is not available for this transaction type in this workspace.",
          );
        }
        categoryId = category.id;
      }
    }

    const counterparty = "merchant" in patch
      ? patch.merchant
      : "source" in patch
        ? patch.source
        : undefined;
    if (counterparty !== undefined) {
      if (counterparty === null) {
        merchantId = null;
      } else {
        const normalizedName = normalizeMerchantName(counterparty);
        const existing = await this.repository.findMerchantByNormalizedName(workspaceId, normalizedName);
        if (existing) {
          merchantId = existing.id;
        } else {
          merchantToCreate = {
            id: randomUUID(),
            workspaceId,
            name: counterparty,
            normalizedName,
            createdByUserId: actor.userId,
          };
          merchantId = merchantToCreate.id;
        }
      }
    }

    if (patch.occurredAt !== undefined) {
      try {
        occurredAt = resolveManualOccurredAt(
          patch.occurredAt.date,
          patch.occurredAt.time ?? null,
          timeZone,
        );
      } catch {
        throw new DomainConflictError("INVALID_OCCURRED_AT", "Occurrence date and time are invalid.");
      }
    }
    if (patch.note !== undefined) note = patch.note;

    return { categoryId, merchantId, occurredAt, note, merchantToCreate };
  }

  private assertSafeTransactionUpdate(
    before: LedgerTransactionRecord,
    after: LedgerTransactionRecord,
    expected: {
      categoryId: string | null;
      merchantId: string | null;
      occurredAt: Date;
      note: string | null;
    },
  ): void {
    const immutableFieldsMatch =
      after.id === before.id
      && after.workspaceId === before.workspaceId
      && after.kind === before.kind
      && after.status === before.status
      && after.amountMinor === before.amountMinor
      && after.currency === before.currency
      && after.accountId === before.accountId
      && after.transferAccountId === before.transferAccountId
      && after.createdByUserId === before.createdByUserId
      && after.paidByUserId === before.paidByUserId
      && after.transferGroupId === before.transferGroupId
      && after.refundedTransactionId === before.refundedTransactionId
      && after.reversalOfTransactionId === before.reversalOfTransactionId
      && stableJson(after.source) === stableJson(before.source)
      && after.deduplicationFingerprint === before.deduplicationFingerprint
      && after.createdAt.getTime() === before.createdAt.getTime();
    const intendedDetailsMatch =
      after.categoryId === expected.categoryId
      && after.merchantId === expected.merchantId
      && after.occurredAt.getTime() === expected.occurredAt.getTime()
      && after.note === expected.note;

    if (!immutableFieldsMatch || !intendedDetailsMatch) {
      throw new Error("Persisted transaction did not match the safe detail-update contract.");
    }
  }

  private async requireTransaction(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionRecord> {
    const transaction = await this.repository.findTransaction(workspaceId, transactionId);
    if (!transaction) throw new NotFoundError("Transaction not found in this workspace.");
    return transaction;
  }

  private assertCurrencyMatchesAccount(currency: string, account: LedgerAccountRecord): void {
    if (account.currency !== currency) {
      throw new ConflictError("Transaction currency must match the account currency.");
    }
  }
}

export interface LedgerFinancialCorrectionResult {
  correction: import("./domain").LedgerTransactionCorrectionRecord;
  originalTransaction: LedgerTransactionRecord;
  reversalTransaction: LedgerTransactionRecord;
  replacementTransaction: LedgerTransactionRecord;
}

function createCorrectionReversal(
  original: LedgerTransactionRecord,
  actorUserId: string,
  correctionId: string,
): CreateLedgerTransactionRecord {
  if (original.kind === "REFUND" || !original.accountId) throw invalidCorrection();
  const common = {
    id: randomUUID(),
    workspaceId: original.workspaceId,
    kind: original.kind,
    status: "POSTED" as const,
    amountMinor: original.amountMinor,
    currency: original.currency,
    occurredAt: original.occurredAt,
    categoryId: original.categoryId,
    merchantId: original.merchantId,
    createdByUserId: actorUserId,
    paidByUserId: original.paidByUserId,
    refundedTransactionId: null,
    reversalOfTransactionId: original.id,
    source: correctionSource(original.source, "REVERSAL", correctionId, original.id),
    deduplicationFingerprint: correctionTransactionFingerprint(correctionId, "reversal"),
    note: original.note,
  };

  if (original.kind === "TRANSFER") {
    if (!original.transferAccountId) throw invalidCorrection();
    return {
      ...common,
      accountId: original.transferAccountId,
      transferAccountId: original.accountId,
      categoryId: null,
      merchantId: null,
      transferGroupId: randomUUID(),
    };
  }

  return {
    ...common,
    accountId: original.accountId,
    transferAccountId: null,
    transferGroupId: null,
  };
}

function correctionAudits({
  actorUserId,
  correction,
  original,
  reversal,
  replacement,
}: {
  actorUserId: string;
  correction: CreateLedgerTransactionCorrectionRecord;
  original: LedgerTransactionRecord;
  reversal: CreateLedgerTransactionRecord;
  replacement: CreateLedgerTransactionRecord;
}): readonly [
  CreateLedgerTransactionAuditRecord,
  CreateLedgerTransactionAuditRecord,
  CreateLedgerTransactionAuditRecord,
] {
  const linkage = {
    correctionId: correction.id,
    originalTransactionId: original.id,
    reversalTransactionId: reversal.id,
    replacementTransactionId: replacement.id,
    reason: correction.reason,
  };
  return [
    {
      id: randomUUID(),
      workspaceId: correction.workspaceId,
      transactionId: original.id,
      actorUserId,
      action: "CORRECT",
      metadata: {
        ...linkage,
        changes: correctionFinancialChanges(original, replacement),
      },
    },
    {
      id: randomUUID(),
      workspaceId: correction.workspaceId,
      transactionId: reversal.id,
      actorUserId,
      action: "CORRECTION_REVERSAL",
      metadata: linkage,
    },
    {
      id: randomUUID(),
      workspaceId: correction.workspaceId,
      transactionId: replacement.id,
      actorUserId,
      action: "CORRECTION_REPLACEMENT",
      metadata: linkage,
    },
  ];
}

function correctionFinancialChanges(
  original: LedgerTransactionRecord,
  replacement: CreateLedgerTransactionRecord,
): Record<string, { before: string; after: string }> {
  const changes: Record<string, { before: string; after: string }> = {};
  if (original.amountMinor !== replacement.amountMinor) {
    changes.amountMinor = { before: original.amountMinor.toString(), after: replacement.amountMinor.toString() };
  }
  if (original.accountId !== replacement.accountId) {
    changes.accountId = { before: original.accountId ?? "", after: replacement.accountId ?? "" };
  }
  if (original.transferAccountId !== replacement.transferAccountId) {
    changes.transferAccountId = {
      before: original.transferAccountId ?? "",
      after: replacement.transferAccountId ?? "",
    };
  }
  return changes;
}

function correctionSource(
  source: Record<string, unknown>,
  operation: "REVERSAL" | "REPLACEMENT",
  correctionId: string,
  originalTransactionId: string,
): Record<string, unknown> {
  return {
    ...source,
    correction: { operation, correctionId, originalTransactionId },
  };
}

function correctionIdempotencyKey(actorUserId: string, idempotencyKey: string): string {
  return `correction:${createHash("sha256").update(`${actorUserId}:${idempotencyKey}`).digest("hex")}`;
}

function correctionTransactionFingerprint(correctionId: string, role: "reversal" | "replacement"): string {
  return `correction:${createHash("sha256").update(`${correctionId}:${role}`).digest("hex")}`;
}

function correctionCommandFingerprint(command: CorrectTransactionCommand): string {
  const expectedVersion = command.expectedUpdatedAt?.toISOString() ?? null;
  return createHash("sha256")
    .update(JSON.stringify({
      transactionId: command.transactionId,
      kind: command.kind,
      financialChanges: Object.fromEntries(
        Object.entries(command.financialChanges).map(([key, value]) => [
          key,
          typeof value === "bigint" ? value.toString() : value,
        ]),
      ),
      reason: command.reason ?? null,
      expectedVersion,
    }))
    .digest("hex");
}

function invalidCorrection(): DomainConflictError {
  return new DomainConflictError("INVALID_CORRECTION", "Correction must change at least one allowed financial value.");
}

function assertVerifiedFinancialCorrection(
  result: LedgerFinancialCorrectionResult,
  original: LedgerTransactionRecord,
  expectedReplacement: CreateLedgerTransactionRecord,
): void {
  const { correction, reversalTransaction: reversal, replacementTransaction: replacement } = result;
  const commonLinkageValid =
    correction.originalTransactionId === original.id
    && correction.reversalTransactionId === reversal.id
    && correction.replacementTransactionId === replacement.id
    && reversal.reversalOfTransactionId === original.id
    && replacement.reversalOfTransactionId === null;
  const replacementMatches =
    replacement.kind === expectedReplacement.kind
    && replacement.status === "POSTED"
    && replacement.amountMinor === expectedReplacement.amountMinor
    && replacement.currency === expectedReplacement.currency
    && replacement.accountId === expectedReplacement.accountId
    && replacement.transferAccountId === expectedReplacement.transferAccountId
    && replacement.categoryId === expectedReplacement.categoryId
    && replacement.merchantId === expectedReplacement.merchantId
    && replacement.occurredAt.getTime() === expectedReplacement.occurredAt.getTime()
    && replacement.note === expectedReplacement.note;
  const reversalMatches =
    reversal.kind === original.kind
    && reversal.status === "POSTED"
    && reversal.amountMinor === original.amountMinor
    && reversal.currency === original.currency
    && (original.kind === "TRANSFER"
      ? reversal.accountId === original.transferAccountId && reversal.transferAccountId === original.accountId
      : reversal.accountId === original.accountId && reversal.transferAccountId === null);
  if (!commonLinkageValid || !replacementMatches || !reversalMatches) {
    throw new Error("Financial correction verification failed.");
  }
}

function transactionDetailAuditChanges(
  before: LedgerTransactionRecord,
  after: {
    categoryId: string | null;
    merchantId: string | null;
    occurredAt: Date;
    note: string | null;
  },
): Record<string, { before: string | null; after: string | null }> {
  const changes: Record<string, { before: string | null; after: string | null }> = {};
  if (before.categoryId !== after.categoryId) {
    changes.categoryId = { before: before.categoryId, after: after.categoryId };
  }
  if (before.merchantId !== after.merchantId) {
    changes.counterpartyId = { before: before.merchantId, after: after.merchantId };
  }
  if (before.occurredAt.getTime() !== after.occurredAt.getTime()) {
    changes.occurredAt = { before: before.occurredAt.toISOString(), after: after.occurredAt.toISOString() };
  }
  if (before.note !== after.note) {
    changes.note = {
      before: before.note === null ? null : "[present]",
      after: after.note === null ? null : "[present]",
    };
  }
  return changes;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
