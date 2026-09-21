import { z } from "zod";

import { LEDGER_ACCOUNT_TYPES } from "./domain";

const entityId = z.string().trim().uuid();
const workspaceId = z.string().trim().min(1).max(255);
const idempotencyKey = z.string().trim().uuid();
const expectedUpdatedAt = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), "Expected version must be a valid timestamp.")
  .optional();

const base = { workspaceId, accountId: entityId, idempotencyKey, expectedUpdatedAt };

export const manageAccountSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("RENAME"), name: z.string().trim().min(1).max(120) }).strict(),
  z.object({ ...base, action: z.literal("CHANGE_TYPE"), type: z.enum(LEDGER_ACCOUNT_TYPES) }).strict(),
  z.object({ ...base, action: z.literal("ARCHIVE") }).strict(),
  z.object({ ...base, action: z.literal("RESTORE") }).strict(),
]);

export type ManageAccountInput = z.input<typeof manageAccountSchema>;
export type ManageAccountCommand = z.output<typeof manageAccountSchema>;

export type ManagedAccountDTO = {
  readonly id: string;
  readonly name: string;
  readonly type: (typeof LEDGER_ACCOUNT_TYPES)[number];
  readonly currency: string;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
};

export type ManageAccountErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_MANAGEMENT_NOT_ALLOWED"
  | "ACCOUNT_TYPE_CHANGE_NOT_ALLOWED"
  | "ACCOUNT_HAS_FINANCIAL_ACTIVITY"
  | "ACCOUNT_ALREADY_ARCHIVED"
  | "ACCOUNT_NOT_ARCHIVED"
  | "ACCOUNT_UNAVAILABLE"
  | "ACCOUNT_WORKSPACE_MISMATCH"
  | "CONCURRENT_MODIFICATION"
  | "ACCOUNT_MANAGEMENT_IDEMPOTENCY_CONFLICT"
  | "INVALID_ACCOUNT_NAME"
  | "INVALID_ACCOUNT_TYPE"
  | "INVALID_ACCOUNT_MANAGEMENT_COMMAND"
  | "ACCOUNT_MANAGEMENT_FAILED";

export type ManageAccountResult =
  | { readonly ok: true; readonly account: ManagedAccountDTO }
  | { readonly ok: false; readonly code: ManageAccountErrorCode };

export function accountManagementValidationErrorCode(error: z.ZodError): ManageAccountErrorCode {
  const fields = new Set(error.issues.map((issue) => issue.path[0]));
  if (fields.has("name")) return "INVALID_ACCOUNT_NAME";
  if (fields.has("type")) return "INVALID_ACCOUNT_TYPE";
  return "INVALID_ACCOUNT_MANAGEMENT_COMMAND";
}
