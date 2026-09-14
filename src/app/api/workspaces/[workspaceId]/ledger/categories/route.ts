import { requireAuthenticatedActor } from "@/authorization/session";
import { presentLedgerCategory } from "@/modules/ledger/presenters";
import { getLedgerService } from "@/modules/ledger/server";
import { createLedgerCategorySchema } from "@/modules/ledger/validation";

import { jsonError, parseJson } from "../../../../_lib/http";

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    const categories = await getLedgerService().listCategories(actor, workspaceId);
    return Response.json({ categories: categories.map(presentLedgerCategory) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, createLedgerCategorySchema),
    ]);
    const category = await getLedgerService().createCategory(actor, workspaceId, input);
    return Response.json({ category: presentLedgerCategory(category) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
