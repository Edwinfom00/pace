import { requireAuthenticatedActor } from "@/authorization/session";
import { createExpense } from "@/modules/ledger/create-expense";
import { presentLedgerTransaction } from "@/modules/ledger/presenters";
import { getLedgerService } from "@/modules/ledger/server";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import {
  createLedgerTransactionSchema,
  listLedgerTransactionsSchema,
} from "@/modules/ledger/validation";

import { jsonError } from "../../../../_lib/http";

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
    const [{ workspaceId }, input] = await Promise.all([context.params, request.json()]);

    
    if (isCanonicalExpenseRequest(input)) {
      const command = { ...input, workspaceId };
      const result = await createExpense(command);
      if (!result.ok) {
        return Response.json(
          { error: "Expense creation failed.", code: result.code },
          { status: expenseCreationStatus(result.code) },
        );
      }
      return Response.json({ expense: result.expense }, { status: 201 });
    }

    const [actor, parsedInput] = await Promise.all([
      requireAuthenticatedActor(),
      Promise.resolve(createLedgerTransactionSchema.parse(input)),
    ]);
    const transaction = await getLedgerService().createTransaction(actor, workspaceId, parsedInput);
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

function isCanonicalExpenseRequest(input: unknown): input is Record<string, unknown> {
  return Boolean(
    input
    && typeof input === "object"
    && !Array.isArray(input)
    && !("kind" in input)
    && ("amount" in input || "accountId" in input || "date" in input),
  );
}

function expenseCreationStatus(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "WORKSPACE_FORBIDDEN") return 403;
  if (code === "ACCOUNT_UNAVAILABLE" || code === "CURRENCY_MISMATCH") return 409;
  if (code.startsWith("INVALID_") || code === "ACCOUNT_NOT_FOUND" || code === "CATEGORY_NOT_ALLOWED") return 400;
  return 500;
}
