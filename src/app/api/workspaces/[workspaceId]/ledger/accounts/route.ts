import { requireAuthenticatedActor } from "@/authorization/session";
import { presentLedgerAccount } from "@/modules/ledger/presenters";
import { getLedgerService } from "@/modules/ledger/server";
import { createLedgerAccountSchema } from "@/modules/ledger/validation";

import { jsonError, parseJson } from "../../../../_lib/http";

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
    const [{ workspaceId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, createLedgerAccountSchema),
    ]);
    const account = await getLedgerService().createAccount(actor, workspaceId, input);
    return Response.json({ account: presentLedgerAccount(account) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
