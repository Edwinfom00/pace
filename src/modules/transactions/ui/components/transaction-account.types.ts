import type { LedgerAccountType } from "@/modules/ledger/domain";

export type TransactionAccountOption = {
  readonly id: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly currency: string;
};


/** A user-entered option which exists only for the active transaction dialog. */
export type AccountDraftOption = TransactionAccountOption & {
  readonly source: "local-draft";
  readonly openingBalance: string;
};
