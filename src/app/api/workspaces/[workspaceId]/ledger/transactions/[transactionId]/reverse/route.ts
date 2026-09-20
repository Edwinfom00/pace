import {
  reverseTransaction,
  type ReverseTransactionInput,
} from "@/modules/ledger/reverse-transaction";

interface RouteContext {
  params: Promise<{ workspaceId: string; transactionId: string }>;
}

/** Server-only endpoint for the canonical manual-reversal command. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const [{ workspaceId, transactionId }, body] = await Promise.all([
    context.params,
    request.json().catch(() => null),
  ]);
  const input = isRecord(body) ? { ...body, workspaceId, transactionId } : body;
  const result = await reverseTransaction(input as ReverseTransactionInput);

  if (result.ok) return Response.json({ reversal: result.reversal });
  return Response.json(
    { error: "Transaction reversal failed.", code: result.code },
    { status: reversalTransactionStatus(result.code) },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function reversalTransactionStatus(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "WORKSPACE_FORBIDDEN") return 403;
  if (code === "TRANSACTION_NOT_FOUND") return 404;
  if (
    code === "TRANSACTION_REVERSAL_NOT_ALLOWED"
    || code === "TRANSACTION_ALREADY_REVERSED"
    || code === "TRANSACTION_NOT_CURRENT"
    || code === "TRANSACTION_HAS_ACTIVE_REFUNDS"
    || code === "CONCURRENT_MODIFICATION"
    || code === "REVERSAL_ALREADY_PROCESSED"
  ) {
    return 409;
  }
  if (code === "INVALID_REVERSAL") return 400;
  return 500;
}
