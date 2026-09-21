import type { IconType } from "react-icons";
import {
  FiBriefcase,
  FiCreditCard,
  FiDollarSign,
  FiHome,
  FiSmartphone,
} from "react-icons/fi";

import { LEDGER_ACCOUNT_TYPES, type LedgerAccountType } from "@/modules/ledger/domain";

export type AccountTypeMetadata = {
  readonly type: LedgerAccountType;
  readonly icon: IconType;
};

const accountTypeMetadataByType = {
  CASH: { type: "CASH", icon: FiDollarSign },
  CHECKING: { type: "CHECKING", icon: FiHome },
  SAVINGS: { type: "SAVINGS", icon: FiBriefcase },
  CREDIT_CARD: { type: "CREDIT_CARD", icon: FiCreditCard },
  MOBILE_MONEY: { type: "MOBILE_MONEY", icon: FiSmartphone },
  OTHER: { type: "OTHER", icon: FiBriefcase },
} as const satisfies Readonly<Record<LedgerAccountType, AccountTypeMetadata>>;

export const ACCOUNT_TYPE_METADATA = LEDGER_ACCOUNT_TYPES.map((type) => accountTypeMetadataByType[type]);

export function getAccountTypeMetadata(type: LedgerAccountType): AccountTypeMetadata {
  return accountTypeMetadataByType[type];
}
