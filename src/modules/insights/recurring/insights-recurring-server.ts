import { DatabaseFinancialInboxRepository } from "@/modules/financial-inbox/repositories/financial-inbox-repository";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getInsightsRecurringWithReaders,
  type GetInsightsRecurringInput,
} from "./get-insights-recurring";
import type { InsightsRecurring } from "./insights-recurring.types";

export function getInsightsRecurring(
  input: GetInsightsRecurringInput,
): Promise<InsightsRecurring> {
  const ledger = new DatabaseLedgerRepository();
  const workspaces = new DatabaseWorkspaceRepository();
  const inbox = new DatabaseFinancialInboxRepository();
  return getInsightsRecurringWithReaders(input, {
    findMembership: (workspaceId, userId) =>
      workspaces.findMembership(workspaceId, userId),
    listTransactions: (workspaceId) => ledger.listTransactions(workspaceId),
    listMerchants: (workspaceId) => ledger.listMerchants(workspaceId),
    listCorrections: (workspaceId) =>
      ledger.listTransactionCorrections(workspaceId),
    listRecurringPayments: (workspaceId) =>
      inbox.listRecurringPayments(workspaceId),
  });
}
