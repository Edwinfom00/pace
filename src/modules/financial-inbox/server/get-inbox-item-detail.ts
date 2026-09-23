import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { getInboxItemDetail, type GetInboxItemDetailInput } from "../queries/get-inbox-item-detail";
import { DatabaseFinancialInboxDetailReader } from "../repositories/financial-inbox-detail-reader";

export function getServerInboxItemDetail(input: GetInboxItemDetailInput) {
  return getInboxItemDetail(input, {
    reader: new DatabaseFinancialInboxDetailReader(),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}
