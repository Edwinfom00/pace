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

const requiredExpectedUpdatedAt = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), "Expected version must be a valid timestamp.");

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
  z.object({
    action: z.literal("RESTORE"),
    expectedUpdatedAt,
    idempotencyKey: z.string().trim().min(1).max(180),
  }).strict(),
  z.object({
    action: z.literal("UPDATE"),
    name: z.string().optional(),
    amountMinor: z.string().trim().regex(/^[1-9]\d*$/, "Amount must be positive integer minor units.")
      .transform((value) => BigInt(value))
      .refine((value) => value <= 9_223_372_036_854_775_807n, "Amount must fit PostgreSQL bigint.")
      .optional(),
    cadenceDays: z.number().int().optional(),
    nextOccurrenceAt: z.coerce.date().optional(),
    accountId: z.string().trim().min(1).max(160).nullable().optional(),
    categoryId: z.string().trim().min(1).max(160).nullable().optional(),
    expectedUpdatedAt: requiredExpectedUpdatedAt,
    idempotencyKey: z.string().trim().min(1).max(180),
  }).strict(),
  z.object({
    action: z.literal("PAUSE"),
    expectedUpdatedAt: requiredExpectedUpdatedAt,
    idempotencyKey: z.string().trim().min(1).max(180),
  }).strict(),
  z.object({
    action: z.literal("RESUME"),
    expectedUpdatedAt: requiredExpectedUpdatedAt,
    idempotencyKey: z.string().trim().min(1).max(180),
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
      : input.action === "IGNORE"
        ? await service.ignoreRecurring(actor, { workspaceId, recurringId, ...input })
        : input.action === "RESTORE"
          ? await service.restoreRecurring(actor, { workspaceId, recurringId, ...input })
          : input.action === "UPDATE"
            ? await service.updateRecurring(actor, { workspaceId, recurringId, ...input })
            : input.action === "PAUSE"
              ? await service.pauseRecurring(actor, { workspaceId, recurringId, ...input })
              : await service.resumeRecurring(actor, { workspaceId, recurringId, ...input });
    return Response.json({ payment });
  } catch (error) {
    return jsonError(error);
  }
}
