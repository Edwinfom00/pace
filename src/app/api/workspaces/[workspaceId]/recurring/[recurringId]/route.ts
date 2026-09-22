import { parseJson, jsonError } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import { z } from "zod";

interface RouteContext {
  params: Promise<{ workspaceId: string; recurringId: string }>;
}

const expectedUpdatedAt = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), "Expected version must be a valid timestamp.")
  .optional();

const recurringReviewSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CONFIRM"),
    expectedUpdatedAt,
    idempotencyKey: z.string().trim().min(1).max(180),
  }).strict(),
  z.object({
    action: z.literal("IGNORE"),
    expectedUpdatedAt,
    idempotencyKey: z.string().trim().min(1).max(180),
    reason: z.string().trim().max(500).optional(),
  }).strict(),
]);


export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ workspaceId, recurringId }, actor, input] = await Promise.all([
      context.params,
      requireAuthenticatedActor(),
      parseJson(request, recurringReviewSchema),
    ]);
    const service = getFinancialInboxService();
    const payment = input.action === "CONFIRM"
      ? await service.confirmRecurring(actor, { workspaceId, recurringId, ...input })
      : await service.ignoreRecurring(actor, { workspaceId, recurringId, ...input });
    return Response.json({ payment });
  } catch (error) {
    return jsonError(error);
  }
}
