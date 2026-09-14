import { requireAuthenticatedActor } from "@/authorization/session";
import { presentLedgerMerchant } from "@/modules/ledger/presenters";
import { getLedgerService } from "@/modules/ledger/server";
import { createLedgerMerchantSchema } from "@/modules/ledger/validation";

import { jsonError, parseJson } from "../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    const merchants = await getLedgerService().listMerchants(actor, workspaceId);
    return Response.json({ merchants: merchants.map(presentLedgerMerchant) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, createLedgerMerchantSchema),
    ]);
    const merchant = await getLedgerService().createMerchant(actor, workspaceId, input);
    return Response.json({ merchant: presentLedgerMerchant(merchant) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
