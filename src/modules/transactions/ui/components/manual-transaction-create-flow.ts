import type { CreatedManualTransactionDTO } from "@/modules/ledger/manual-transaction-contract";


export function formatManualTransactionDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function manualTransactionCreationErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const code = (payload as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function parseCreatedManualTransactionDTO<Type extends "EXPENSE" | "INCOME">(
  payload: unknown,
  property: "expense" | "income",
  type: Type,
): CreatedManualTransactionDTO<Type> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const transaction = (payload as Record<string, unknown>)[property];
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) return null;
  const value = transaction as Record<string, unknown>;

  if (
    typeof value.id !== "string"
    || value.type !== type
    || typeof value.amountMinor !== "string"
    || typeof value.currency !== "string"
    || typeof value.accountId !== "string"
    || (value.categoryId !== null && typeof value.categoryId !== "string")
    || (value.merchantId !== null && typeof value.merchantId !== "string")
    || typeof value.occurredAt !== "string"
    || (value.note !== null && typeof value.note !== "string")
    || (value.status !== "POSTED" && value.status !== "PENDING")
  ) {
    return null;
  }

  return value as CreatedManualTransactionDTO<Type>;
}
