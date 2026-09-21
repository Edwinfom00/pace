import {
  correctOpeningBalance,
} from "@/modules/ledger/correct-opening-balance";
import {
  setOpeningBalance,
  type SetOpeningBalanceInput,
} from "@/modules/ledger/set-opening-balance";
import type {
  CorrectOpeningBalanceInput,
} from "@/modules/ledger/opening-balance-contract";

interface RouteContext {
  params: Promise<{ workspaceId: string; accountId: string }>;
}

/** Server-only foundation for the future Opening Balance product surface. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const [{ workspaceId, accountId }, body] = await Promise.all([
    context.params,
    request.json().catch(() => null),
  ]);
  const input = isRecord(body) ? { ...body, workspaceId, accountId } : body;
  const result = await setOpeningBalance(input as SetOpeningBalanceInput);
  if (result.ok) return Response.json({ openingBalance: result.openingBalance }, { status: 201 });
  return Response.json(
    { error: "Opening balance establishment failed.", code: result.code },
    { status: setOpeningBalanceStatus(result.code) },
  );
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const [{ workspaceId, accountId }, body] = await Promise.all([
    context.params,
    request.json().catch(() => null),
  ]);
  const input = isRecord(body) ? { ...body, workspaceId, accountId } : body;
  const result = await correctOpeningBalance(input as CorrectOpeningBalanceInput);
  if (result.ok) return Response.json({ openingBalance: result.openingBalance });
  return Response.json(
    { error: "Opening balance correction failed.", code: result.code },
    { status: correctOpeningBalanceStatus(result.code) },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function setOpeningBalanceStatus(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "WORKSPACE_FORBIDDEN") return 403;
  if (code === "ACCOUNT_NOT_FOUND") return 404;
  if (
    code === "ACCOUNT_WORKSPACE_MISMATCH"
    || code === "ACCOUNT_UNAVAILABLE"
    || code === "OPENING_BALANCE_ALREADY_EXISTS"
    || code === "OPENING_BALANCE_ALREADY_PROCESSED"
    || code === "CONCURRENT_MODIFICATION"
  ) return 409;
  if (code === "NEGATIVE_OPENING_BALANCE_NOT_ALLOWED" || code === "CURRENCY_MISMATCH" || code === "INVALID_OPENING_BALANCE") return 400;
  return 500;
}

function correctOpeningBalanceStatus(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "WORKSPACE_FORBIDDEN") return 403;
  if (code === "ACCOUNT_NOT_FOUND" || code === "OPENING_BALANCE_NOT_FOUND") return 404;
  if (
    code === "ACCOUNT_WORKSPACE_MISMATCH"
    || code === "ACCOUNT_UNAVAILABLE"
    || code === "OPENING_BALANCE_ALREADY_PROCESSED"
    || code === "CONCURRENT_MODIFICATION"
  ) return 409;
  if (code === "NEGATIVE_OPENING_BALANCE_NOT_ALLOWED" || code === "INVALID_OPENING_BALANCE") return 400;
  return 500;
}
