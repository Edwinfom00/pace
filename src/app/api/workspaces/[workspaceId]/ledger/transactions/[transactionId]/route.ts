import {
  updateTransactionDetails,
  type UpdateTransactionDetailsInput,
} from "@/modules/ledger/update-transaction-details";

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
