import { z } from "zod";

const idempotencyKey = z.string().trim().min(1).max(180);
const entityId = z.string().trim().uuid();
const version = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), "Expected version must be a valid timestamp.");

const optionalVersion = version.optional();


export type AcceptInboxCategorySuggestionCommand = {
  readonly workspaceId: string;
  readonly inboxItemId: string;
  readonly expectedInboxUpdatedAt?: Date;
  readonly expectedTransactionUpdatedAt?: Date;
  readonly expectedSuggestionCategoryId: string;
  readonly expectedSuggestionUpdatedAt: Date;
  readonly idempotencyKey: string;
};

export type ChooseInboxCategoryCommand = {
  readonly workspaceId: string;
  readonly inboxItemId: string;
  readonly categoryId: string;
  readonly expectedInboxUpdatedAt?: Date;
  readonly expectedTransactionUpdatedAt?: Date;
  readonly idempotencyKey: string;
};

export const inboxCategoryResolutionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ACCEPT_SUGGESTION"),
    expectedInboxUpdatedAt: optionalVersion,
    expectedTransactionUpdatedAt: optionalVersion,
    // A category id alone cannot protect against a re-run that produces the
    // same category; the classification version is therefore mandatory.
    expectedSuggestionCategoryId: entityId,
    expectedSuggestionUpdatedAt: version,
    idempotencyKey,
  }).strict(),
  z.object({
    action: z.literal("CHOOSE_CATEGORY"),
    categoryId: entityId,
    expectedInboxUpdatedAt: optionalVersion,
    expectedTransactionUpdatedAt: optionalVersion,
    idempotencyKey,
  }).strict(),
]);

export type InboxCategoryResolutionInput = z.output<typeof inboxCategoryResolutionSchema>;
