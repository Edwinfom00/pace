import { DatabaseFinancialInboxRepository } from "@/modules/financial-inbox/repositories/financial-inbox-repository";
import { getInsightService } from "@/modules/insights/server";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getFinancialReportWithReaders,
  type GetFinancialReportInput,
} from "./application/get-financial-report";

export function getFinancialReport(input: GetFinancialReportInput) {
  const ledger = new DatabaseLedgerRepository();
  const workspaces = new DatabaseWorkspaceRepository();
  const inbox = new DatabaseFinancialInboxRepository();
  const insights = getInsightService();
  return getFinancialReportWithReaders(input, {
    findMembership: (workspaceId, userId) =>
      workspaces.findMembership(workspaceId, userId),
    listTransactions: (workspaceId) => ledger.listTransactions(workspaceId),
    listCategories: (workspaceId) => ledger.listCategories(workspaceId),
    listMerchants: (workspaceId) => ledger.listMerchants(workspaceId),
    listAccounts: (workspaceId) => ledger.listAccounts(workspaceId),
    getAccountBalance: (workspaceId, accountId) =>
      ledger.getAccountBalance(workspaceId, accountId),
    findOpeningBalance: (workspaceId, accountId) =>
      ledger.findOpeningBalance(workspaceId, accountId),
    listCorrections: (workspaceId) =>
      ledger.listTransactionCorrections(workspaceId),
    listRecurringPayments: (workspaceId) =>
      inbox.listRecurringPayments(workspaceId),
    previewInsights: (actor, workspaceId, preview) =>
      insights.previewPeriodInsights(actor, workspaceId, preview),
  });
}
