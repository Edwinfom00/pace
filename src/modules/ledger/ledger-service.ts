import { randomUUID } from "node:crypto";

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
  LedgerRepository,
} from "./repositories/ledger-repository";
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

/**
 * The M2 ledger is append-only. Correcting a spend is represented by a refund
 * or a new transaction rather than mutating historical amounts.
 */
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
      // row. This one insert is therefore the complete atomic financial write.
      return this.repository.createTransaction({
        ...common,
        kind: "TRANSFER",
        accountId: fromAccount.id,
        transferAccountId: toAccount.id,
        categoryId: null,
        merchantId: null,
        transferGroupId: parsed.transferGroupId ?? randomUUID(),
        refundedTransactionId: null,
      });
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

      return this.repository.createTransaction({
        ...common,
        kind: "REFUND",
        accountId: account.id,
        transferAccountId: null,
        categoryId: original.categoryId,
        merchantId: original.merchantId,
        transferGroupId: null,
        refundedTransactionId: original.id,
      });
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

    return merchant.record
      ? this.repository.createTransactionWithMerchant(transaction, merchant.record)
      : this.repository.createTransaction(transaction);
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
    // IDs retain useful provenance without duplicating counterparty text.
    changes.counterpartyId = { before: before.merchantId, after: after.merchantId };
  }
  if (before.occurredAt.getTime() !== after.occurredAt.getTime()) {
    changes.occurredAt = { before: before.occurredAt.toISOString(), after: after.occurredAt.toISOString() };
  }
  if (before.note !== after.note) {
    // Notes can be sensitive, so record state transitions rather than content.
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
