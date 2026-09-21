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
} from "@/modules/ledger/domain";
import { toCurrencyCode } from "@/money/currency";
import { getAccountSpendability } from "@/modules/ledger/spendability-policy";
import type {
  CreateLedgerAccountRecord,
  CreateLedgerCategoryRecord,
  CreateLedgerMerchantRecord,
  CreateLedgerTransactionAuditRecord,
  CreateLedgerFinancialCorrectionRecord,
  CreateLedgerFinancialReversalRecord,
  CreateLedgerFinancialRefundRecord,
  LedgerFinancialCorrectionWriteResult,
  CreateLedgerTransactionRecord,
  CreateLedgerSpendableTransactionRecord,
  LedgerSpendableTransactionWriteResult,
  LedgerRepository,
  UpdateLedgerTransactionDetailsRecord,
} from "@/modules/ledger/repositories/ledger-repository";

export const SYSTEM_GROCERIES_ID = "00000000-0000-4000-8000-000000000001";
export const SYSTEM_TRANSPORT_ID = "00000000-0000-4000-8000-000000000003";
export const SYSTEM_OTHER_EXPENSE_ID = "00000000-0000-4000-8000-000000000009";
export const SYSTEM_SALARY_ID = "00000000-0000-4000-8000-000000000101";
export const SYSTEM_OTHER_INCOME_ID = "00000000-0000-4000-8000-000000000104";

export class InMemoryLedgerRepository implements LedgerRepository {
  readonly accounts = new Map<string, LedgerAccountRecord>();
  readonly categories = new Map<string, LedgerCategoryRecord>();
  readonly merchants = new Map<string, LedgerMerchantRecord>();
  readonly transactions = new Map<string, LedgerTransactionRecord>();
  readonly transactionAudits = new Map<string, LedgerTransactionAuditRecord>();
  readonly transactionCorrections = new Map<string, LedgerTransactionCorrectionRecord>();
  accountBalanceReadCount = 0;
  workspaceAccountBalancesReadCount = 0;
  /** Test-only fault injection proves correction writes commit atomically. */
  failCorrectionStage: "reversal" | "replacement" | "linkage" | null = null;
  failManualReversalStage: "reversal" | "audit" | null = null;
  /** Test-only fault injection proves refund writes commit atomically. */
  failRefundStage: "refund" | "audit" | null = null;

  constructor() {
    const now = new Date("2026-01-01T00:00:00.000Z");
    this.categories.set(SYSTEM_GROCERIES_ID, {
      id: SYSTEM_GROCERIES_ID,
      workspaceId: null,
      name: "Groceries",
      kind: "EXPENSE",
      isSystem: true,
      systemKey: "expense:groceries",
      createdByUserId: null,
      createdAt: now,
      updatedAt: now,
    });
    this.categories.set(SYSTEM_SALARY_ID, {
      id: SYSTEM_SALARY_ID,
      workspaceId: null,
      name: "Salary",
      kind: "INCOME",
      isSystem: true,
      systemKey: "income:salary",
      createdByUserId: null,
      createdAt: now,
      updatedAt: now,
    });
    this.categories.set(SYSTEM_TRANSPORT_ID, {
      id: SYSTEM_TRANSPORT_ID,
      workspaceId: null,
      name: "Transport",
      kind: "EXPENSE",
      isSystem: true,
      systemKey: "expense:transport",
      createdByUserId: null,
      createdAt: now,
      updatedAt: now,
    });
    this.categories.set(SYSTEM_OTHER_EXPENSE_ID, {
      id: SYSTEM_OTHER_EXPENSE_ID,
      workspaceId: null,
      name: "Other expense",
      kind: "EXPENSE",
      isSystem: true,
      systemKey: "expense:other",
      createdByUserId: null,
      createdAt: now,
      updatedAt: now,
    });
    this.categories.set(SYSTEM_OTHER_INCOME_ID, {
      id: SYSTEM_OTHER_INCOME_ID,
      workspaceId: null,
      name: "Other income",
      kind: "INCOME",
      isSystem: true,
      systemKey: "income:other",
      createdByUserId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async createAccount(input: CreateLedgerAccountRecord): Promise<LedgerAccountRecord> {
    const now = new Date();
    const record: LedgerAccountRecord = { ...input, archivedAt: null, createdAt: now, updatedAt: now };
    this.accounts.set(record.id, record);
    return record;
  }

  async listAccounts(workspaceId: string): Promise<LedgerAccountRecord[]> {
    return [...this.accounts.values()].filter((account) => account.workspaceId === workspaceId);
  }

  async findAccount(workspaceId: string, accountId: string): Promise<LedgerAccountRecord | null> {
    const account = this.accounts.get(accountId);
    return account?.workspaceId === workspaceId ? account : null;
  }

  async getAccountBalance(
    workspaceId: string,
    accountId: string,
  ): Promise<LedgerAccountBalance | null> {
    this.accountBalanceReadCount += 1;
    const [balance] = this.queryAccountBalances(workspaceId, accountId);
    return balance ?? null;
  }

  async getWorkspaceAccountBalances(workspaceId: string): Promise<readonly LedgerAccountBalance[]> {
    this.workspaceAccountBalancesReadCount += 1;
    return this.queryAccountBalances(workspaceId);
  }

  async createCategory(input: CreateLedgerCategoryRecord): Promise<LedgerCategoryRecord> {
    const now = new Date();
    const record: LedgerCategoryRecord = { ...input, createdAt: now, updatedAt: now };
    this.categories.set(record.id, record);
    return record;
  }

  async listCategories(workspaceId: string): Promise<LedgerCategoryRecord[]> {
    return [...this.categories.values()].filter(
      (category) => category.workspaceId === null || category.workspaceId === workspaceId,
    );
  }

  async findCategory(workspaceId: string, categoryId: string): Promise<LedgerCategoryRecord | null> {
    const category = this.categories.get(categoryId);
    return category && (category.workspaceId === null || category.workspaceId === workspaceId)
      ? category
      : null;
  }

  async createMerchant(input: CreateLedgerMerchantRecord): Promise<LedgerMerchantRecord> {
    const now = new Date();
    const record: LedgerMerchantRecord = { ...input, createdAt: now, updatedAt: now };
    this.merchants.set(record.id, record);
    return record;
  }

  async listMerchants(workspaceId: string): Promise<LedgerMerchantRecord[]> {
    return [...this.merchants.values()].filter((merchant) => merchant.workspaceId === workspaceId);
  }

  async findMerchant(workspaceId: string, merchantId: string): Promise<LedgerMerchantRecord | null> {
    const merchant = this.merchants.get(merchantId);
    return merchant?.workspaceId === workspaceId ? merchant : null;
  }

  async findMerchantByNormalizedName(
    workspaceId: string,
    normalizedName: string,
  ): Promise<LedgerMerchantRecord | null> {
    return (
      [...this.merchants.values()].find(
        (merchant) =>
          merchant.workspaceId === workspaceId && merchant.normalizedName === normalizedName,
      ) ?? null
    );
  }

  async createTransaction(input: CreateLedgerTransactionRecord): Promise<LedgerTransactionRecord> {
    this.assertTransactionFingerprintAvailable(input);
    const now = new Date();
    const record: LedgerTransactionRecord = { ...input, createdAt: now, updatedAt: now };
    this.transactions.set(record.id, record);
    return record;
  }

  async createTransactionWithMerchant(
    input: CreateLedgerTransactionRecord,
    merchant: CreateLedgerMerchantRecord,
  ): Promise<LedgerTransactionRecord> {
    this.assertTransactionFingerprintAvailable(input);
    if (await this.findMerchantByNormalizedName(merchant.workspaceId, merchant.normalizedName)) {
      throw new Error("A merchant with that name already exists in this workspace.");
    }

    const now = new Date();
    const merchantRecord: LedgerMerchantRecord = { ...merchant, createdAt: now, updatedAt: now };
    const transactionRecord: LedgerTransactionRecord = { ...input, createdAt: now, updatedAt: now };
    this.merchants.set(merchantRecord.id, merchantRecord);
    this.transactions.set(transactionRecord.id, transactionRecord);
    return transactionRecord;
  }

  async createTransactionWithSpendability(
    input: CreateLedgerSpendableTransactionRecord,
  ): Promise<LedgerSpendableTransactionWriteResult> {
    const { transaction, merchantToCreate, spendabilityGuard } = input;
    if (spendabilityGuard) {
      const account = this.accounts.get(spendabilityGuard.accountId);
      if (!account || account.workspaceId !== transaction.workspaceId) {
        throw new Error("Spendability guard account was not found in this workspace.");
      }
      const [balance] = this.queryAccountBalances(transaction.workspaceId, account.id);
      if (!balance) throw new Error("Spendability guard balance was not found.");
      const spendability = getAccountSpendability({
        accountId: account.id,
        accountType: account.type,
        currency: balance.currency,
        currentBalanceMinor: balance.currentBalanceMinor,
        requestedDebitMinor: spendabilityGuard.requestedDebitMinor,
      });
      if (!spendability.canDebit) {
        if (spendability.reason !== "INSUFFICIENT_FUNDS") {
          throw new Error("Unsupported account policy reached a guarded debit write.");
        }
        return { outcome: "INSUFFICIENT_FUNDS", spendability };
      }
    }

    // Do not await between the balance decision and map commit. This is the
    // test double's equivalent of production's one serializable CTE.
    this.assertTransactionFingerprintAvailable(transaction);
    const now = new Date();
    let merchantId = transaction.merchantId;
    if (merchantToCreate) {
      const existing = [...this.merchants.values()].find(
        (candidate) =>
          candidate.workspaceId === merchantToCreate.workspaceId
          && candidate.normalizedName === merchantToCreate.normalizedName,
      );
      if (existing) {
        merchantId = existing.id;
      } else {
        this.merchants.set(merchantToCreate.id, { ...merchantToCreate, createdAt: now, updatedAt: now });
        merchantId = merchantToCreate.id;
      }
    }
    const created: LedgerTransactionRecord = { ...transaction, merchantId, createdAt: now, updatedAt: now };
    this.transactions.set(created.id, created);
    return { outcome: "CREATED", transaction: created };
  }

  async updateTransactionDetails(
    input: UpdateLedgerTransactionDetailsRecord,
  ): Promise<LedgerTransactionRecord | null> {
    const existing = await this.findTransaction(input.workspaceId, input.transactionId);
    if (!existing || existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) return null;

    let merchantId = input.merchantId;
    if (input.merchantToCreate) {
      const duplicate = await this.findMerchantByNormalizedName(
        input.merchantToCreate.workspaceId,
        input.merchantToCreate.normalizedName,
      );
      if (duplicate) {
        merchantId = duplicate.id;
      } else {
        const now = new Date();
        const merchant: LedgerMerchantRecord = { ...input.merchantToCreate, createdAt: now, updatedAt: now };
        this.merchants.set(merchant.id, merchant);
        merchantId = merchant.id;
      }
    }

    const now = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));
    const updated: LedgerTransactionRecord = {
      ...existing,
      categoryId: input.categoryId,
      merchantId,
      occurredAt: input.occurredAt,
      note: input.note,
      updatedAt: now,
    };
    this.transactions.set(updated.id, updated);
    this.createTransactionAudit(input.audit, now);
    return updated;
  }

  async findTransaction(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionRecord | null> {
    const transaction = this.transactions.get(transactionId);
    return transaction?.workspaceId === workspaceId ? transaction : null;
  }

  async findTransactionByFingerprint(
    workspaceId: string,
    fingerprint: string,
  ): Promise<LedgerTransactionRecord | null> {
    return (
      [...this.transactions.values()].find(
        (transaction) =>
          transaction.workspaceId === workspaceId && transaction.deduplicationFingerprint === fingerprint,
      ) ?? null
    );
  }

  async findTransactionReversalByOriginal(
    workspaceId: string,
    originalTransactionId: string,
  ): Promise<LedgerTransactionRecord | null> {
    return (
      [...this.transactions.values()]
        .filter(
          (transaction) =>
            transaction.workspaceId === workspaceId
            && transaction.reversalOfTransactionId === originalTransactionId,
        )
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))[0]
      ?? null
    );
  }

  async findAccountById(accountId: string): Promise<LedgerAccountRecord | null> {
    return this.accounts.get(accountId) ?? null;
  }

  async findTransactionCorrectionByOriginal(
    workspaceId: string,
    originalTransactionId: string,
  ): Promise<LedgerTransactionCorrectionRecord | null> {
    return (
      [...this.transactionCorrections.values()].find(
        (correction) =>
          correction.workspaceId === workspaceId && correction.originalTransactionId === originalTransactionId,
      ) ?? null
    );
  }

  async findTransactionCorrectionByTransactionId(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionCorrectionRecord | null> {
    return (
      [...this.transactionCorrections.values()].find(
        (correction) =>
          correction.workspaceId === workspaceId
          && (
            correction.originalTransactionId === transactionId
            || correction.reversalTransactionId === transactionId
            || correction.replacementTransactionId === transactionId
          ),
      ) ?? null
    );
  }

  async findTransactionCorrectionByReplacement(
    workspaceId: string,
    replacementTransactionId: string,
  ): Promise<LedgerTransactionCorrectionRecord | null> {
    return (
      [...this.transactionCorrections.values()].find(
        (correction) =>
          correction.workspaceId === workspaceId
          && correction.replacementTransactionId === replacementTransactionId,
      ) ?? null
    );
  }

  async findTransactionCorrectionByIdempotencyKey(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<LedgerTransactionCorrectionRecord | null> {
    return (
      [...this.transactionCorrections.values()].find(
        (correction) =>
          correction.workspaceId === workspaceId
          && correction.actorUserId === actorUserId
          && correction.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async createFinancialCorrection(
    input: CreateLedgerFinancialCorrectionRecord,
  ): Promise<LedgerFinancialCorrectionWriteResult> {
    // Keep this preflight synchronous: async test callers can race exactly as
    // HTTP callers do, while one atomic in-memory commit still has one winner.
    const candidate = this.transactions.get(input.originalTransactionId);
    const original = candidate?.workspaceId === input.workspaceId ? candidate : null;
    const lineage = new Set<string>([input.originalTransactionId]);
    let lineageCursor = input.originalTransactionId;
    while (true) {
      const correction = [...this.transactionCorrections.values()].find(
        (candidateCorrection) =>
          candidateCorrection.workspaceId === input.workspaceId
          && candidateCorrection.replacementTransactionId === lineageCursor,
      );
      if (!correction || lineage.has(correction.originalTransactionId)) break;
      lineage.add(correction.originalTransactionId);
      lineageCursor = correction.originalTransactionId;
    }
    const refundedMinor = [...this.transactions.values()].reduce(
      (total, transaction) =>
        transaction.workspaceId === input.workspaceId
        && transaction.kind === "REFUND"
        && transaction.status === "POSTED"
        && transaction.refundedTransactionId !== null
        && lineage.has(transaction.refundedTransactionId)
          ? total + transaction.amountMinor
          : total,
      0n,
    );
    const replacementFallsBelowRefunds = input.replacement.kind === "EXPENSE"
      && input.replacement.amountMinor < refundedMinor;
    if (
      !original
      || original.reversalOfTransactionId !== null
      || (input.expectedOriginalUpdatedAt
        && original.updatedAt.getTime() !== input.expectedOriginalUpdatedAt.getTime())
      || [...this.transactionCorrections.values()].some(
        (correction) =>
          correction.workspaceId === input.workspaceId
          && correction.originalTransactionId === input.originalTransactionId,
      )
      || [...this.transactions.values()].some(
        (transaction) =>
          transaction.workspaceId === input.workspaceId
          && transaction.reversalOfTransactionId === input.originalTransactionId,
      )
      || replacementFallsBelowRefunds
    ) {
      return { outcome: "CONFLICT" };
    }
    if ([...this.transactionCorrections.values()].some(
      (correction) =>
        correction.workspaceId === input.workspaceId
        && correction.actorUserId === input.correction.actorUserId
        && correction.idempotencyKey === input.correction.idempotencyKey,
    )) {
      throw new Error("Correction idempotency key already exists.");
    }
    if (input.spendabilityGuard) {
      const account = this.accounts.get(input.spendabilityGuard.accountId);
      if (!account || account.workspaceId !== input.workspaceId) {
        throw new Error("Correction spendability guard account was not found in this workspace.");
      }
      const [balance] = this.queryAccountBalances(input.workspaceId, account.id);
      if (!balance) throw new Error("Correction spendability guard balance was not found.");
      const spendability = getAccountSpendability({
        accountId: account.id,
        accountType: account.type,
        currency: balance.currency,
        currentBalanceMinor: balance.currentBalanceMinor + accountMovementDelta(input.reversal, account.id),
        requestedDebitMinor: input.spendabilityGuard.requestedDebitMinor,
      });
      if (!spendability.canDebit) {
        if (spendability.reason !== "INSUFFICIENT_FUNDS") {
          throw new Error("Unsupported account policy reached a guarded correction write.");
        }
        return { outcome: "INSUFFICIENT_FUNDS", spendability };
      }
    }
    if (this.failCorrectionStage === "reversal") throw new Error("Reversal write failed.");
    if (this.failCorrectionStage === "replacement") throw new Error("Replacement write failed.");
    if (this.failCorrectionStage === "linkage") throw new Error("Correction linkage failed.");

    // Nothing reaches the backing maps until every candidate has been checked.
    // This mirrors the production CTE transaction's all-or-nothing commit.
    const now = new Date();
    const reversal: LedgerTransactionRecord = { ...input.reversal, createdAt: now, updatedAt: now };
    const replacement: LedgerTransactionRecord = { ...input.replacement, createdAt: now, updatedAt: now };
    const correction: LedgerTransactionCorrectionRecord = { ...input.correction, createdAt: now };
    if (this.transactions.has(reversal.id) || this.transactions.has(replacement.id)) {
      throw new Error("Correction transaction ID already exists.");
    }
    if (input.merchantToCreate) {
      this.merchants.set(input.merchantToCreate.id, {
        ...input.merchantToCreate,
        createdAt: now,
        updatedAt: now,
      });
    }
    this.transactions.set(reversal.id, reversal);
    this.transactions.set(replacement.id, replacement);
    this.transactionCorrections.set(correction.id, correction);
    for (const audit of input.audits) this.createTransactionAudit(audit, now);
    return { outcome: "CREATED", correction };
  }

  async createFinancialReversal(
    input: CreateLedgerFinancialReversalRecord,
  ): Promise<LedgerTransactionRecord | null> {
    // This synchronous preflight makes parallel calls observe one winner,
    // matching the production candidate row lock.
    const candidate = this.transactions.get(input.originalTransactionId);
    const original = candidate?.workspaceId === input.workspaceId ? candidate : null;
    const lineage = new Set<string>([input.originalTransactionId]);
    let cursor = input.originalTransactionId;
    while (true) {
      const correction = [...this.transactionCorrections.values()].find(
        (candidateCorrection) =>
          candidateCorrection.workspaceId === input.workspaceId
          && candidateCorrection.replacementTransactionId === cursor,
      );
      if (!correction || lineage.has(correction.originalTransactionId)) break;
      lineage.add(correction.originalTransactionId);
      cursor = correction.originalTransactionId;
    }
    const hasActiveRefunds = [...this.transactions.values()].some(
      (transaction) =>
        transaction.workspaceId === input.workspaceId
        && transaction.kind === "REFUND"
        && transaction.status === "POSTED"
        && transaction.refundedTransactionId !== null
        && lineage.has(transaction.refundedTransactionId),
    );
    if (
      !original
      || original.reversalOfTransactionId !== null
      || (input.expectedOriginalUpdatedAt
        && original.updatedAt.getTime() !== input.expectedOriginalUpdatedAt.getTime())
      || [...this.transactionCorrections.values()].some(
        (correction) =>
          correction.workspaceId === input.workspaceId
          && correction.originalTransactionId === input.originalTransactionId,
      )
      || [...this.transactions.values()].some(
        (transaction) =>
          transaction.workspaceId === input.workspaceId
          && transaction.reversalOfTransactionId === input.originalTransactionId,
      )
      || hasActiveRefunds
    ) {
      return null;
    }
    this.assertTransactionFingerprintAvailable(input.reversal);
    if (this.failManualReversalStage === "reversal") throw new Error("Reversal write failed.");
    if (this.failManualReversalStage === "audit") throw new Error("Reversal audit write failed.");

    const now = new Date();
    const reversal: LedgerTransactionRecord = { ...input.reversal, createdAt: now, updatedAt: now };
    if (this.transactions.has(reversal.id)) throw new Error("Reversal transaction ID already exists.");
    this.transactions.set(reversal.id, reversal);
    for (const audit of input.audits) this.createTransactionAudit(audit, now);
    return reversal;
  }

  async createFinancialRefund(
    input: CreateLedgerFinancialRefundRecord,
  ): Promise<LedgerTransactionRecord | null> {
    // Do not await before this check-and-commit. Parallel test callers must
    // observe the same all-or-nothing critical section as the serializable
    // production transaction rather than interleave between sum and insert.
    const candidate = this.transactions.get(input.sourceExpenseId);
    const source = candidate?.workspaceId === input.workspaceId ? candidate : null;
    const outgoing = [...this.transactionCorrections.values()].find(
      (correction) =>
        correction.workspaceId === input.workspaceId
        && correction.originalTransactionId === input.sourceExpenseId,
    ) ?? null;
    const reversal = [...this.transactions.values()].find(
      (transaction) =>
        transaction.workspaceId === input.workspaceId
        && transaction.reversalOfTransactionId === input.sourceExpenseId,
    ) ?? null;
    const enclosing = [...this.transactionCorrections.values()].find(
      (correction) =>
        correction.workspaceId === input.workspaceId
        && (
          correction.originalTransactionId === input.sourceExpenseId
          || correction.reversalTransactionId === input.sourceExpenseId
          || correction.replacementTransactionId === input.sourceExpenseId
        ),
    ) ?? null;
    if (
      !source
      || source.kind !== "EXPENSE"
      || source.status !== "POSTED"
      || outgoing
      || reversal
      || enclosing?.reversalTransactionId === source.id
    ) {
      return null;
    }

    const lineage = new Set<string>([source.id]);
    let cursor = source.id;
    while (true) {
      const correction = [...this.transactionCorrections.values()].find(
        (candidateCorrection) =>
          candidateCorrection.workspaceId === input.workspaceId
          && candidateCorrection.replacementTransactionId === cursor,
      );
      if (!correction || lineage.has(correction.originalTransactionId)) break;
      lineage.add(correction.originalTransactionId);
      cursor = correction.originalTransactionId;
    }
    const existingRefunds = [...this.transactions.values()].filter(
      (transaction) =>
        transaction.workspaceId === input.workspaceId
        && transaction.kind === "REFUND"
        && transaction.status === "POSTED"
        && transaction.refundedTransactionId !== null
        && lineage.has(transaction.refundedTransactionId),
    );
    const refundedMinor = existingRefunds.reduce((total, refund) => total + refund.amountMinor, 0n);
    if (refundedMinor + input.refund.amountMinor > source.amountMinor) return null;
    this.assertTransactionFingerprintAvailable(input.refund);
    if (this.failRefundStage === "refund") throw new Error("Refund write failed.");
    if (this.failRefundStage === "audit") throw new Error("Refund audit write failed.");

    // All validation and injected failures happen before this one commit,
    // mirroring the production serializable CTE transaction.
    const now = new Date();
    const refund: LedgerTransactionRecord = { ...input.refund, createdAt: now, updatedAt: now };
    this.transactions.set(refund.id, refund);
    for (const audit of input.audits) this.createTransactionAudit(audit, now);
    return refund;
  }

  async listTransactions(
    workspaceId: string,
    filters: LedgerTransactionFilters = {},
  ): Promise<LedgerTransactionRecord[]> {
    const transactions = [...this.transactions.values()].filter((transaction) => {
      if (transaction.workspaceId !== workspaceId) return false;
      if (filters.statuses?.length && !filters.statuses.includes(transaction.status)) return false;
      if (filters.accountId && transaction.accountId !== filters.accountId) return false;
      if (filters.categoryId && transaction.categoryId !== filters.categoryId) return false;
      if (filters.merchantId && transaction.merchantId !== filters.merchantId) return false;
      if (filters.occurredFrom && transaction.occurredAt < filters.occurredFrom) return false;
      if (filters.occurredTo && transaction.occurredAt > filters.occurredTo) return false;
      return true;
    }).sort((left, right) =>
      right.occurredAt.getTime() - left.occurredAt.getTime() ||
      right.createdAt.getTime() - left.createdAt.getTime(),
    );

    return filters.limit === undefined ? transactions : transactions.slice(0, filters.limit);
  }

  async countTransactionList(
    workspaceId: string,
    filters: LedgerTransactionListFilters,
  ): Promise<number> {
    return this.transactionListRows(workspaceId, filters).length;
  }

  async listTransactionListCurrencies(
    workspaceId: string,
    filters: LedgerTransactionListFilters,
  ): Promise<readonly string[]> {
    return [...new Set(this.transactionListRows(workspaceId, filters).map(({ transaction }) => transaction.currency))].slice(0, 2);
  }

  async listTransactionListPage(
    workspaceId: string,
    input: LedgerTransactionListPageInput,
  ): Promise<readonly LedgerTransactionListRow[]> {
    const rows = this.transactionListRows(workspaceId, input);
    rows.sort((left, right) => {
      switch (input.sort) {
        case "OLDEST":
          return compareRows(left, right, 1);
        case "HIGHEST":
          return compareBigints(right.transaction.amountMinor, left.transaction.amountMinor) || compareRows(left, right, -1);
        case "LOWEST":
          return compareBigints(left.transaction.amountMinor, right.transaction.amountMinor) || compareRows(left, right, 1);
        case "NEWEST":
        default:
          return compareRows(left, right, -1);
      }
    });
    return rows.slice(input.offset, input.offset + input.limit);
  }

  async listRefundsForTransaction(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionRecord[]> {
    return [...this.transactions.values()].filter(
      (transaction) =>
        transaction.workspaceId === workspaceId &&
        transaction.kind === "REFUND" &&
        transaction.status === "POSTED" &&
        transaction.refundedTransactionId === transactionId,
    );
  }

  async listRefundsForEffectiveExpense(
    workspaceId: string,
    effectiveExpenseTransactionId: string,
  ): Promise<LedgerTransactionRecord[]> {
    const lineage = new Set<string>([effectiveExpenseTransactionId]);
    let cursor = effectiveExpenseTransactionId;
    while (true) {
      const correction = await this.findTransactionCorrectionByReplacement(workspaceId, cursor);
      if (!correction || lineage.has(correction.originalTransactionId)) break;
      lineage.add(correction.originalTransactionId);
      cursor = correction.originalTransactionId;
    }
    return [...this.transactions.values()]
      .filter(
        (transaction) =>
          transaction.workspaceId === workspaceId
          && transaction.kind === "REFUND"
          && transaction.status === "POSTED"
          && transaction.refundedTransactionId !== null
          && lineage.has(transaction.refundedTransactionId),
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id));
  }

  async listTransactionAudit(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionAuditRecord[]> {
    return [...this.transactionAudits.values()]
      .filter((audit) => audit.workspaceId === workspaceId && audit.transactionId === transactionId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id));
  }

  /** Mirrors the database repository's one aggregate balance query for tests. */
  private queryAccountBalances(
    workspaceId: string,
    requestedAccountId?: string,
  ): LedgerAccountBalance[] {
    const balances = new Map(
      [...this.accounts.values()]
        .filter((account) => account.workspaceId === workspaceId)
        .filter((account) => requestedAccountId === undefined || account.id === requestedAccountId)
        .map((account) => [account.id, account.openingBalanceMinor]),
    );

    for (const transaction of this.transactions.values()) {
      if (transaction.workspaceId !== workspaceId || transaction.status !== "POSTED") continue;

      if (transaction.kind === "TRANSFER") {
        if (transaction.accountId && balances.has(transaction.accountId)) {
          balances.set(transaction.accountId, balances.get(transaction.accountId)! - transaction.amountMinor);
        }
        if (transaction.transferAccountId && balances.has(transaction.transferAccountId)) {
          balances.set(
            transaction.transferAccountId,
            balances.get(transaction.transferAccountId)! + transaction.amountMinor,
          );
        }
        continue;
      }

      if (!transaction.accountId || !balances.has(transaction.accountId)) continue;
      const normalDirection = transaction.kind === "EXPENSE" ? -1n : 1n;
      const direction = transaction.reversalOfTransactionId === null ? normalDirection : -normalDirection;
      balances.set(transaction.accountId, balances.get(transaction.accountId)! + direction * transaction.amountMinor);
    }

    return [...this.accounts.values()]
      .filter((account) => balances.has(account.id))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((account) => {
        const currency = toCurrencyCode(account.currency);
        const currentBalanceMinor = balances.get(account.id)!;
        const spendability = getAccountSpendability({
          accountId: account.id,
          accountType: account.type,
          currency,
          currentBalanceMinor,
          requestedDebitMinor: 0n,
        });
        return {
          accountId: account.id,
          currency,
          currentBalanceMinor,
          availableBalanceMinor: spendability.availableBalanceMinor,
          spendabilityMode: spendability.mode,
        };
      });
  }

  private transactionListRows(
    workspaceId: string,
    filters: LedgerTransactionListFilters,
  ): LedgerTransactionListRow[] {
    // Keep correction history in the store, while making the default list
    // mirror the database query: originals and bookkeeping reversals are
    // obsolete. Replacements remain visible unless corrected again.
    const nonCurrentCorrectionTransactionIds = new Set(
      [...this.transactionCorrections.values()]
        .filter((correction) => correction.workspaceId === workspaceId)
        .flatMap((correction) => [
          correction.originalTransactionId,
          correction.reversalTransactionId,
        ]),
    );
    const reversedTransactionIds = new Set(
      [...this.transactions.values()].flatMap((transaction) =>
        transaction.reversalOfTransactionId === null ? [] : [transaction.reversalOfTransactionId],
      ),
    );
    return [...this.transactions.values()].flatMap((transaction) => {
      if (transaction.workspaceId !== workspaceId) return [];
      if (nonCurrentCorrectionTransactionIds.has(transaction.id)) return [];
      if (transaction.reversalOfTransactionId !== null || reversedTransactionIds.has(transaction.id)) return [];
      if (filters.kind && transaction.kind !== filters.kind) return [];
      if (filters.accountId && transaction.accountId !== filters.accountId) return [];
      if (filters.categoryId && transaction.categoryId !== filters.categoryId) return [];
      if (filters.occurredFrom && transaction.occurredAt < filters.occurredFrom) return [];
      if (filters.occurredToExclusive && transaction.occurredAt >= filters.occurredToExclusive) return [];

      const merchant = transaction.merchantId ? this.merchants.get(transaction.merchantId) ?? null : null;
      if (filters.search) {
        const query = filters.search.toLocaleLowerCase("en-US");
        const matchesMerchant = merchant?.name.toLocaleLowerCase("en-US").includes(query) ?? false;
        const matchesNote = transaction.note?.toLocaleLowerCase("en-US").includes(query) ?? false;
        if (!matchesMerchant && !matchesNote) return [];
      }

      return [{
        transaction,
        account: transaction.accountId ? this.accounts.get(transaction.accountId) ?? null : null,
        category: transaction.categoryId ? this.categories.get(transaction.categoryId) ?? null : null,
        merchant,
      }];
    });
  }

  private assertTransactionFingerprintAvailable(input: CreateLedgerTransactionRecord): void {
    if (
      input.deduplicationFingerprint
      && [...this.transactions.values()].some(
        (transaction) =>
          transaction.workspaceId === input.workspaceId
          && transaction.deduplicationFingerprint === input.deduplicationFingerprint,
      )
    ) {
      throw new Error("A transaction with that deduplication fingerprint already exists.");
    }
  }

  private createTransactionAudit(
    input: CreateLedgerTransactionAuditRecord,
    createdAt: Date,
  ): void {
    this.transactionAudits.set(input.id, { ...input, createdAt });
  }
}

function compareRows(left: LedgerTransactionListRow, right: LedgerTransactionListRow, direction: 1 | -1): number {
  const occurred = left.transaction.occurredAt.getTime() - right.transaction.occurredAt.getTime();
  if (occurred) return occurred * direction;
  const created = left.transaction.createdAt.getTime() - right.transaction.createdAt.getTime();
  if (created) return created * direction;
  return left.transaction.id.localeCompare(right.transaction.id) * direction;
}

function compareBigints(left: bigint, right: bigint): number {
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

/** Mirrors the balance repository's ledger-leg rules for correction projection. */
function accountMovementDelta(transaction: CreateLedgerTransactionRecord, accountId: string): bigint {
  if (transaction.kind === "TRANSFER") {
    if (transaction.accountId === accountId) return -transaction.amountMinor;
    if (transaction.transferAccountId === accountId) return transaction.amountMinor;
    return 0n;
  }
  if (transaction.accountId !== accountId) return 0n;
  const normalDirection = transaction.kind === "EXPENSE" ? -1n : 1n;
  const direction = transaction.reversalOfTransactionId === null ? normalDirection : -normalDirection;
  return direction * transaction.amountMinor;
}
