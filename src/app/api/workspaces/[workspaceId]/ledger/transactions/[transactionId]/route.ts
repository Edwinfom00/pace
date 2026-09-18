import {
  updateTransactionDetails,
  type UpdateTransactionDetailsInput,
} from "@/modules/ledger/update-transaction-details";
import {
  correctTransaction,
  type CorrectTransactionInput,
} from "@/modules/ledger/correct-transaction";

interface RouteContext {
  params: Promise<{ workspaceId: string; transactionId: string }>;
}


export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const [{ workspaceId, transactionId }, body] = await Promise.all([
    context.params,
    request.json().catch(() => null),
  ]);
  const input = isRecord(body)
    ? { ...body, workspaceId, transactionId }
    : body;
  const result = await updateTransactionDetails(input as UpdateTransactionDetailsInput);

  if (result.ok) return Response.json({ transaction: result.transaction });

  return Response.json(
    { error: "Transaction update failed.", code: result.code },
    { status: updateTransactionStatus(result.code) },
  );
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const [{ workspaceId, transactionId }, body] = await Promise.all([
    context.params,
    request.json().catch(() => null),
  ]);
  const input = isRecord(body)
    ? { ...body, workspaceId, transactionId }
    : body;
  const result = await correctTransaction(input as CorrectTransactionInput);

  if (result.ok) return Response.json({ correction: result.correction });

  return Response.json(
    { error: "Transaction correction failed.", code: result.code },
    { status: correctionTransactionStatus(result.code) },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function updateTransactionStatus(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "WORKSPACE_FORBIDDEN") return 403;
  if (code === "TRANSACTION_NOT_FOUND") return 404;
  if (code === "CONCURRENT_MODIFICATION" || code === "TRANSACTION_EDIT_NOT_ALLOWED") return 409;
  if (code === "INVALID_CATEGORY" || code === "CATEGORY_NOT_ALLOWED" || code === "INVALID_COUNTERPARTY" || code === "INVALID_OCCURRED_AT") return 400;
  return 500;
}

function correctionTransactionStatus(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "WORKSPACE_FORBIDDEN") return 403;
  if (code === "TRANSACTION_NOT_FOUND" || code === "ACCOUNT_NOT_FOUND") return 404;
  if (
    code === "TRANSACTION_CORRECTION_NOT_ALLOWED"
    || code === "TRANSACTION_ALREADY_REVERSED"
    || code === "TRANSACTION_NOT_CURRENT"
    || code === "CONCURRENT_MODIFICATION"
    || code === "CORRECTION_ALREADY_PROCESSED"
  ) {
    return 409;
  }
  if (
    code === "INVALID_CORRECTION"
    || code === "INVALID_AMOUNT"
    || code === "INVALID_CATEGORY"
    || code === "CATEGORY_NOT_ALLOWED"
    || code === "INVALID_COUNTERPARTY"
    || code === "INVALID_OCCURRED_AT"
    || code === "ACCOUNT_UNAVAILABLE"
    || code === "ACCOUNT_WORKSPACE_MISMATCH"
    || code === "CURRENCY_MISMATCH"
    || code === "SAME_TRANSFER_ACCOUNT"
    || code === "CROSS_CURRENCY_TRANSFER_UNSUPPORTED"
  ) {
    return 400;
  }
  return 500;
}
