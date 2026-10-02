import type { CategoryLocalizer } from "@/modules/ledger/category-localization";
import { getCategoryLocalizer } from "@/modules/ledger/server";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { InboxOverviewReader, InboxOverviewReadRow } from "../inbox-overview";
import {
  getInboxOverview,
  type GetInboxOverviewInput,
} from "../queries/get-inbox-overview";
import { DatabaseFinancialInboxOverviewReader } from "../repositories/financial-inbox-overview-reader";


export async function getServerInboxOverview(input: GetInboxOverviewInput) {
  return getInboxOverview(input, {
    reader: localizedInboxOverviewReader(
      new DatabaseFinancialInboxOverviewReader(),
      await getCategoryLocalizer(input.actor.userId),
    ),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}

function localizedInboxOverviewReader(
  reader: InboxOverviewReader,
  localizer: CategoryLocalizer,
): InboxOverviewReader {
  const localizeRow = (row: InboxOverviewReadRow): InboxOverviewReadRow => ({
    ...row,
    transaction: { ...row.transaction, category: localizer.category(row.transaction.category) },
    suggestedCategory: localizer.category(row.suggestedCategory),
  });
  return {
    async readInboxOverview(input) {
      const result = await reader.readInboxOverview(input);
      return {
        ...result,
        rows: result.rows.map(localizeRow),
        recentlyResolvedRows: result.recentlyResolvedRows.map(localizeRow),
      };
    },
  };
}
