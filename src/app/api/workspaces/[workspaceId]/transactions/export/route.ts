import { requireAuthenticatedActor } from "@/authorization/session";
import { NotFoundError } from "@/authorization/errors";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import {
  transactionCsvFileName,
  transactionsToCsv,
} from "@/modules/transactions/domain/transaction-csv";
import { parseTransactionSearchParams } from "@/modules/transactions/queries/transaction-search-params";
import { getServerTransactionsPage } from "@/modules/transactions/server/get-transactions-page";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { jsonError } from "../../../../_lib/http";

export const runtime = "nodejs";

const EXPORT_ROW_LIMIT = 5000;

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const [{ workspaceId }, actor] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
    ]);
    const workspace = await new DatabaseWorkspaceRepository().findMemberContext(
      workspaceId,
      actor.userId,
    );
    if (!workspace) throw new NotFoundError("Workspace not found.");

    const language = await getPersistedDashboardLanguage(actor.userId);
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const filters = parseTransactionSearchParams(query);
    const result = await getServerTransactionsPage({
      actor,
      workspaceId,
      filters: { ...filters, page: 1, pageSize: EXPORT_ROW_LIMIT },
      timeZone: workspace.preferences.timezone,
      unknownMerchantName:
        getDashboardLabels(language)["transactions.merchant.unknown"],
    });
    const now = new Date();

    return new Response(
      transactionsToCsv(result.items, workspace.preferences.timezone),
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${transactionCsvFileName(now)}"`,
          "Content-Type": "text/csv; charset=utf-8",
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
