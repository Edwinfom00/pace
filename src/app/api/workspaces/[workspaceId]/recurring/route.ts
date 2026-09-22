import { parseJson, jsonError } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import { z } from "zod";

const createManualRecurringSchema = z.object({
  direction: z.enum(["EXPENSE", "INCOME"]),
  name: z.string(),
  amountMinor: z.string().trim().regex(/^[1-9]\d*$/, "Amount must be positive integer minor units.")
    .transform((value) => BigInt(value)),
  currency: z.string(),
  cadenceDays: z.number().int(),
  nextOccurrenceAt: z.coerce.date(),
  accountId: z.string().trim().min(1).max(160).nullable().optional(),
  categoryId: z.string().trim().min(1).max(160).nullable().optional(),
  merchantOrSource: z.string().nullable().optional(),
  idempotencyKey: z.string(),
}).strict();

export async function GET(
  _request: Request,
  context: RouteContext<"/api/workspaces/[workspaceId]/recurring">,
): Promise<Response> {
  try {
    const [{ workspaceId }, actor] = await Promise.all([context.params, requireAuthenticatedActor()]);
    const payments = await getFinancialInboxService().listRecurring(actor, workspaceId);
    return Response.json({ payments });
  } catch (error) {
    return jsonError(error);
  }
}

/** Server-only manual recurring foundation; no creation UI invokes this yet. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/workspaces/[workspaceId]/recurring">,
): Promise<Response> {
  try {
    const [{ workspaceId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, createManualRecurringSchema),
    ]);
    const payment = await getFinancialInboxService().createManualRecurring(actor, {
      workspaceId,
      ...input,
    });
    return Response.json({ payment });
  } catch (error) {
    return jsonError(error);
  }
}
