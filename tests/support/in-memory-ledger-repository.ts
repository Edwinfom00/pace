import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerTransactionFilters,
  LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import type {
  CreateLedgerAccountRecord,
  CreateLedgerCategoryRecord,
  CreateLedgerMerchantRecord,
  CreateLedgerTransactionRecord,
  LedgerRepository,
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
    const now = new Date();
    const record: LedgerTransactionRecord = { ...input, createdAt: now, updatedAt: now };
    this.transactions.set(record.id, record);
    return record;
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
}
