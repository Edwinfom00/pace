import type { LedgerCategoryKind } from "@/modules/ledger/domain";


export type TransactionCategoryOption = {
  readonly id: string;
  readonly name: string;
  readonly kind: LedgerCategoryKind;
  readonly systemKey: string | null;
};

export type TransactionCategoryOptionsState =
  | { readonly status: "ready"; readonly categories: readonly TransactionCategoryOption[] }
  | { readonly status: "error"; readonly categories: readonly [] };

export function failedTransactionCategoryOptions(): TransactionCategoryOptionsState {
  return { status: "error", categories: [] };
}

export function getCompatibleTransactionCategoryOptions(
  categories: readonly TransactionCategoryOption[],
  kind: LedgerCategoryKind,
): readonly TransactionCategoryOption[] {
  return categories.filter((category) => category.kind === kind);
}


export async function loadTransactionCategoryOptions(
  query: () => Promise<readonly TransactionCategoryOption[]>,
): Promise<TransactionCategoryOptionsState> {
  try {
    return { status: "ready", categories: await query() };
  } catch {
    return failedTransactionCategoryOptions();
  }
}
