import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getInboxOverview,
  type GetInboxOverviewInput,
} from "../queries/get-inbox-overview";
import { DatabaseFinancialInboxOverviewReader } from "../repositories/financial-inbox-overview-reader";


export function getServerInboxOverview(input: GetInboxOverviewInput) {
  return getInboxOverview(input, {
    reader: new DatabaseFinancialInboxOverviewReader(),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}
