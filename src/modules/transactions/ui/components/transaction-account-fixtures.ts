/**
 * Temporary presentation data for M8.5C.4. These entries are deliberately
 * isolated from accounts and will be replaced by workspace account data.
 */
export type TransactionAccountType = "CASH" | "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "MOBILE_MONEY" | "OTHER";

export type TransactionAccountFixture = {
  readonly id: string;
  readonly name: string;
  readonly type: TransactionAccountType;
  readonly currency: string;
};

export const transactionAccountFixtures = [
  { id: "cash", name: "Cash", type: "CASH", currency: "XAF" },
  { id: "main-account", name: "Main account", type: "CHECKING", currency: "XAF" },
  { id: "savings", name: "Savings", type: "SAVINGS", currency: "EUR" },
  { id: "mtn-momo", name: "MTN MoMo", type: "MOBILE_MONEY", currency: "XAF" },
] as const satisfies readonly TransactionAccountFixture[];

export type TransactionAccountFixtureId = (typeof transactionAccountFixtures)[number]["id"];
