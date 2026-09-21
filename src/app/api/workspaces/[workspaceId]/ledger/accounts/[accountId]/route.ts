import {
  manageAccount,
  type ManageAccountInput,
} from "@/modules/ledger/manage-account";

interface RouteContext {
  params: Promise<{ workspaceId: string; accountId: string }>;
}

/**
 * Deliberately server-only account lifecycle endpoint. No management UI is
 * introduced by this route; it is the guarded boundary the future UI will use.
 */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const [{ workspaceId, accountId }, body] = await Promise.all([
    context.params,
    request.json().catch(() => null),
  ]);
  const input = isRecord(body) ? { ...body, workspaceId, accountId } : body;
  const result = await manageAccount(input as ManageAccountInput);

  if (result.ok) return Response.json({ account: result.account });
  return Response.json(
    { error: "Account management failed.", code: result.code },
    { status: accountManagementStatus(result.code) },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function accountManagementStatus(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "WORKSPACE_FORBIDDEN") return 403;
  if (code === "ACCOUNT_NOT_FOUND") return 404;
  if (
    code === "ACCOUNT_MANAGEMENT_NOT_ALLOWED"
    || code === "ACCOUNT_TYPE_CHANGE_NOT_ALLOWED"
    || code === "ACCOUNT_HAS_FINANCIAL_ACTIVITY"
    || code === "ACCOUNT_ALREADY_ARCHIVED"
    || code === "ACCOUNT_NOT_ARCHIVED"
    || code === "ACCOUNT_UNAVAILABLE"
    || code === "ACCOUNT_WORKSPACE_MISMATCH"
    || code === "CONCURRENT_MODIFICATION"
    || code === "ACCOUNT_MANAGEMENT_IDEMPOTENCY_CONFLICT"
  ) {
    return 409;
  }
  if (code === "INVALID_ACCOUNT_NAME" || code === "INVALID_ACCOUNT_TYPE" || code === "INVALID_ACCOUNT_MANAGEMENT_COMMAND") {
    return 400;
  }
  return 500;
}
