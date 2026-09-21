import type { LedgerAccountType } from "@/modules/ledger/domain";

export type CreateAccountUiLabels = {
  readonly create: string;
  readonly pending: string;
  readonly cancel: string;
  readonly name: string;
  readonly namePlaceholder: string;
  readonly type: string;
  readonly typePlaceholder: string;
  readonly typeSearch: string;
  readonly typeEmpty: string;
  readonly currency: string;
  readonly currencyPlaceholder: string;
  readonly currencyEmpty: string;
  readonly currencySearch: string;
  readonly openingBalance: string;
  readonly openingBalanceOptional: string;
  readonly openingBalanceHelper: string;
  readonly errors: {
    readonly name: string;
    readonly type: string;
    readonly currency: string;
    readonly openingBalance: string;
  };
  readonly accountTypes: Readonly<Record<LedgerAccountType, { readonly label: string; readonly description: string }>>;
};
