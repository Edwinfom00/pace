import { requireAuthenticatedActor } from "@/authorization/session";
import { presentLedgerTransaction } from "@/modules/ledger/presenters";
import { getLedgerService } from "@/modules/ledger/server";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import {
  createLedgerTransactionSchema,
  listLedgerTransactionsSchema,
} from "@/modules/ledger/validation";

import { jsonError, parseJson } from "../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    const searchParams = new URL(request.url).searchParams;
    const input = listLedgerTransactionsSchema.parse({
      status: searchParams.get("status") ?? undefined,
      accountId: searchParams.get("accountId") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      merchantId: searchParams.get("merchantId") ?? undefined,
      occurredFrom: searchParams.get("occurredFrom") ?? undefined,
      occurredTo: searchParams.get("occurredTo") ?? undefined,
    });
    const transactions = await getLedgerService().listTransactions(actor, workspaceId, {
      statuses: input.status ? [input.status] : undefined,
      accountId: input.accountId,
      categoryId: input.categoryId,
      merchantId: input.merchantId,
      occurredFrom: input.occurredFrom,
      occurredTo: input.occurredTo,
    });
    return Response.json({ transactions: transactions.map(presentLedgerTransaction) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, createLedgerTransactionSchema),
    ]);
    const transaction = await getLedgerService().createTransaction(actor, workspaceId, input);
    try {
      await getFinancialInboxService().ingestTransaction(actor, workspaceId, { transaction });
    } catch (classificationError) {
      // The append-only ledger write is already complete. Classification is an
      // overlay and cannot invalidate a verified financial mutation.
      console.error("Financial classification deferred", classificationError);
    }
    return Response.json({ transaction: presentLedgerTransaction(transaction) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
