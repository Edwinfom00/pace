import { requireAuthenticatedActor } from "@/authorization/session";
import { createAccount } from "@/modules/ledger/create-account";
import { presentLedgerAccount } from "@/modules/ledger/presenters";
import { getLedgerService } from "@/modules/ledger/server";

import { jsonError } from "../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    const accounts = await getLedgerService().listAccounts(actor, workspaceId);
    return Response.json({ accounts: accounts.map(presentLedgerAccount) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, input] = await Promise.all([context.params, request.json()]);
    const command = input && typeof input === "object" && !Array.isArray(input)
      ? { ...input, workspaceId }
      : input;
    const result = await createAccount(command);
    if (!result.ok) {
      return Response.json(
        { error: "Account creation failed.", code: result.code },
        { status: accountCreationStatus(result.code) },
      );
    }
    return Response.json({ account: result.account }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

function accountCreationStatus(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "WORKSPACE_FORBIDDEN") return 403;
  if (code.startsWith("INVALID_")) return 400;
  return 500;
}
