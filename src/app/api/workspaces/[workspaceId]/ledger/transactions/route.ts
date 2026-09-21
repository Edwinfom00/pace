import { requireAuthenticatedActor } from "@/authorization/session";
import { createExpense } from "@/modules/ledger/create-expense";
import { createIncome } from "@/modules/ledger/create-income";
import { createRefund } from "@/modules/ledger/create-refund";
import { createTransfer } from "@/modules/ledger/create-transfer";
import { presentLedgerTransaction } from "@/modules/ledger/presenters";
import { getLedgerService } from "@/modules/ledger/server";
import { listLedgerTransactionsSchema } from "@/modules/ledger/validation";

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

    if (isCanonicalRefundRequest(input)) {
      const result = await createRefund({ ...input, workspaceId });
      if (!result.ok) {
        return Response.json(
          { error: "Refund creation failed.", code: result.code },
          { status: canonicalRefundCreationStatus(result.code) },
        );
      }
      return Response.json({ refund: result.refund }, { status: 201 });
    }

    
    if (isCanonicalTransferRequest(input)) {
      const command = { ...input, workspaceId };
      const result = await createTransfer(command);
      if (!result.ok) {
        return Response.json(
          {
            error: "Transfer creation failed.",
            code: result.code,
            ...("details" in result ? { details: result.details } : {}),
          },
          { status: canonicalManualCreationStatus(result.code) },
        );
      }
      return Response.json({ transfer: result.transfer }, { status: 201 });
    }

    if (isCanonicalIncomeRequest(input)) {
      const command = { ...input, workspaceId };
      const result = await createIncome(command);
      if (!result.ok) {
        return Response.json(
          { error: "Income creation failed.", code: result.code },
          { status: canonicalManualCreationStatus(result.code) },
        );
      }
      return Response.json({ income: result.income }, { status: 201 });
    }

    if (isCanonicalExpenseRequest(input)) {
      const command = { ...input, workspaceId };
      const result = await createExpense(command);
      if (!result.ok) {
        return Response.json(
          {
            error: "Expense creation failed.",
            code: result.code,
            ...("details" in result ? { details: result.details } : {}),
          },
          { status: canonicalManualCreationStatus(result.code) },
        );
      }
      return Response.json({ expense: result.expense }, { status: 201 });
    }

    return Response.json(
      { error: "Transaction creation failed.", code: "INVALID_TRANSACTION_COMMAND" },
      { status: 400 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

function isCanonicalRefundRequest(input: unknown): input is Record<string, unknown> {
  return Boolean(
    input
    && typeof input === "object"
    && !Array.isArray(input)
    && !('kind' in input)
    && "expenseTransactionId" in input
    && "amountMinor" in input
    && "idempotencyKey" in input,
  );
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

function isCanonicalIncomeRequest(input: unknown): input is Record<string, unknown> {
  return Boolean(
    input
    && typeof input === "object"
    && !Array.isArray(input)
    && !("kind" in input)
    && Object.hasOwn(input, "source"),
  );
}

function isCanonicalTransferRequest(input: unknown): input is Record<string, unknown> {
  return Boolean(
    input
    && typeof input === "object"
    && !Array.isArray(input)
    && !("kind" in input)
    && ("fromAccountId" in input || "toAccountId" in input),
  );
}

function canonicalManualCreationStatus(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "WORKSPACE_FORBIDDEN") return 403;
  if (
    code === "ACCOUNT_UNAVAILABLE"
    || code === "ACCOUNT_SPENDABILITY_UNSUPPORTED"
    || code === "INSUFFICIENT_FUNDS"
    || code === "CURRENCY_MISMATCH"
    || code === "SAME_TRANSFER_ACCOUNT"
    || code === "CROSS_CURRENCY_TRANSFER_UNSUPPORTED"
    || code === "IDEMPOTENCY_KEY_REUSED"
    || code === "CONCURRENT_MODIFICATION"
  ) {
    return 409;
  }
  if (
    code.startsWith("INVALID_")
    || code === "ACCOUNT_NOT_FOUND"
    || code === "FROM_ACCOUNT_NOT_FOUND"
    || code === "TO_ACCOUNT_NOT_FOUND"
    || code === "CATEGORY_NOT_ALLOWED"
  ) {
    return 400;
  }
  return 500;
}

function canonicalRefundCreationStatus(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "WORKSPACE_FORBIDDEN") return 403;
  if (code === "TRANSACTION_NOT_FOUND" || code === "ACCOUNT_NOT_FOUND") return 404;
  if (
    code === "REFUND_NOT_ALLOWED"
    || code === "SOURCE_NOT_EXPENSE"
    || code === "TRANSACTION_NOT_CURRENT"
    || code === "EXPENSE_ALREADY_FULLY_REFUNDED"
    || code === "REFUND_EXCEEDS_REMAINING_AMOUNT"
    || code === "CONCURRENT_MODIFICATION"
    || code === "REFUND_ALREADY_PROCESSED"
    || code === "ACCOUNT_UNAVAILABLE"
    || code === "ACCOUNT_WORKSPACE_MISMATCH"
  ) return 409;
  if (code.startsWith("INVALID_")) return 400;
  return 500;
}
