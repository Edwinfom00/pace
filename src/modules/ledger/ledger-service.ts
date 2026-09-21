import { createHash, randomUUID } from "node:crypto";

import {
  AuthorizationError,
  ConflictError,
  DomainConflictError,
  NotFoundError,
} from "@/authorization/errors";
import { add, money, subtract, sum } from "@/money/money";
import {
  assertWorkspacePermission,
  type WorkspaceAction,
} from "@/authorization/workspace-permissions";
import { toCurrencyCode } from "@/money/currency";
import type { AuthenticatedActor } from "@/authorization/session";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";
import { getTransactionCapabilities } from "@/modules/transactions/domain/transaction-action-policy";

import type {
  LedgerAccountBalance,
  LedgerAccountRecord,
  LedgerCategoryKind,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerOpeningBalanceReadRecord,
  LedgerTransactionFilters,
  LedgerTransactionRecord,
} from "./domain";
import { normalizeMerchantName } from "./domain";
import {
  getAccountActionPolicy,
  isAccountTypeChangeAllowed,
  type AccountActionPolicy,
} from "./account-action-policy";
import {
  debitSpendabilityGuard,
  InsufficientFundsError,
} from "./spendability-policy";
import type {
  CreateLedgerAccountRecord,
  CreateLedgerMerchantRecord,
  CreateLedgerAccountAuditRecord,
  CreateLedgerTransactionRecord,
  CreateLedgerTransactionAuditRecord,
  CreateLedgerTransactionCorrectionRecord,
  CreateLedgerFinancialRefundRecord,
  CreateLedgerFinancialReversalRecord,
  CreateLedgerOpeningBalanceRecord,
  LedgerRepository,
  MutateLedgerAccountRecord,
} from "./repositories/ledger-repository";
import type { ManageAccountCommand } from "./manage-account-contract";
import type {
  CorrectTransactionCommand,
} from "./correct-transaction-contract";
import type { CreateRefundCommand, RefundStatus } from "./create-refund-contract";
import type { ReverseTransactionCommand } from "./reverse-transaction-contract";
import type {
  CorrectOpeningBalanceCommand,
  OpeningBalanceDTO,
  SetOpeningBalanceCommand,
} from "./opening-balance-contract";
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

export const INITIAL_WORKSPACE_ACCOUNT_NAME = "Main account";
export const INITIAL_WORKSPACE_ACCOUNT_TYPE = "CHECKING";

/**
 * Builds the persisted form of an account from the same validation and money
 * normalization used by every account-creation path. Persistence remains the
 * caller's responsibility so workspace provisioning can include the account
 * in its atomic database bundle.
 */
export function createLedgerAccountRecord(input: {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  account: unknown;
}): CreateLedgerAccountRecord {
  const parsed = createLedgerAccountSchema.parse(input.account);
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    name: parsed.name,
    type: parsed.type,
    currency: toCurrencyCode(parsed.currency),
    createdByUserId: input.createdByUserId,
  };
}

/** Creates the one initial, ordinary funded account for a new workspace. */
export function createInitialWorkspaceAccount(input: {
  id?: string;
  workspaceId: string;
  createdByUserId: string;
  currency: string;
}): CreateLedgerAccountRecord {
  return createLedgerAccountRecord({
    id: input.id ?? randomUUID(),
    workspaceId: input.workspaceId,
    createdByUserId: input.createdByUserId,
    account: {
      name: INITIAL_WORKSPACE_ACCOUNT_NAME,
      type: INITIAL_WORKSPACE_ACCOUNT_TYPE,
      currency: input.currency,
    },
  });
}

export class LedgerService {
  constructor(
    private readonly repository: LedgerRepository,
    private readonly workspaces: Pick<WorkspaceRepository, "findMemberContext" | "findMembership">,
  ) { }

  async createAccount(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: unknown,
  ): Promise<LedgerAccountRecord> {
    const account = createLedgerAccountRecord({
      id: randomUUID(),
      workspaceId,
      createdByUserId: actor.userId,
      account: input,
    });
    await this.requireWorkspacePermission(actor.userId, workspaceId, "manage_ledger");

    return this.repository.createAccount(account);
  }

  async listAccounts(actor: AuthenticatedActor, workspaceId: string): Promise<LedgerAccountRecord[]> {
    await this.requireWorkspacePermission(actor.userId, workspaceId, "read");
    return this.repository.listAccounts(workspaceId);
  }

  async getAccountBalance(
    actor: AuthenticatedActor,
    input: { workspaceId: string; accountId: string },
  ): Promise<LedgerAccountBalance> {
    await this.requireWorkspacePermission(actor.userId, input.workspaceId, "read");
    const balance = await this.repository.getAccountBalance(input.workspaceId, input.accountId);
    if (!balance) throw new NotFoundError("Account not found in this workspace.");
    return balance;
  }

  async getWorkspaceAccountBalances(
    actor: AuthenticatedActor,
    input: { workspaceId: string },
  ): Promise<readonly LedgerAccountBalance[]> {
    await this.requireWorkspacePermission(actor.userId, input.workspaceId, "read");
    return this.repository.getWorkspaceAccountBalances(input.workspaceId);
  }

  /** Read projection for Account Detail; source metadata never crosses this boundary. */
  async getOpeningBalance(
    actor: AuthenticatedActor,
    input: { workspaceId: string; accountId: string },
  ): Promise<OpeningBalanceDTO | null> {
    await this.requireWorkspacePermission(actor.userId, input.workspaceId, "read");
    await this.requireManagedAccount(input.workspaceId, input.accountId);
    const openingBalance = await this.repository.findOpeningBalance(input.workspaceId, input.accountId);
    return openingBalance ? presentOpeningBalance(openingBalance) : null;
  }

  /**
   * Establishes the account's only logical opening-balance chain. This is an
   * internal ledger event, deliberately not a user-facing transaction.
   */
  async setOpeningBalance(
    actor: AuthenticatedActor,
    command: SetOpeningBalanceCommand,
  ): Promise<OpeningBalanceDTO> {
    await this.requireWorkspacePermission(actor.userId, command.workspaceId, "manage_ledger");
    if (command.amountMinor < 0n) {
      throw new DomainConflictError(
        "NEGATIVE_OPENING_BALANCE_NOT_ALLOWED",
        "This account type has no configured debt or overdraft semantics for a negative opening balance.",
      );
    }

    const commandFingerprint = openingBalanceSetCommandFingerprint(command);
    const idempotencyFingerprint = openingBalanceSetIdempotencyFingerprint(actor.userId, command.idempotencyKey);
    const replay = await this.repository.findTransactionByFingerprint(command.workspaceId, idempotencyFingerprint);
    if (replay) {
      return this.resolveExistingOpeningBalanceSet(command, commandFingerprint, replay);
    }

    const account = await this.requireManagedAccount(command.workspaceId, command.accountId);
    if (account.archivedAt) {
      throw new DomainConflictError("ACCOUNT_UNAVAILABLE", "Archived accounts cannot receive an opening balance.");
    }
    this.assertCurrencyMatchesAccount(command.currency, account);
    if (await this.repository.findOpeningBalance(command.workspaceId, account.id)) {
      throw new DomainConflictError(
        "OPENING_BALANCE_ALREADY_EXISTS",
        "This account already has an opening balance. Use the correction command instead.",
      );
    }

    const transactionId = randomUUID();
    const transaction: CreateLedgerTransactionRecord = {
      id: transactionId,
      workspaceId: command.workspaceId,
      kind: "OPENING_BALANCE",
      status: "POSTED",
      amountMinor: command.amountMinor,
      currency: command.currency,
      occurredAt: command.effectiveAt,
      accountId: account.id,
      transferAccountId: null,
      categoryId: null,
      merchantId: null,
      createdByUserId: actor.userId,
      paidByUserId: null,
      transferGroupId: null,
      refundedTransactionId: null,
      reversalOfTransactionId: null,
      source: {
        provider: "pace",
        origin: "OPENING_BALANCE",
        openingBalance: {
          operation: "SET",
          commandFingerprint,
        },
      },
      deduplicationFingerprint: idempotencyFingerprint,
      note: null,
    };
    const write: CreateLedgerOpeningBalanceRecord = {
      openingBalance: {
        id: randomUUID(),
        workspaceId: command.workspaceId,
        accountId: account.id,
        originalTransactionId: transactionId,
        currentTransactionId: transactionId,
      },
      transaction,
      audit: {
        id: randomUUID(),
        workspaceId: command.workspaceId,
        transactionId,
        actorUserId: actor.userId,
        action: "OPENING_BALANCE_ESTABLISHED",
        metadata: {
          accountId: account.id,
          amountMinor: command.amountMinor.toString(),
          currency: command.currency,
          effectiveAt: command.effectiveAt.toISOString(),
        },
      },
    };

    let created: LedgerTransactionRecord | null;
    try {
      created = await this.repository.createOpeningBalance(write);
    } catch (error) {
      const concurrentReplay = await this.repository.findTransactionByFingerprint(
        command.workspaceId,
        idempotencyFingerprint,
      );
      if (concurrentReplay) return this.resolveExistingOpeningBalanceSet(command, commandFingerprint, concurrentReplay);
      if (isSerializationFailure(error)) {
        throw new DomainConflictError(
          "CONCURRENT_MODIFICATION",
          "The account changed while its opening balance was being established. Retry the command.",
        );
      }
      throw error;
    }

    if (!created) {
      const concurrentReplay = await this.repository.findTransactionByFingerprint(
        command.workspaceId,
        idempotencyFingerprint,
      );
      if (concurrentReplay) return this.resolveExistingOpeningBalanceSet(command, commandFingerprint, concurrentReplay);
      const currentAccount = await this.requireManagedAccount(command.workspaceId, account.id);
      if (currentAccount.archivedAt) {
        throw new DomainConflictError("ACCOUNT_UNAVAILABLE", "Archived accounts cannot receive an opening balance.");
      }
      if (await this.repository.findOpeningBalance(command.workspaceId, account.id)) {
        throw new DomainConflictError(
          "OPENING_BALANCE_ALREADY_EXISTS",
          "This account already has an opening balance. Use the correction command instead.",
        );
      }
      throw new DomainConflictError(
        "CONCURRENT_MODIFICATION",
        "The account changed while its opening balance was being established. Retry the command.",
      );
    }

    const openingBalance = await this.repository.findOpeningBalance(command.workspaceId, account.id);
    if (!openingBalance || openingBalance.currentTransactionId !== created.id) {
      throw new Error("Opening balance linkage verification failed.");
    }
    const audit = (await this.repository.listTransactionAudit(command.workspaceId, created.id)).find(
      (candidate) => candidate.id === write.audit.id,
    );
    if (!audit) throw new Error("Opening balance establishment was not audited.");
    return presentOpeningBalance(openingBalance);
  }

  /**
   * Financial corrections preserve the original opening event and append a
   * bookkeeping reversal plus replacement. V1 intentionally locks effectiveAt
   * after establishment so the account's historical chronology cannot move.
   */
  async correctOpeningBalance(
    actor: AuthenticatedActor,
    command: CorrectOpeningBalanceCommand,
  ): Promise<OpeningBalanceDTO> {
    await this.requireWorkspacePermission(actor.userId, command.workspaceId, "manage_ledger");
    if (command.newAmountMinor < 0n) {
      throw new DomainConflictError(
        "NEGATIVE_OPENING_BALANCE_NOT_ALLOWED",
        "This account type has no configured debt or overdraft semantics for a negative opening balance.",
      );
    }

    const commandFingerprint = openingBalanceCorrectionCommandFingerprint(command);
    const idempotencyKey = openingBalanceCorrectionIdempotencyKey(actor.userId, command.idempotencyKey);
    const replay = await this.repository.findTransactionCorrectionByIdempotencyKey(
      command.workspaceId,
      actor.userId,
      idempotencyKey,
    );
    if (replay) return this.resolveExistingOpeningBalanceCorrection(command, commandFingerprint, replay);

    const account = await this.requireManagedAccount(command.workspaceId, command.accountId);
    if (account.archivedAt) {
      throw new DomainConflictError("ACCOUNT_UNAVAILABLE", "Archived accounts cannot have their opening balance changed.");
    }
    const openingBalance = await this.repository.findOpeningBalance(command.workspaceId, account.id);
    if (!openingBalance) throw new NotFoundError("Opening balance not found for this account.");
    const original = openingBalance.transaction;
    if (original.kind !== "OPENING_BALANCE" || original.accountId !== account.id) {
      throw new Error("Opening balance linkage does not reference a valid ledger event.");
    }
    if (command.expectedVersion && original.updatedAt.getTime() !== command.expectedVersion.getTime()) {
      throw new DomainConflictError(
        "CONCURRENT_MODIFICATION",
        "The opening balance changed since it was loaded. Refresh it before correcting it.",
      );
    }
    if (command.newAmountMinor === original.amountMinor) {
      throw new DomainConflictError("INVALID_OPENING_BALANCE", "A correction must change the opening-balance amount.");
    }

    const correctionId = randomUUID();
    const reversal = createTransactionReversal(original, {
      actorUserId: actor.userId,
      purpose: "CORRECTION",
      operationId: correctionId,
      deduplicationFingerprint: correctionTransactionFingerprint(correctionId, "reversal"),
      reason: command.reason ?? null,
    });
    const replacement: CreateLedgerTransactionRecord = {
      id: randomUUID(),
      workspaceId: command.workspaceId,
      kind: "OPENING_BALANCE",
      status: "POSTED",
      amountMinor: command.newAmountMinor,
      currency: original.currency,
      occurredAt: original.occurredAt,
      accountId: account.id,
      transferAccountId: null,
      categoryId: null,
      merchantId: null,
      createdByUserId: actor.userId,
      paidByUserId: null,
      transferGroupId: null,
      refundedTransactionId: null,
      reversalOfTransactionId: null,
      source: {
        provider: "pace",
        origin: "OPENING_BALANCE",
        openingBalance: {
          operation: "CORRECTION_REPLACEMENT",
          commandFingerprint,
          originalTransactionId: original.id,
        },
      },
      deduplicationFingerprint: correctionTransactionFingerprint(correctionId, "replacement"),
      note: null,
    };
    const correction: CreateLedgerTransactionCorrectionRecord = {
      id: correctionId,
      workspaceId: command.workspaceId,
      originalTransactionId: original.id,
      reversalTransactionId: reversal.id,
      replacementTransactionId: replacement.id,
      actorUserId: actor.userId,
      idempotencyKey,
      commandFingerprint,
      reason: command.reason ?? null,
    };
    const audits = openingBalanceCorrectionAudits({
      actorUserId: actor.userId,
      accountId: account.id,
      correction,
      original,
      reversal,
      replacement,
    });

    let created;
    try {
      created = await this.repository.createFinancialCorrection({
        workspaceId: command.workspaceId,
        originalTransactionId: original.id,
        expectedOriginalUpdatedAt: command.expectedVersion,
        correction,
        reversal,
        replacement,
        historicalAccountIds: [account.id],
        allowHistoricalArchivedAccounts: false,
        spendabilityGuard: null,
        merchantToCreate: null,
        openingBalance: {
          accountId: account.id,
          expectedCurrentTransactionId: original.id,
        },
        audits,
      });
    } catch (error) {
      const concurrentReplay = await this.repository.findTransactionCorrectionByIdempotencyKey(
        command.workspaceId,
        actor.userId,
        idempotencyKey,
      );
      if (concurrentReplay) return this.resolveExistingOpeningBalanceCorrection(command, commandFingerprint, concurrentReplay);
      if (isSerializationFailure(error)) {
        throw new DomainConflictError(
          "CONCURRENT_MODIFICATION",
          "The opening balance changed while its correction was being saved. Retry the command.",
        );
      }
      throw error;
    }
    if (created.outcome !== "CREATED") {
      const concurrentReplay = await this.repository.findTransactionCorrectionByIdempotencyKey(
        command.workspaceId,
        actor.userId,
        idempotencyKey,
      );
      if (concurrentReplay) return this.resolveExistingOpeningBalanceCorrection(command, commandFingerprint, concurrentReplay);
      const currentAccount = await this.requireManagedAccount(command.workspaceId, account.id);
      if (currentAccount.archivedAt) {
        throw new DomainConflictError("ACCOUNT_UNAVAILABLE", "Archived accounts cannot have their opening balance changed.");
      }
      throw new DomainConflictError(
        "CONCURRENT_MODIFICATION",
        "The opening balance changed while its correction was being saved. Refresh and retry.",
      );
    }

    const current = await this.repository.findOpeningBalance(command.workspaceId, account.id);
    if (!current || current.currentTransactionId !== replacement.id) {
      throw new Error("Opening balance correction linkage verification failed.");
    }
    const auditIds = new Set(
      (await Promise.all(audits.map((audit) => this.repository.listTransactionAudit(command.workspaceId, audit.transactionId))))
        .flat()
        .map((audit) => audit.id),
    );
    if (audits.some((audit) => !auditIds.has(audit.id))) {
      throw new Error("Opening balance correction was not fully audited.");
    }
    return presentOpeningBalance(current);
  }

  async getAccountActionPolicy(
    actor: AuthenticatedActor,
    workspaceId: string,
    accountId: string,
  ): Promise<AccountActionPolicy> {
    const membership = await this.requireWorkspacePermission(actor.userId, workspaceId, "read");
    const account = await this.requireManagedAccount(workspaceId, accountId);
    const [hasFinancialActivity, openingBalance] = await Promise.all([
      this.repository.hasFinancialActivity(workspaceId, account.id),
      this.repository.findOpeningBalance(workspaceId, account.id),
    ]);
    return getAccountActionPolicy({
      account,
      workspaceRole: membership.role,
      hasFinancialActivity,
      hasOpeningBalance: Boolean(openingBalance),
    });
  }

  /**
   * Canonical account lifecycle command. It only ever changes descriptive
   * metadata, type under the policy's safe conditions, or archivedAt.
   */
  async manageAccount(
    actor: AuthenticatedActor,
    command: ManageAccountCommand,
  ): Promise<LedgerAccountRecord> {
    const membership = await this.requireWorkspacePermission(actor.userId, command.workspaceId, "manage_ledger");
    const commandFingerprint = accountManagementCommandFingerprint(command);
    const replay = await this.repository.findAccountAuditByIdempotencyKey(
      command.workspaceId,
      actor.userId,
      command.idempotencyKey,
    );
    if (replay) {
      if (
        replay.accountId !== command.accountId
        || replay.commandFingerprint !== commandFingerprint
        || replay.action !== accountAuditAction(command.action)
      ) {
        throw new DomainConflictError(
          "ACCOUNT_MANAGEMENT_IDEMPOTENCY_CONFLICT",
          "This idempotency key has already been used for another account management command.",
        );
      }
      return this.requireManagedAccount(command.workspaceId, command.accountId);
    }

    const account = await this.requireManagedAccount(command.workspaceId, command.accountId);
    const hasFinancialActivity = command.action === "CHANGE_TYPE"
      ? await this.repository.hasFinancialActivity(command.workspaceId, account.id)
      : false;
    const policy = getAccountActionPolicy({
      account,
      workspaceRole: membership.role,
      hasFinancialActivity,
    });

    switch (command.action) {
      case "RENAME":
        if (!policy.canRename) {
          throw new DomainConflictError("ACCOUNT_MANAGEMENT_NOT_ALLOWED", "This account cannot be renamed.");
        }
        if (command.name === account.name) return account;
        return this.persistAccountManagementMutation({
          account,
          command,
          commandFingerprint,
          requiredArchived: account.archivedAt !== null,
          name: command.name,
          audit: accountManagementAudit({
            actorUserId: actor.userId,
            workspaceId: command.workspaceId,
            accountId: account.id,
            action: "RENAMED",
            commandFingerprint,
            idempotencyKey: command.idempotencyKey,
            metadata: { before: { name: account.name }, after: { name: command.name } },
          }),
        });
      case "CHANGE_TYPE":
        if (command.type === account.type) return account;
        if (hasFinancialActivity) {
          throw new DomainConflictError(
            "ACCOUNT_HAS_FINANCIAL_ACTIVITY",
            "Account type is locked after the account has financial activity.",
          );
        }
        if (!policy.canChangeType || !isAccountTypeChangeAllowed(account.type, command.type, hasFinancialActivity)) {
          throw new DomainConflictError(
            "ACCOUNT_TYPE_CHANGE_NOT_ALLOWED",
            "The requested account type would change the account's spendability semantics.",
          );
        }
        return this.persistAccountManagementMutation({
          account,
          command,
          commandFingerprint,
          requiredArchived: account.archivedAt !== null,
          type: command.type,
          audit: accountManagementAudit({
            actorUserId: actor.userId,
            workspaceId: command.workspaceId,
            accountId: account.id,
            action: "TYPE_CHANGED",
            commandFingerprint,
            idempotencyKey: command.idempotencyKey,
            metadata: { before: { type: account.type }, after: { type: command.type } },
          }),
        });
      case "ARCHIVE":
        if (!policy.canArchive) {
          throw new DomainConflictError("ACCOUNT_ALREADY_ARCHIVED", "This account is already archived.");
        }
        return this.persistAccountManagementMutation({
          account,
          command,
          commandFingerprint,
          requiredArchived: false,
          archived: true,
          audit: accountManagementAudit({
            actorUserId: actor.userId,
            workspaceId: command.workspaceId,
            accountId: account.id,
            action: "ARCHIVED",
            commandFingerprint,
            idempotencyKey: command.idempotencyKey,
            metadata: { before: { status: "ACTIVE" }, after: { status: "ARCHIVED" } },
          }),
        });
      case "RESTORE":
        if (!policy.canRestore) {
          throw new DomainConflictError("ACCOUNT_NOT_ARCHIVED", "This account is not archived.");
        }
        return this.persistAccountManagementMutation({
          account,
          command,
          commandFingerprint,
          requiredArchived: true,
          archived: false,
          audit: accountManagementAudit({
            actorUserId: actor.userId,
            workspaceId: command.workspaceId,
            accountId: account.id,
            action: "RESTORED",
            commandFingerprint,
            idempotencyKey: command.idempotencyKey,
            metadata: { before: { status: "ARCHIVED" }, after: { status: "ACTIVE" } },
          }),
        });
    }
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
    this.assertGenericTransactionIsNotRefund(input);
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
    this.assertGenericTransactionIsNotRefund(input);
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
      const created = await this.persistTransaction(actor, workspaceId, parsed, { enforceSpendability: true });
      const persisted = await this.repository.findTransaction(workspaceId, created.id);
      if (!persisted) throw new Error("Financial transaction was not found after persistence.");
      return persisted;
    } catch (error) {
      const persisted = await this.repository.findTransactionByFingerprint(workspaceId, fingerprint);
      if (persisted) return persisted;
      if (isSerializationFailure(error)) {
        throw new DomainConflictError(
          "CONCURRENT_MODIFICATION",
          "The account changed while this financial operation was being saved. Retry the operation.",
        );
      }
      throw error;
    }
  }

  private async persistTransaction(
    actor: AuthenticatedActor,
    workspaceId: string,
    parsed: CreateLedgerTransactionInput,
    options: { readonly enforceSpendability?: boolean } = {},
  ): Promise<LedgerTransactionRecord> {
    const prepared = await this.prepareCanonicalTransaction(actor, workspaceId, parsed);
    // All real-time writes go through the account-locking repository command.
    // Import paths may opt out of a debit floor, never out of active-account
    // validation or the atomic account lock.
    const spendabilityGuard = options.enforceSpendability && prepared.debitAccount
      ? debitSpendabilityGuard(prepared.debitAccount, prepared.transaction.amountMinor)
      : null;
    const result = await this.repository.createTransactionWithSpendability({
      transaction: prepared.transaction,
      merchantToCreate: prepared.merchant,
      spendabilityGuard,
    });
    if (result.outcome === "INSUFFICIENT_FUNDS") throw new InsufficientFundsError(result.spendability);
    if (result.outcome === "ACCOUNT_UNAVAILABLE") {
      throw new DomainConflictError(
        "ACCOUNT_UNAVAILABLE",
        "An archived account cannot accept new financial transactions.",
      );
    }
    return result.transaction;
  }

  private async prepareCanonicalTransaction(
    actor: AuthenticatedActor,
    workspaceId: string,
    parsed: CreateLedgerTransactionInput,
  ): Promise<{
    transaction: CreateLedgerTransactionRecord;
    merchant: CreateLedgerMerchantRecord | null;
    /** Present only for new voluntary Expense and Transfer debit legs. */
    debitAccount: LedgerAccountRecord | null;
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
      }, merchant: null, debitAccount: fromAccount };
    }

    const account = await this.requireAccount(workspaceId, parsed.accountId);
    this.assertCurrencyMatchesAccount(common.currency, account);

    if (parsed.kind === "REFUND") {
      throw new DomainConflictError(
        "REFUND_CANONICAL_OPERATION_REQUIRED",
        "Refunds must be created through the canonical refund operation.",
      );
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
      debitAccount: parsed.kind === "EXPENSE" ? account : null,
    };
  }

  async createRefund(
    actor: AuthenticatedActor,
    command: CreateRefundCommand,
  ): Promise<LedgerFinancialRefundResult> {
    const membership = await this.requireWorkspacePermission(actor.userId, command.workspaceId, "manage_ledger");
    const fingerprint = refundIdempotencyFingerprint(actor.userId, command.idempotencyKey);
    const commandFingerprint = refundCommandFingerprint(command);
    const replay = await this.repository.findTransactionByFingerprint(command.workspaceId, fingerprint);
    if (replay) return this.resolveExistingRefund(command, commandFingerprint, replay);

    const sourceExpense = await this.requireTransaction(command.workspaceId, command.expenseTransactionId);
    await this.assertRefundSourceIsCurrent(command.workspaceId, sourceExpense);
    if (sourceExpense.kind !== "EXPENSE") {
      throw new DomainConflictError("SOURCE_NOT_EXPENSE", "Refunds can only be created for expenses.");
    }
    if (!sourceExpense.accountId) {
      throw new DomainConflictError("REFUND_NOT_ALLOWED", "This expense has no account that can receive a refund.");
    }
    if (sourceExpense.currency !== command.currency) {
      throw new DomainConflictError("INVALID_CURRENCY", "A refund must use the currency of its source expense.");
    }
    const destinationAccount = await this.requireRefundAccount(
      command.workspaceId,
      command.accountId ?? sourceExpense.accountId,
    );
    this.assertCurrencyMatchesAccount(command.currency, destinationAccount);

    const aggregate = await this.getRefundAggregate(command.workspaceId, sourceExpense);
    const capabilities = getTransactionCapabilities({
      transaction: sourceExpense,
      workspaceRole: membership.role,
      refundedAmountMinor: aggregate.total.minor,
      isCurrentEffective: true,
    });
    if (!capabilities.canRefund) {
      if (aggregate.total.minor >= money(sourceExpense.currency, sourceExpense.amountMinor).minor) {
        throw new DomainConflictError(
          "EXPENSE_ALREADY_FULLY_REFUNDED",
          "This expense has already been fully refunded.",
        );
      }
      throw new DomainConflictError("REFUND_NOT_ALLOWED", "This expense cannot be refunded.");
    }

    const refundMoney = money(command.currency, command.amountMinor);
    if (add(aggregate.total, refundMoney).minor > money(sourceExpense.currency, sourceExpense.amountMinor).minor) {
      throw new DomainConflictError(
        "REFUND_EXCEEDS_REMAINING_AMOUNT",
        "The refund amount exceeds the remaining refundable amount.",
      );
    }

    if (!sourceExpense.categoryId) {
      throw new DomainConflictError("REFUND_NOT_ALLOWED", "This expense has no refundable category attribution.");
    }

    const refundId = randomUUID();
    const refund: CreateLedgerFinancialRefundRecord = {
      workspaceId: command.workspaceId,
      sourceExpenseId: sourceExpense.id,
      refund: {
        id: refundId,
        workspaceId: command.workspaceId,
        kind: "REFUND",
        status: "POSTED",
        amountMinor: refundMoney.minor,
        currency: refundMoney.currency,
        occurredAt: command.occurredAt,
        accountId: destinationAccount.id,
        transferAccountId: null,
        // REFUND already has canonical attribution fields. Reuse the source
        // attribution; no synthetic "Refund" category or merchant is made.
        categoryId: sourceExpense.categoryId,
        merchantId: sourceExpense.merchantId,
        createdByUserId: actor.userId,
        paidByUserId: actor.userId,
        transferGroupId: null,
        refundedTransactionId: sourceExpense.id,
        reversalOfTransactionId: null,
        source: {
          provider: "manual",
          origin: "REFUND",
          commandFingerprint,
          refund: {
            sourceExpenseId: sourceExpense.id,
            reason: command.reason ?? null,
          },
        },
        deduplicationFingerprint: fingerprint,
        note: command.note ?? null,
      },
      audits: refundAudits({
        actorUserId: actor.userId,
        sourceExpense,
        refundTransactionId: refundId,
        amountMinor: refundMoney.minor,
        currency: refundMoney.currency,
        reason: command.reason ?? null,
      }),
    };

    let created: LedgerTransactionRecord | null;
    try {
      created = await this.repository.createFinancialRefund(refund);
    } catch (error) {
      const concurrentReplay = await this.repository.findTransactionByFingerprint(command.workspaceId, fingerprint);
      if (concurrentReplay) return this.resolveExistingRefund(command, commandFingerprint, concurrentReplay);
      if (isSerializationFailure(error)) {
        throw new DomainConflictError(
          "CONCURRENT_MODIFICATION",
          "The expense changed while the refund was being saved. Retry the refund.",
        );
      }
      throw error;
    }

    if (!created) {
      const concurrentReplay = await this.repository.findTransactionByFingerprint(command.workspaceId, fingerprint);
      if (concurrentReplay) return this.resolveExistingRefund(command, commandFingerprint, concurrentReplay);
      // A refund is new financial activity. Re-check its destination after an
      // atomic candidate failure so an archive race returns ACCOUNT_UNAVAILABLE
      // instead of a vague concurrency error.
      await this.requireRefundAccount(command.workspaceId, destinationAccount.id);
      return this.resolveRefundSaveConflict(command, sourceExpense.id);
    }

    return this.verifyAndPresentRefund(command.workspaceId, sourceExpense, refund, created);
  }

  async correctTransaction(
    actor: AuthenticatedActor,
    command: CorrectTransactionCommand,
  ): Promise<LedgerFinancialCorrectionResult> {
    const membership = await this.requireWorkspacePermission(actor.userId, command.workspaceId, "manage_ledger");
    const workspace = await this.workspaces.findMemberContext(command.workspaceId, actor.userId);
    if (!workspace) throw new AuthorizationError("You are not a member of this workspace.");
    const idempotencyKey = correctionIdempotencyKey(actor.userId, command.idempotencyKey);
    const commandFingerprint = correctionCommandFingerprint(command);

    const replay = await this.repository.findTransactionCorrectionByIdempotencyKey(
      command.workspaceId,
      actor.userId,
      idempotencyKey,
    );
    if (replay) return this.resolveExistingCorrection(command, commandFingerprint, replay);

    const original = await this.requireTransaction(command.workspaceId, command.transactionId);
    if (original.reversalOfTransactionId !== null) {
      throw new DomainConflictError(
        "TRANSACTION_NOT_CURRENT",
        "A reversal record is a technical ledger entry and cannot be corrected.",
      );
    }
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
    if (await this.repository.findTransactionReversalByOriginal(command.workspaceId, original.id)) {
      throw new DomainConflictError(
        "TRANSACTION_ALREADY_REVERSED",
        "This transaction has already been reversed and cannot be corrected.",
      );
    }

    const refundAggregate = original.kind === "EXPENSE"
      ? await this.getRefundAggregate(command.workspaceId, original)
      : null;
    const refundedAmountMinor = refundAggregate?.total.minor ?? 0n;
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
    const details = await this.resolveTransactionDetailsPatch(
      actor,
      command.workspaceId,
      original,
      command.details ?? {},
      workspace.preferences.timezone,
    );
    const replacementInput = this.buildCorrectionReplacementInput(original, command, correctionId, details);
    if (
      replacementInput.kind === "EXPENSE"
      && refundAggregate
      && replacementInput.amountMinor < refundAggregate.total.minor
    ) {
      throw new DomainConflictError(
        "CORRECTED_AMOUNT_BELOW_REFUNDED_TOTAL",
        "A corrected expense cannot be less than refunds already issued against it.",
      );
    }
    await this.assertCorrectionReplacementAccounts(command.workspaceId, replacementInput, original);
    const replacement = await this.prepareCanonicalTransaction(actor, command.workspaceId, replacementInput);
    const spendabilityGuard = replacement.debitAccount
      ? debitSpendabilityGuard(replacement.debitAccount, replacement.transaction.amountMinor)
      : null;
    const reversal = createTransactionReversal(original, {
      actorUserId: actor.userId,
      purpose: "CORRECTION",
      operationId: correctionId,
      deduplicationFingerprint: correctionTransactionFingerprint(correctionId, "reversal"),
      reason: command.reason ?? null,
    });
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
        historicalAccountIds: [original.accountId, original.transferAccountId].filter(
          (accountId): accountId is string => accountId !== null,
        ),
        allowHistoricalArchivedAccounts: true,
        spendabilityGuard,
        merchantToCreate: replacement.merchant,
        openingBalance: null,
        audits,
      });
    } catch (error) {
      const concurrentReplay = await this.repository.findTransactionCorrectionByIdempotencyKey(
        command.workspaceId,
        actor.userId,
        idempotencyKey,
      );
      if (concurrentReplay) return this.resolveExistingCorrection(command, commandFingerprint, concurrentReplay);
      if (isSerializationFailure(error)) {
        throw new DomainConflictError(
          "CONCURRENT_MODIFICATION",
          "The account changed while this correction was being saved. Retry the correction.",
        );
      }
      throw error;
    }

    if (created.outcome === "INSUFFICIENT_FUNDS") {
      throw new InsufficientFundsError(created.spendability);
    }

    if (created.outcome === "CONFLICT") {
      const concurrentReplay = await this.repository.findTransactionCorrectionByIdempotencyKey(
        command.workspaceId,
        actor.userId,
        idempotencyKey,
      );
      if (concurrentReplay) return this.resolveExistingCorrection(command, commandFingerprint, concurrentReplay);
      await this.assertCorrectionReplacementAccounts(command.workspaceId, replacementInput, original);
      if (await this.repository.findTransactionCorrectionByOriginal(command.workspaceId, original.id)) {
        throw new DomainConflictError(
          "TRANSACTION_NOT_CURRENT",
          "This transaction was corrected by another request. Refresh before correcting again.",
        );
      }
      if (await this.repository.findTransactionReversalByOriginal(command.workspaceId, original.id)) {
        throw new DomainConflictError(
          "TRANSACTION_ALREADY_REVERSED",
          "This transaction was manually reversed by another request.",
        );
      }
      if (replacementInput.kind === "EXPENSE") {
        const currentRefunds = await this.getRefundAggregate(command.workspaceId, original);
        if (replacementInput.amountMinor < currentRefunds.total.minor) {
          throw new DomainConflictError(
            "CORRECTED_AMOUNT_BELOW_REFUNDED_TOTAL",
            "A corrected expense cannot be less than refunds already issued against it.",
          );
        }
      }
      throw new DomainConflictError(
        "CONCURRENT_MODIFICATION",
        "This transaction changed while its correction was being saved.",
      );
    }

    const result = await this.hydrateCorrection(created.correction);
    assertVerifiedFinancialCorrection(result, original, replacement.transaction, replacement.merchant !== null);
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

  async reverseTransaction(
    actor: AuthenticatedActor,
    command: ReverseTransactionCommand,
  ): Promise<LedgerFinancialReversalResult> {
    const membership = await this.requireWorkspacePermission(actor.userId, command.workspaceId, "manage_ledger");
    const idempotencyFingerprint = manualReversalIdempotencyFingerprint(actor.userId, command.idempotencyKey);
    const commandFingerprint = manualReversalCommandFingerprint(command);

    const replay = await this.repository.findTransactionByFingerprint(command.workspaceId, idempotencyFingerprint);
    if (replay) return this.resolveExistingManualReversal(command, commandFingerprint, replay);

    const original = await this.requireTransaction(command.workspaceId, command.transactionId);
    if (original.reversalOfTransactionId !== null) {
      throw new DomainConflictError(
        "TRANSACTION_NOT_CURRENT",
        "A reversal record is a technical ledger entry and cannot be manually reversed.",
      );
    }
    if (
      command.expectedUpdatedAt
      && original.updatedAt.getTime() !== command.expectedUpdatedAt.getTime()
    ) {
      throw new DomainConflictError(
        "CONCURRENT_MODIFICATION",
        "This transaction changed since it was loaded. Refresh it before reversing it.",
      );
    }

    const [outgoingCorrection, enclosingCorrection, existingReversal] = await Promise.all([
      this.repository.findTransactionCorrectionByOriginal(command.workspaceId, original.id),
      this.repository.findTransactionCorrectionByTransactionId(command.workspaceId, original.id),
      this.repository.findTransactionReversalByOriginal(command.workspaceId, original.id),
    ]);
    if (original.reversalOfTransactionId !== null || enclosingCorrection?.reversalTransactionId === original.id) {
      throw new DomainConflictError(
        "TRANSACTION_NOT_CURRENT",
        "A technical reversal cannot be manually reversed.",
      );
    }
    if (outgoingCorrection) {
      throw new DomainConflictError(
        "TRANSACTION_NOT_CURRENT",
        "This transaction has been corrected. Reverse the current replacement instead.",
      );
    }
    if (existingReversal) {
      throw new DomainConflictError(
        "TRANSACTION_ALREADY_REVERSED",
        "This transaction has already been manually reversed.",
      );
    }

    const refundAggregate = original.kind === "EXPENSE"
      ? await this.getRefundAggregate(command.workspaceId, original)
      : null;
    const capabilities = getTransactionCapabilities({
      transaction: original,
      workspaceRole: membership.role,
      refundedAmountMinor: refundAggregate?.total.minor ?? 0n,
      isCurrentEffective: true,
    });
    if (!capabilities.canReverse) {
      if (refundAggregate && refundAggregate.total.minor > 0n) {
        throw new DomainConflictError(
          "TRANSACTION_HAS_ACTIVE_REFUNDS",
          "An expense with active refunds cannot be manually reversed.",
        );
      }
      throw new DomainConflictError(
        "TRANSACTION_REVERSAL_NOT_ALLOWED",
        "This transaction cannot be manually reversed in its current state.",
      );
    }

    const reversal = createTransactionReversal(original, {
      actorUserId: actor.userId,
      purpose: "MANUAL",
      operationId: randomUUID(),
      deduplicationFingerprint: idempotencyFingerprint,
      reason: command.reason ?? null,
      commandFingerprint,
    });
    const reversalRecord: CreateLedgerFinancialReversalRecord = {
      workspaceId: command.workspaceId,
      originalTransactionId: original.id,
      expectedOriginalUpdatedAt: command.expectedUpdatedAt,
      reversal,
      audits: manualReversalAudits({ actorUserId: actor.userId, original, reversal, reason: command.reason ?? null }),
    };

    let created: LedgerTransactionRecord | null;
    try {
      created = await this.repository.createFinancialReversal(reversalRecord);
    } catch (error) {
      const concurrentReplay = await this.repository.findTransactionByFingerprint(command.workspaceId, idempotencyFingerprint);
      if (concurrentReplay) return this.resolveExistingManualReversal(command, commandFingerprint, concurrentReplay);
      if (isSerializationFailure(error)) {
        throw new DomainConflictError(
          "CONCURRENT_MODIFICATION",
          "The transaction changed while its reversal was being saved. Retry the reversal.",
        );
      }
      throw error;
    }

    if (!created) {
      const concurrentReplay = await this.repository.findTransactionByFingerprint(command.workspaceId, idempotencyFingerprint);
      if (concurrentReplay) return this.resolveExistingManualReversal(command, commandFingerprint, concurrentReplay);
      const current = await this.requireTransaction(command.workspaceId, original.id);
      if (
        command.expectedUpdatedAt
        && current.updatedAt.getTime() !== command.expectedUpdatedAt.getTime()
      ) {
        throw new DomainConflictError(
          "CONCURRENT_MODIFICATION",
          "This transaction changed while its reversal was being saved.",
        );
      }
      if (await this.repository.findTransactionCorrectionByOriginal(command.workspaceId, original.id)) {
        throw new DomainConflictError(
          "TRANSACTION_NOT_CURRENT",
          "This transaction was corrected by another request. Refresh before reversing it.",
        );
      }
      if (await this.repository.findTransactionReversalByOriginal(command.workspaceId, original.id)) {
        throw new DomainConflictError(
          "TRANSACTION_ALREADY_REVERSED",
          "This transaction was already reversed by another request.",
        );
      }
      throw new DomainConflictError(
        "CONCURRENT_MODIFICATION",
        "This transaction changed while its reversal was being saved.",
      );
    }

    const result: LedgerFinancialReversalResult = {
      originalTransaction: original,
      reversalTransaction: created,
      effectiveState: "REVERSED",
    };
    assertVerifiedFinancialReversal(result);
    const auditIds = new Set(
      (await Promise.all([
        this.repository.listTransactionAudit(command.workspaceId, original.id),
        this.repository.listTransactionAudit(command.workspaceId, created.id),
      ])).flat().map((audit) => audit.id),
    );
    if (reversalRecord.audits.some((audit) => !auditIds.has(audit.id))) {
      throw new Error("Manual reversal audit verification failed.");
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
    } else if (current.reversalOfTransactionId !== null) {
      throw new DomainConflictError(
        "TRANSACTION_NOT_CURRENT",
        "A reversal record is a technical ledger entry and has no effective financial version.",
      );
    }
    const visited = new Set<string>();
    while (true) {
      if (visited.has(current.id)) throw new Error("Correction chain contains a cycle.");
      visited.add(current.id);
      const correction = await this.repository.findTransactionCorrectionByOriginal(workspaceId, current.id);
      if (!correction) {
        if (await this.repository.findTransactionReversalByOriginal(workspaceId, current.id)) {
          throw new DomainConflictError(
            "TRANSACTION_ALREADY_REVERSED",
            "This transaction has no current effective financial version because it was manually reversed.",
          );
        }
        return current;
      }
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
    const [outgoingCorrection, existingReversal] = await Promise.all([
      this.repository.findTransactionCorrectionByOriginal(workspaceId, transaction.id),
      this.repository.findTransactionReversalByOriginal(workspaceId, transaction.id),
    ]);
    const refundedAmountMinor = (await this.repository.listRefundsForTransaction(workspaceId, transaction.id)).reduce(
      (total, refund) => total + refund.amountMinor,
      0n,
    );
    const capabilities = getTransactionCapabilities({
      transaction,
      workspaceRole: membership.role,
      refundedAmountMinor,
      isCurrentEffective: transaction.reversalOfTransactionId === null && !outgoingCorrection && !existingReversal,
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
    details: {
      categoryId: string | null;
      merchantId: string | null;
      occurredAt: Date;
      note: string | null;
      merchantToCreate: CreateLedgerMerchantRecord | null;
    },
  ): CreateLedgerTransactionInput {
    const common = {
      status: "POSTED" as const,
      amountMinor: command.financialChanges.amountMinor ?? original.amountMinor,
      currency: toCurrencyCode(original.currency),
      occurredAt: details.occurredAt,
      paidByUserId: original.paidByUserId ?? undefined,
      source: correctionSource(original.source, "REPLACEMENT", correctionId, original.id) as CreateLedgerTransactionInput["source"],
      deduplicationFingerprint: correctionTransactionFingerprint(correctionId, "replacement"),
      note: details.note ?? undefined,
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
          categoryId: details.categoryId ?? undefined,
          ...(details.merchantToCreate
            ? { merchantName: details.merchantToCreate.name }
            : details.merchantId
              ? { merchantId: details.merchantId }
              : {}),
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
          categoryId: details.categoryId ?? undefined,
          ...(details.merchantToCreate
            ? { merchantName: details.merchantToCreate.name }
            : details.merchantId
              ? { merchantId: details.merchantId }
              : {}),
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
    original: LedgerTransactionRecord,
  ): Promise<void> {
    const historicalAccountIds = new Set([original.accountId, original.transferAccountId].filter(
      (accountId): accountId is string => accountId !== null,
    ));
    const assertAccount = async (accountId: string, label: string) => {
      const account = await this.repository.findAccount(workspaceId, accountId);
      if (account) {
        // A correction may retain an archived account from the original
        // record, because it is repairing historical truth. It may never
        // introduce a newly selected archived account.
        if (account.archivedAt && !historicalAccountIds.has(account.id)) {
          throw new ConflictError("Archived accounts cannot accept new transactions.");
        }
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

  private async resolveExistingOpeningBalanceSet(
    command: SetOpeningBalanceCommand,
    commandFingerprint: string,
    transaction: LedgerTransactionRecord,
  ): Promise<OpeningBalanceDTO> {
    const metadata = transaction.source.openingBalance;
    if (
      transaction.kind !== "OPENING_BALANCE"
      || transaction.accountId !== command.accountId
      || !isOpeningBalanceSetMetadata(metadata, commandFingerprint)
    ) {
      throw new DomainConflictError(
        "OPENING_BALANCE_ALREADY_PROCESSED",
        "This idempotency key has already been used for another opening-balance command.",
      );
    }
    const current = await this.repository.findOpeningBalance(command.workspaceId, command.accountId);
    if (!current) throw new Error("Opening balance idempotency record has no opening-balance linkage.");
    return presentOpeningBalance(current);
  }

  private async resolveExistingOpeningBalanceCorrection(
    command: CorrectOpeningBalanceCommand,
    commandFingerprint: string,
    correction: import("./domain").LedgerTransactionCorrectionRecord,
  ): Promise<OpeningBalanceDTO> {
    const original = await this.requireTransaction(command.workspaceId, correction.originalTransactionId);
    if (
      correction.commandFingerprint !== commandFingerprint
      || original.kind !== "OPENING_BALANCE"
      || original.accountId !== command.accountId
    ) {
      throw new DomainConflictError(
        "OPENING_BALANCE_ALREADY_PROCESSED",
        "This idempotency key has already been used for another opening-balance correction.",
      );
    }
    const current = await this.repository.findOpeningBalance(command.workspaceId, command.accountId);
    if (!current) throw new Error("Opening-balance correction has no current opening-balance linkage.");
    return presentOpeningBalance(current);
  }

  private async resolveExistingManualReversal(
    command: ReverseTransactionCommand,
    commandFingerprint: string,
    reversal: LedgerTransactionRecord,
  ): Promise<LedgerFinancialReversalResult> {
    if (
      reversal.kind === "REFUND"
      || reversal.status !== "POSTED"
      || reversal.reversalOfTransactionId !== command.transactionId
      || !isManualReversalMetadata(reversal.source.manualReversal, commandFingerprint)
    ) {
      throw new DomainConflictError(
        "REVERSAL_ALREADY_PROCESSED",
        "This reversal idempotency key has already been used for another command.",
      );
    }
    const originalTransaction = await this.requireTransaction(command.workspaceId, reversal.reversalOfTransactionId);
    const result: LedgerFinancialReversalResult = {
      originalTransaction,
      reversalTransaction: reversal,
      effectiveState: "REVERSED",
    };
    assertVerifiedFinancialReversal(result);
    return result;
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

  private assertGenericTransactionIsNotRefund(input: unknown): void {
    if (
      input
      && typeof input === "object"
      && !Array.isArray(input)
      && (input as { kind?: unknown }).kind === "REFUND"
    ) {
      throw new DomainConflictError(
        "REFUND_CANONICAL_OPERATION_REQUIRED",
        "Refunds must be created through the canonical refund operation.",
      );
    }
  }

  private async assertRefundSourceIsCurrent(
    workspaceId: string,
    transaction: LedgerTransactionRecord,
  ): Promise<void> {
    const [outgoingCorrection, enclosingCorrection, reversal] = await Promise.all([
      this.repository.findTransactionCorrectionByOriginal(workspaceId, transaction.id),
      this.repository.findTransactionCorrectionByTransactionId(workspaceId, transaction.id),
      this.repository.findTransactionReversalByOriginal(workspaceId, transaction.id),
    ]);
    if (
      transaction.reversalOfTransactionId !== null
      || outgoingCorrection !== null
      || enclosingCorrection?.reversalTransactionId === transaction.id
      || reversal !== null
    ) {
      throw new DomainConflictError(
        "TRANSACTION_NOT_CURRENT",
        "Refunds must be attached to the current effective expense.",
      );
    }
  }

  private async requireRefundAccount(
    workspaceId: string,
    accountId: string,
  ): Promise<LedgerAccountRecord> {
    const account = await this.repository.findAccount(workspaceId, accountId);
    if (account) {
      if (account.archivedAt) throw new ConflictError("Archived accounts cannot accept new transactions.");
      return account;
    }
    if (await this.repository.findAccountById(accountId)) {
      throw new DomainConflictError(
        "ACCOUNT_WORKSPACE_MISMATCH",
        "Refund account does not belong to this workspace.",
      );
    }
    throw new NotFoundError("Refund account not found in this workspace.");
  }

  private async getRefundAggregate(
    workspaceId: string,
    sourceExpense: LedgerTransactionRecord,
  ): Promise<{
    refunds: readonly LedgerTransactionRecord[];
    total: ReturnType<typeof money>;
    remaining: ReturnType<typeof money>;
  }> {
    const expenseAmount = money(sourceExpense.currency, sourceExpense.amountMinor);
    const refunds = await this.repository.listRefundsForEffectiveExpense(workspaceId, sourceExpense.id);
    const total = sum(
      refunds.map((refund) => money(refund.currency, refund.amountMinor)),
      { currency: expenseAmount.currency },
    );
    return {
      refunds,
      total,
      remaining: subtract(expenseAmount, total),
    };
  }

  private async resolveExistingRefund(
    command: CreateRefundCommand,
    commandFingerprint: string,
    refund: LedgerTransactionRecord,
  ): Promise<LedgerFinancialRefundResult> {
    if (
      refund.kind !== "REFUND"
      || refund.status !== "POSTED"
      || refund.refundedTransactionId !== command.expenseTransactionId
      || refund.source.commandFingerprint !== commandFingerprint
    ) {
      throw new DomainConflictError(
        "REFUND_ALREADY_PROCESSED",
        "This refund idempotency key has already been used for another command.",
      );
    }
    const sourceExpense = await this.requireTransaction(command.workspaceId, refund.refundedTransactionId);
    return this.verifyAndPresentRefund(
      command.workspaceId,
      sourceExpense,
      {
        refund,
        audits: [],
      },
      refund,
    );
  }

  private async resolveRefundSaveConflict(
    command: CreateRefundCommand,
    sourceExpenseId: string,
  ): Promise<never> {
    const current = await this.requireTransaction(command.workspaceId, sourceExpenseId);
    await this.assertRefundSourceIsCurrent(command.workspaceId, current);
    if (current.kind !== "EXPENSE") {
      throw new DomainConflictError("SOURCE_NOT_EXPENSE", "Refunds can only be created for expenses.");
    }
    const aggregate = await this.getRefundAggregate(command.workspaceId, current);
    const expenseAmount = money(current.currency, current.amountMinor);
    if (aggregate.total.minor >= expenseAmount.minor) {
      throw new DomainConflictError(
        "EXPENSE_ALREADY_FULLY_REFUNDED",
        "This expense has already been fully refunded.",
      );
    }
    if (
      current.currency !== command.currency
      || add(aggregate.total, money(command.currency, command.amountMinor)).minor > expenseAmount.minor
    ) {
      throw new DomainConflictError(
        "REFUND_EXCEEDS_REMAINING_AMOUNT",
        "The refund amount exceeds the remaining refundable amount.",
      );
    }
    throw new DomainConflictError(
      "CONCURRENT_MODIFICATION",
      "The expense changed while the refund was being saved. Retry the refund.",
    );
  }

  private async verifyAndPresentRefund(
    workspaceId: string,
    sourceExpense: LedgerTransactionRecord,
    requested: Pick<CreateLedgerFinancialRefundRecord, "refund"> & {
      audits: readonly CreateLedgerTransactionAuditRecord[];
    },
    refund: LedgerTransactionRecord,
  ): Promise<LedgerFinancialRefundResult> {
    const aggregate = await this.getRefundAggregate(workspaceId, sourceExpense);
    const persistedAudits = requested.audits.length === 0
      ? null
      : (await Promise.all([
          this.repository.listTransactionAudit(workspaceId, sourceExpense.id),
          this.repository.listTransactionAudit(workspaceId, refund.id),
        ])).flat();
    assertVerifiedFinancialRefund({ sourceExpense, requested, refund, aggregate, persistedAudits });
    return {
      refundTransaction: refund,
      sourceExpenseId: sourceExpense.id,
      effectiveExpenseAmountMinor: sourceExpense.amountMinor,
      totalRefundedMinor: aggregate.total.minor,
      remainingRefundableMinor: aggregate.remaining.minor,
      refundStatus: refundStatusFor(aggregate.total.minor, sourceExpense.amountMinor),
    };
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

  private async persistAccountManagementMutation(
    input: {
      readonly account: LedgerAccountRecord;
      readonly command: ManageAccountCommand;
      readonly commandFingerprint: string;
      readonly requiredArchived: boolean | undefined;
      readonly name?: string;
      readonly type?: LedgerAccountRecord["type"];
      readonly archived?: boolean;
      readonly audit: CreateLedgerAccountAuditRecord;
    },
  ): Promise<LedgerAccountRecord> {
    const mutation: MutateLedgerAccountRecord = {
      workspaceId: input.command.workspaceId,
      accountId: input.account.id,
      expectedUpdatedAt: input.command.expectedUpdatedAt,
      requiredArchived: input.requiredArchived,
      requireNoFinancialActivity: input.command.action === "CHANGE_TYPE",
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.archived !== undefined ? { archived: input.archived } : {}),
      audit: input.audit,
    };

    let updated: LedgerAccountRecord | null;
    try {
      updated = await this.repository.mutateAccount(mutation);
    } catch (error) {
      const replay = await this.repository.findAccountAuditByIdempotencyKey(
        input.command.workspaceId,
        input.audit.actorUserId,
        input.command.idempotencyKey,
      );
      if (replay) {
        if (
          replay.accountId !== input.account.id
          || replay.commandFingerprint !== input.commandFingerprint
          || replay.action !== input.audit.action
        ) {
          throw new DomainConflictError(
            "ACCOUNT_MANAGEMENT_IDEMPOTENCY_CONFLICT",
            "This idempotency key has already been used for another account management command.",
          );
        }
        return this.requireManagedAccount(input.command.workspaceId, input.account.id);
      }
      if (isSerializationFailure(error)) {
        throw new DomainConflictError(
          "CONCURRENT_MODIFICATION",
          "The account changed while this management command was being saved. Retry the operation.",
        );
      }
      throw error;
    }
    if (updated) return updated;

    const current = await this.requireManagedAccount(input.command.workspaceId, input.account.id);
    if (
      input.command.expectedUpdatedAt
      && current.updatedAt.getTime() !== input.command.expectedUpdatedAt.getTime()
    ) {
      throw new DomainConflictError(
        "CONCURRENT_MODIFICATION",
        "This account changed since it was loaded. Refresh it before managing the account.",
      );
    }
    if (input.command.action === "CHANGE_TYPE" && await this.repository.hasFinancialActivity(
      input.command.workspaceId,
      input.account.id,
    )) {
      throw new DomainConflictError(
        "ACCOUNT_HAS_FINANCIAL_ACTIVITY",
        "Account type is locked after the account has financial activity.",
      );
    }
    if (input.command.action === "ARCHIVE" && current.archivedAt) {
      throw new DomainConflictError("ACCOUNT_ALREADY_ARCHIVED", "This account is already archived.");
    }
    if (input.command.action === "RESTORE" && !current.archivedAt) {
      throw new DomainConflictError("ACCOUNT_NOT_ARCHIVED", "This account is not archived.");
    }
    throw new DomainConflictError(
      "CONCURRENT_MODIFICATION",
      "The account changed while this management command was being saved. Retry the operation.",
    );
  }

  private async requireManagedAccount(
    workspaceId: string,
    accountId: string,
  ): Promise<LedgerAccountRecord> {
    const account = await this.repository.findAccount(workspaceId, accountId);
    if (account) return account;
    if (await this.repository.findAccountById(accountId)) {
      throw new DomainConflictError(
        "ACCOUNT_WORKSPACE_MISMATCH",
        "Account does not belong to this workspace.",
      );
    }
    throw new NotFoundError("Account not found in this workspace.");
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

export interface LedgerFinancialReversalResult {
  originalTransaction: LedgerTransactionRecord;
  reversalTransaction: LedgerTransactionRecord;
  effectiveState: "REVERSED";
}

export interface LedgerFinancialRefundResult {
  refundTransaction: LedgerTransactionRecord;
  sourceExpenseId: string;
  effectiveExpenseAmountMinor: bigint;
  totalRefundedMinor: bigint;
  remainingRefundableMinor: bigint;
  refundStatus: RefundStatus;
}

function refundAudits({
  actorUserId,
  sourceExpense,
  refundTransactionId,
  amountMinor,
  currency,
  reason,
}: {
  actorUserId: string;
  sourceExpense: LedgerTransactionRecord;
  refundTransactionId: string;
  amountMinor: bigint;
  currency: string;
  reason: string | null;
}): readonly [CreateLedgerTransactionAuditRecord, CreateLedgerTransactionAuditRecord] {
  const linkage = {
    sourceExpenseId: sourceExpense.id,
    refundTransactionId,
    amountMinor: amountMinor.toString(),
    currency,
    reason,
  };
  return [
    {
      id: randomUUID(),
      workspaceId: sourceExpense.workspaceId,
      transactionId: sourceExpense.id,
      actorUserId,
      action: "REFUND_ISSUED",
      metadata: linkage,
    },
    {
      id: randomUUID(),
      workspaceId: sourceExpense.workspaceId,
      transactionId: refundTransactionId,
      actorUserId,
      action: "REFUND_CREATED",
      metadata: linkage,
    },
  ];
}

function refundIdempotencyFingerprint(actorUserId: string, idempotencyKey: string): string {
  const digest = createHash("sha256")
    .update(`${actorUserId}:${idempotencyKey}`)
    .digest("hex");
  return `refund:${digest}`;
}

function accountManagementCommandFingerprint(command: ManageAccountCommand): string {
  return createHash("sha256")
    .update(stableJson({
      workspaceId: command.workspaceId,
      accountId: command.accountId,
      action: command.action,
      ...(command.action === "RENAME" ? { name: command.name } : {}),
      ...(command.action === "CHANGE_TYPE" ? { type: command.type } : {}),
      expectedUpdatedAt: command.expectedUpdatedAt?.toISOString() ?? null,
    }))
    .digest("hex");
}

function accountAuditAction(action: ManageAccountCommand["action"]): CreateLedgerAccountAuditRecord["action"] {
  switch (action) {
    case "RENAME": return "RENAMED";
    case "CHANGE_TYPE": return "TYPE_CHANGED";
    case "ARCHIVE": return "ARCHIVED";
    case "RESTORE": return "RESTORED";
  }
}

function accountManagementAudit(input: Omit<CreateLedgerAccountAuditRecord, "id">): CreateLedgerAccountAuditRecord {
  return { id: randomUUID(), ...input };
}

function refundCommandFingerprint(command: CreateRefundCommand): string {
  return createHash("sha256")
    .update(JSON.stringify({
      expenseTransactionId: command.expenseTransactionId,
      amountMinor: command.amountMinor.toString(),
      currency: command.currency,
      accountId: command.accountId ?? null,
      occurredAt: command.occurredAt.toISOString(),
      note: command.note ?? null,
      reason: command.reason ?? null,
    }))
    .digest("hex");
}

function refundStatusFor(totalRefundedMinor: bigint, expenseAmountMinor: bigint): RefundStatus {
  if (totalRefundedMinor <= 0n) return "NONE";
  return totalRefundedMinor === expenseAmountMinor ? "FULL" : "PARTIAL";
}

function assertVerifiedFinancialRefund({
  sourceExpense,
  requested,
  refund,
  aggregate,
  persistedAudits,
}: {
  sourceExpense: LedgerTransactionRecord;
  requested: Pick<CreateLedgerFinancialRefundRecord, "refund"> & {
    audits: readonly CreateLedgerTransactionAuditRecord[];
  };
  refund: LedgerTransactionRecord;
  aggregate: {
    refunds: readonly LedgerTransactionRecord[];
    total: ReturnType<typeof money>;
    remaining: ReturnType<typeof money>;
  };
  persistedAudits: readonly import("./domain").LedgerTransactionAuditRecord[] | null;
}): void {
  const requestedRefund = requested.refund;
  const expectedAuditsPersisted = persistedAudits === null || requested.audits.every((audit) =>
    persistedAudits.some((persisted) =>
      persisted.id === audit.id
      && persisted.transactionId === audit.transactionId
      && persisted.actorUserId === audit.actorUserId
      && persisted.action === audit.action
      && stableJson(persisted.metadata) === stableJson(audit.metadata),
    ),
  );
  const aggregateValid =
    aggregate.total.currency === sourceExpense.currency
    && aggregate.remaining.currency === sourceExpense.currency
    && aggregate.total.minor > 0n
    && aggregate.total.minor <= sourceExpense.amountMinor
    && aggregate.remaining.minor === sourceExpense.amountMinor - aggregate.total.minor
    && aggregate.refunds.some((candidate) => candidate.id === refund.id);
  const persistedRefundMatches =
    refund.kind === "REFUND"
    && refund.status === "POSTED"
    && refund.workspaceId === sourceExpense.workspaceId
    && refund.amountMinor === requestedRefund.amountMinor
    && refund.currency === requestedRefund.currency
    && refund.accountId === requestedRefund.accountId
    && refund.categoryId === sourceExpense.categoryId
    && refund.merchantId === sourceExpense.merchantId
    && refund.refundedTransactionId === sourceExpense.id
    && refund.reversalOfTransactionId === null
    && refund.note === requestedRefund.note
    && refund.occurredAt.getTime() === requestedRefund.occurredAt.getTime();
  if (!persistedRefundMatches || !aggregateValid || !expectedAuditsPersisted) {
    throw new Error("Financial refund verification failed.");
  }
}

function isSerializationFailure(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "40001",
  );
}

function createTransactionReversal(
  original: LedgerTransactionRecord,
  options: {
    actorUserId: string;
    purpose: "CORRECTION" | "MANUAL";
    operationId: string;
    deduplicationFingerprint: string;
    reason: string | null;
    commandFingerprint?: string;
  },
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
    createdByUserId: options.actorUserId,
    paidByUserId: original.paidByUserId,
    refundedTransactionId: null,
    reversalOfTransactionId: original.id,
    source: reversalSource(original.source, original.id, options),
    deduplicationFingerprint: options.deduplicationFingerprint,
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

function reversalSource(
  source: Record<string, unknown>,
  originalTransactionId: string,
  options: {
    purpose: "CORRECTION" | "MANUAL";
    operationId: string;
    reason: string | null;
    commandFingerprint?: string;
  },
): Record<string, unknown> {
  if (options.purpose === "CORRECTION") {
    return correctionSource(source, "REVERSAL", options.operationId, originalTransactionId);
  }
  return {
    ...source,
    manualReversal: {
      purpose: "MANUAL",
      reversalId: options.operationId,
      originalTransactionId,
      reason: options.reason,
      commandFingerprint: options.commandFingerprint,
    },
  };
}

function manualReversalAudits({
  actorUserId,
  original,
  reversal,
  reason,
}: {
  actorUserId: string;
  original: LedgerTransactionRecord;
  reversal: CreateLedgerTransactionRecord;
  reason: string | null;
}): readonly [CreateLedgerTransactionAuditRecord, CreateLedgerTransactionAuditRecord] {
  const linkage = {
    purpose: "MANUAL",
    originalTransactionId: original.id,
    reversalTransactionId: reversal.id,
    reason,
  };
  return [
    {
      id: randomUUID(),
      workspaceId: original.workspaceId,
      transactionId: original.id,
      actorUserId,
      action: "MANUAL_REVERSAL",
      metadata: linkage,
    },
    {
      id: randomUUID(),
      workspaceId: original.workspaceId,
      transactionId: reversal.id,
      actorUserId,
      action: "MANUAL_REVERSAL_ENTRY",
      metadata: linkage,
    },
  ];
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

function openingBalanceCorrectionAudits({
  actorUserId,
  accountId,
  correction,
  original,
  reversal,
  replacement,
}: {
  actorUserId: string;
  accountId: string;
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
    accountId,
    correctionId: correction.id,
    originalTransactionId: original.id,
    reversalTransactionId: reversal.id,
    replacementTransactionId: replacement.id,
    reason: correction.reason,
    before: {
      amountMinor: original.amountMinor.toString(),
      currency: original.currency,
      effectiveAt: original.occurredAt.toISOString(),
    },
    after: {
      amountMinor: replacement.amountMinor.toString(),
      currency: replacement.currency,
      effectiveAt: replacement.occurredAt.toISOString(),
    },
  };
  return [
    {
      id: randomUUID(),
      workspaceId: correction.workspaceId,
      transactionId: original.id,
      actorUserId,
      action: "OPENING_BALANCE_CORRECTED",
      metadata: linkage,
    },
    {
      id: randomUUID(),
      workspaceId: correction.workspaceId,
      transactionId: reversal.id,
      actorUserId,
      action: "OPENING_BALANCE_CORRECTION_REVERSAL",
      metadata: linkage,
    },
    {
      id: randomUUID(),
      workspaceId: correction.workspaceId,
      transactionId: replacement.id,
      actorUserId,
      action: "OPENING_BALANCE_CORRECTION_REPLACEMENT",
      metadata: linkage,
    },
  ];
}

function correctionFinancialChanges(
  original: LedgerTransactionRecord,
  replacement: CreateLedgerTransactionRecord,
): Record<string, { before: string | null; after: string | null }> {
  const changes: Record<string, { before: string | null; after: string | null }> = {};
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
  if (original.categoryId !== replacement.categoryId) {
    changes.categoryId = { before: original.categoryId, after: replacement.categoryId };
  }
  if (original.merchantId !== replacement.merchantId) {
    changes.counterpartyId = { before: original.merchantId, after: replacement.merchantId };
  }
  if (original.occurredAt.getTime() !== replacement.occurredAt.getTime()) {
    changes.occurredAt = { before: original.occurredAt.toISOString(), after: replacement.occurredAt.toISOString() };
  }
  if (original.note !== replacement.note) {
    changes.note = {
      before: original.note === null ? null : "[present]",
      after: replacement.note === null ? null : "[present]",
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

function openingBalanceSetIdempotencyFingerprint(actorUserId: string, idempotencyKey: string): string {
  return `opening-balance:set:${createHash("sha256").update(`${actorUserId}:${idempotencyKey}`).digest("hex")}`;
}

function openingBalanceCorrectionIdempotencyKey(actorUserId: string, idempotencyKey: string): string {
  return `opening-balance:correction:${createHash("sha256").update(`${actorUserId}:${idempotencyKey}`).digest("hex")}`;
}

function openingBalanceSetCommandFingerprint(command: SetOpeningBalanceCommand): string {
  return createHash("sha256")
    .update(JSON.stringify({
      accountId: command.accountId,
      amountMinor: command.amountMinor.toString(),
      currency: command.currency,
      effectiveAt: command.effectiveAt.toISOString(),
    }))
    .digest("hex");
}

function openingBalanceCorrectionCommandFingerprint(command: CorrectOpeningBalanceCommand): string {
  return createHash("sha256")
    .update(JSON.stringify({
      accountId: command.accountId,
      newAmountMinor: command.newAmountMinor.toString(),
      reason: command.reason ?? null,
      expectedVersion: command.expectedVersion?.toISOString() ?? null,
    }))
    .digest("hex");
}

function isOpeningBalanceSetMetadata(
  value: unknown,
  commandFingerprint: string,
): value is { operation: "SET"; commandFingerprint: string } {
  return Boolean(
    value
    && typeof value === "object"
    && (value as { operation?: unknown }).operation === "SET"
    && (value as { commandFingerprint?: unknown }).commandFingerprint === commandFingerprint,
  );
}

function presentOpeningBalance(value: LedgerOpeningBalanceReadRecord): OpeningBalanceDTO {
  return {
    amountMinor: value.transaction.amountMinor.toString(),
    currency: toCurrencyCode(value.transaction.currency),
    effectiveAt: value.transaction.occurredAt.toISOString(),
    hasBeenCorrected: value.currentTransactionId !== value.originalTransactionId,
    updatedAt: value.transaction.updatedAt.toISOString(),
  };
}

function manualReversalIdempotencyFingerprint(actorUserId: string, idempotencyKey: string): string {
  return `reversal:${createHash("sha256").update(`${actorUserId}:${idempotencyKey}`).digest("hex")}`;
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
      details: command.details ?? null,
      reason: command.reason ?? null,
      expectedVersion,
    }))
    .digest("hex");
}

function manualReversalCommandFingerprint(command: ReverseTransactionCommand): string {
  return createHash("sha256")
    .update(JSON.stringify({
      transactionId: command.transactionId,
      expectedVersion: command.expectedUpdatedAt?.toISOString() ?? null,
      reason: command.reason ?? null,
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
  merchantMayBeReconciled: boolean,
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
    // A concurrent merchant creation may resolve the same normalized name to
    // the already-created record within the atomic CTE. Its relation must
    // exist, but it need not retain this request's provisional UUID.
    && (merchantMayBeReconciled ? replacement.merchantId !== null : replacement.merchantId === expectedReplacement.merchantId)
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

function assertVerifiedFinancialReversal(result: LedgerFinancialReversalResult): void {
  const { originalTransaction: original, reversalTransaction: reversal } = result;
  const transferMatches = original.kind === "TRANSFER"
    && reversal.accountId === original.transferAccountId
    && reversal.transferAccountId === original.accountId;
  const singleAccountMatches = original.kind !== "TRANSFER"
    && reversal.accountId === original.accountId
    && reversal.transferAccountId === null;
  if (
    original.kind === "REFUND"
    || reversal.kind !== original.kind
    || reversal.status !== "POSTED"
    || reversal.amountMinor !== original.amountMinor
    || reversal.currency !== original.currency
    || reversal.reversalOfTransactionId !== original.id
    || (!transferMatches && !singleAccountMatches)
  ) {
    throw new Error("Financial reversal verification failed.");
  }
}

function isManualReversalMetadata(
  value: unknown,
  commandFingerprint: string,
): value is { purpose: "MANUAL"; commandFingerprint: string } {
  return Boolean(
    value
    && typeof value === "object"
    && (value as { purpose?: unknown }).purpose === "MANUAL"
    && (value as { commandFingerprint?: unknown }).commandFingerprint === commandFingerprint,
  );
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
