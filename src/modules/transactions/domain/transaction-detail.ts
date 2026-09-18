import type { MerchantLogoKey } from "@/lib/transaction-visuals/merchant-logo-catalog";
import type { TransactionIconKey } from "@/lib/transaction-visuals/transaction-icon.types";
import type {
  LedgerTransactionKind,
  LedgerTransactionStatus,
} from "@/modules/ledger/domain";

import type { SerializedMoney } from "../types/transaction-ui.types";
import type { TransactionCapabilities } from "./transaction-action-policy";

export type TransactionDetailAccount = {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
};

export type TransactionDetailCategory = {
  readonly id: string;
  readonly name: string;
  readonly systemKey: string | null;
};

export type TransactionDetailMerchant = {
  readonly id: string;
  readonly name: string;
  readonly iconKey: TransactionIconKey | string | null;
  readonly merchantLogoKey: MerchantLogoKey | null;
};


export const TRANSACTION_DETAIL_ORIGINS = ["MANUAL", "AGENT", "IMPORT", "BANK_SYNC"] as const;
export type TransactionDetailOrigin = (typeof TRANSACTION_DETAIL_ORIGINS)[number];

export const TRANSACTION_DETAIL_SOURCE_CHANNELS = ["WEB"] as const;
export type TransactionDetailSourceChannel = (typeof TRANSACTION_DETAIL_SOURCE_CHANNELS)[number];

export type TransactionAccountImpact = {
  readonly account: TransactionDetailAccount;
  readonly direction: "INCREASE" | "DECREASE";
  readonly effect: SerializedMoney;
  /** Ledger-derived running balance immediately after this transaction. */
  readonly balanceAfter: SerializedMoney;
};

export type TransactionMonthlyCategoryContext = {
  readonly categoryName: string;
  readonly categorySystemKey: string | null;
  readonly direction: "SPENDING" | "INCOME";
  readonly period: string;
  readonly total: SerializedMoney;
};

export type TransactionDetailData = {
  readonly id: string;
  readonly kind: LedgerTransactionKind;
  readonly status: LedgerTransactionStatus;
  readonly amount: SerializedMoney;
  readonly occurredAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly note: string | null;
  readonly merchant: TransactionDetailMerchant | null;
  readonly category: TransactionDetailCategory | null;
  readonly account: TransactionDetailAccount | null;
  readonly transferAccount: TransactionDetailAccount | null;
  readonly source: {
    readonly origin: TransactionDetailOrigin;
    readonly channel: TransactionDetailSourceChannel | null;
  } | null;
  readonly capabilities: TransactionCapabilities;
  readonly context: {
    readonly accountImpacts: readonly TransactionAccountImpact[];
    readonly monthlyCategory: TransactionMonthlyCategoryContext | null;
  };
};
