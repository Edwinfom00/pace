import type {
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
import type {
  CreateLedgerAccountRecord,
  CreateLedgerCategoryRecord,
  CreateLedgerMerchantRecord,
  CreateLedgerTransactionAuditRecord,
  CreateLedgerFinancialCorrectionRecord,
  CreateLedgerTransactionRecord,
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
  /** Test-only fault injection proves correction writes commit atomically. */
  failCorrectionStage: "reversal" | "replacement" | "linkage" | null = null;

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
  ): Promise<LedgerTransactionCorrectionRecord | null> {
    // Keep this preflight synchronous: async test callers can race exactly as
    // HTTP callers do, while one atomic in-memory commit still has one winner.
    const candidate = this.transactions.get(input.originalTransactionId);
    const original = candidate?.workspaceId === input.workspaceId ? candidate : null;
    if (
      !original
      || (input.expectedOriginalUpdatedAt
        && original.updatedAt.getTime() !== input.expectedOriginalUpdatedAt.getTime())
      || [...this.transactionCorrections.values()].some(
        (correction) =>
          correction.workspaceId === input.workspaceId
          && correction.originalTransactionId === input.originalTransactionId,
      )
    ) {
      return null;
    }
    if ([...this.transactionCorrections.values()].some(
      (correction) =>
        correction.workspaceId === input.workspaceId
        && correction.actorUserId === input.correction.actorUserId
        && correction.idempotencyKey === input.correction.idempotencyKey,
    )) {
      throw new Error("Correction idempotency key already exists.");
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
    return correction;
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
        transaction.refundedTransactionId === transactionId,
    );
  }

  async listTransactionAudit(
    workspaceId: string,
    transactionId: string,
  ): Promise<LedgerTransactionAuditRecord[]> {
    return [...this.transactionAudits.values()]
      .filter((audit) => audit.workspaceId === workspaceId && audit.transactionId === transactionId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id));
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
    return [...this.transactions.values()].flatMap((transaction) => {
      if (transaction.workspaceId !== workspaceId) return [];
      if (nonCurrentCorrectionTransactionIds.has(transaction.id)) return [];
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
