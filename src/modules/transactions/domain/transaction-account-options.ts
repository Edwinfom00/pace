import type { CurrencyCode } from "@/money/currency";
import type { LedgerAccountType } from "@/modules/ledger/domain";
import type { LedgerSpendabilityMode } from "@/modules/ledger/spendability-policy";

export type TransactionAccountOption = {
  readonly id: string;
  readonly name: string;
  readonly currency: CurrencyCode;
  readonly type?: LedgerAccountType;
  readonly currentBalanceMinor?: string;
  readonly availableBalanceMinor?: string;
  readonly spendabilityMode?: LedgerSpendabilityMode;
};

export type TransactionAccountOptionsState =
  | { readonly status: "ready"; readonly accounts: readonly TransactionAccountOption[] }
  | { readonly status: "error"; readonly accounts: readonly [] };

export function failedTransactionAccountOptions(): TransactionAccountOptionsState {
  return { status: "error", accounts: [] };
}

export async function loadTransactionAccountOptions(
  query: () => Promise<readonly TransactionAccountOption[]>,
): Promise<TransactionAccountOptionsState> {
  try {
    return { status: "ready", accounts: await query() };
  } catch {
    return failedTransactionAccountOptions();
  }
}
