import type { CategoryLocalizer } from "../category-localization";
import type {
  LedgerCategoryRecord,
  LedgerTransactionListPageInput,
  LedgerTransactionListRow,
} from "../domain";
import {
  DatabaseLedgerRepository,
  type AccountDetailTopExpenseCategoriesInput,
  type LedgerAccountDetailCategoryTotal,
  type LedgerAccountDetailRecentTransactionRow,
} from "./ledger-repository";


export class LocalizedLedgerRepository extends DatabaseLedgerRepository {
  constructor(private readonly localizer: CategoryLocalizer) {
    super();
  }

  override async listCategories(workspaceId: string): Promise<LedgerCategoryRecord[]> {
    return this.localizer.categories(await super.listCategories(workspaceId));
  }

  override async findCategory(workspaceId: string, categoryId: string): Promise<LedgerCategoryRecord | null> {
    return this.localizer.category(await super.findCategory(workspaceId, categoryId));
  }

  override async listTransactionListPage(
    workspaceId: string,
    input: LedgerTransactionListPageInput,
  ): Promise<readonly LedgerTransactionListRow[]> {
    const rows = await super.listTransactionListPage(workspaceId, input);
    return rows.map((row) => ({ ...row, category: this.localizer.category(row.category) }));
  }

  override async listAccountDetailRecentTransactions(
    workspaceId: string,
    accountId: string,
    limit?: number,
  ): Promise<readonly LedgerAccountDetailRecentTransactionRow[]> {
    const rows = await super.listAccountDetailRecentTransactions(workspaceId, accountId, limit);
    return rows.map((row) => ({ ...row, category: this.localizer.category(row.category) }));
  }

  override async getAccountDetailTopExpenseCategories(
    input: AccountDetailTopExpenseCategoriesInput,
  ): Promise<readonly LedgerAccountDetailCategoryTotal[]> {
    return this.localizer.categories(await super.getAccountDetailTopExpenseCategories(input));
  }
}
