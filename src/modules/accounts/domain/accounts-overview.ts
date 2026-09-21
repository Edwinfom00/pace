import type { LedgerAccountType } from "@/modules/ledger/domain";

export const ACCOUNT_LIST_FILTERS = ["ALL", "ACTIVE", "ARCHIVED"] as const;

export type AccountListFilter = (typeof ACCOUNT_LIST_FILTERS)[number];
export type AccountOverviewStatus = Exclude<AccountListFilter, "ALL">;

export type AccountOverviewBalance = {
  readonly accountId: string;
  readonly currency: string;
  readonly currentBalanceMinor: bigint;
  readonly availableBalanceMinor: bigint;
  readonly spendabilityMode: "ZERO_FLOOR" | "UNRESTRICTED" | "UNSUPPORTED";
};

export type AccountOverviewSource = {
  readonly id: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly currency: string;
  readonly archivedAt: Date | null;
};

export type AccountOverviewItem = {
  readonly id: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly currency: string;
  readonly status: AccountOverviewStatus;
  readonly currentBalanceMinor: string;
  readonly availableBalanceMinor: string;
  readonly spendabilityMode: "ZERO_FLOOR" | "UNRESTRICTED" | "UNSUPPORTED";
};

export type AccountsBalanceSummary = {
  readonly currency: string;
  readonly currentBalanceMinor: string;
  readonly accountCount: number;
};

export type AccountsOverview = {
  readonly filter: AccountListFilter;
  readonly counts: Readonly<Record<AccountListFilter, number>>;
  readonly summary: readonly AccountsBalanceSummary[];
  readonly accounts: readonly AccountOverviewItem[];
};

export function parseAccountListFilter(value: string | string[] | undefined): AccountListFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "ACTIVE" || candidate === "ARCHIVED" ? candidate : "ALL";
}

export function accountsListHref(pathname: string, filter: AccountListFilter): string {
  return filter === "ALL" ? pathname : `${pathname}?filter=${filter}`;
}

export function buildAccountsOverview({
  accounts,
  balances,
  filter,
}: {
  readonly accounts: readonly AccountOverviewSource[];
  readonly balances: readonly AccountOverviewBalance[];
  readonly filter: AccountListFilter;
}): AccountsOverview {
  const balanceByAccountId = new Map(balances.map((balance) => [balance.accountId, balance]));
  const items = accounts.map((account) => {
    const balance = balanceByAccountId.get(account.id);
    if (!balance) throw new Error(`Canonical balance missing for account ${account.id}.`);
    if (balance.currency !== account.currency) {
      throw new Error(`Canonical balance currency mismatch for account ${account.id}.`);
    }

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      status: account.archivedAt ? "ARCHIVED" : "ACTIVE",
      currentBalanceMinor: balance.currentBalanceMinor.toString(),
      availableBalanceMinor: balance.availableBalanceMinor.toString(),
      spendabilityMode: balance.spendabilityMode,
    } satisfies AccountOverviewItem;
  });

  const counts = {
    ALL: items.length,
    ACTIVE: items.filter((account) => account.status === "ACTIVE").length,
    ARCHIVED: items.filter((account) => account.status === "ARCHIVED").length,
  } as const satisfies Readonly<Record<AccountListFilter, number>>;

  const summaryByCurrency = new Map<string, { currentBalanceMinor: bigint; accountCount: number }>();
  for (const account of items) {
    if (account.status !== "ACTIVE") continue;
    const previous = summaryByCurrency.get(account.currency) ?? { currentBalanceMinor: 0n, accountCount: 0 };
    summaryByCurrency.set(account.currency, {
      currentBalanceMinor: previous.currentBalanceMinor + BigInt(account.currentBalanceMinor),
      accountCount: previous.accountCount + 1,
    });
  }

  const summary = [...summaryByCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, total]) => ({
      currency,
      currentBalanceMinor: total.currentBalanceMinor.toString(),
      accountCount: total.accountCount,
    }));

  return {
    filter,
    counts,
    summary,
    accounts: filter === "ALL" ? items : items.filter((account) => account.status === filter),
  };
}
