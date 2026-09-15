import type { TransactionAccountOption } from "../ui/components/transaction-account.types";


/** Development-only records for the manual transaction form preview. */
export const transactionAccountFixtures = [
  { id: "cash", name: "Cash", type: "CASH", currency: "XAF" },
  { id: "main-account", name: "Main account", type: "CHECKING", currency: "XAF" },
  { id: "savings", name: "Savings", type: "SAVINGS", currency: "EUR" },
  { id: "mtn-momo", name: "MTN MoMo", type: "MOBILE_MONEY", currency: "XAF" },
] as const satisfies readonly TransactionAccountOption[];
