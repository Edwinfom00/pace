import type { CurrencyCode } from "@/money/currency";

export type TransactionAccountOption = {
  readonly id: string;
  readonly name: string;
  readonly currency: CurrencyCode;
};

export type TransactionAccountOptionsState =
  | { readonly status: "ready"; readonly accounts: readonly TransactionAccountOption[] }
  | { readonly status: "error"; readonly accounts: readonly [] };

export function failedTransactionAccountOptions(): TransactionAccountOptionsState {
  return { status: "error", accounts: [] };
}

/** Converts a failed server read into an explicit empty error state, never fixture data. */
export async function loadTransactionAccountOptions(
  query: () => Promise<readonly TransactionAccountOption[]>,
): Promise<TransactionAccountOptionsState> {
  try {
    return { status: "ready", accounts: await query() };
  } catch {
    return failedTransactionAccountOptions();
  }
}
