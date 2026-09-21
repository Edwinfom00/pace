import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  accountsListHref,
  buildAccountsOverview,
  parseAccountListFilter,
  type AccountOverviewBalance,
  type AccountOverviewSource,
} from "@/modules/accounts/domain/accounts-overview";

const accounts: readonly AccountOverviewSource[] = [
  { id: "account-main", name: "Main", type: "CHECKING", currency: "XAF", archivedAt: null },
  { id: "account-mobile", name: "MoMo", type: "MOBILE_MONEY", currency: "XAF", archivedAt: null },
  { id: "account-euro", name: "Euro", type: "SAVINGS", currency: "EUR", archivedAt: null },
  { id: "account-archived", name: "Old cash", type: "CASH", currency: "XAF", archivedAt: new Date("2026-01-01T00:00:00Z") },
];

const balances: readonly AccountOverviewBalance[] = [
  { accountId: "account-main", currency: "XAF", currentBalanceMinor: 650_000n, availableBalanceMinor: 620_000n, spendabilityMode: "ZERO_FLOOR" },
  { accountId: "account-mobile", currency: "XAF", currentBalanceMinor: 200_000n, availableBalanceMinor: 200_000n, spendabilityMode: "ZERO_FLOOR" },
  { accountId: "account-euro", currency: "EUR", currentBalanceMinor: 45_000n, availableBalanceMinor: 45_000n, spendabilityMode: "ZERO_FLOOR" },
  { accountId: "account-archived", currency: "XAF", currentBalanceMinor: 999_999n, availableBalanceMinor: 999_999n, spendabilityMode: "UNRESTRICTED" },
];

test("Accounts overview groups canonical balances by currency and never produces an FX total", () => {
  const overview = buildAccountsOverview({ accounts, balances, filter: "ALL" });

  assert.deepEqual(overview.summary, [
    { currency: "EUR", currentBalanceMinor: "45000", accountCount: 1 },
    { currency: "XAF", currentBalanceMinor: "850000", accountCount: 2 },
  ]);
  assert.equal(overview.summary.some((summary) => summary.currentBalanceMinor === "895000"), false);
  assert.equal(overview.accounts.find((account) => account.id === "account-main")?.availableBalanceMinor, "620000");
  assert.equal(overview.accounts.find((account) => account.id === "account-main")?.currentBalanceMinor, "650000");
});

test("Accounts counts and filter results retain archived historical accounts without counting them in active balances", () => {
  const active = buildAccountsOverview({ accounts, balances, filter: "ACTIVE" });
  const archived = buildAccountsOverview({ accounts, balances, filter: "ARCHIVED" });

  assert.deepEqual(active.counts, { ALL: 4, ACTIVE: 3, ARCHIVED: 1 });
  assert.deepEqual(active.accounts.map((account) => account.id), ["account-main", "account-mobile", "account-euro"]);
  assert.deepEqual(archived.accounts.map((account) => account.id), ["account-archived"]);
  assert.equal(archived.summary.find((summary) => summary.currency === "XAF")?.currentBalanceMinor, "850000");
});

test("Accounts filter parsing is canonical and produces stable, scoped URLs", () => {
  assert.equal(parseAccountListFilter(undefined), "ALL");
  assert.equal(parseAccountListFilter("ACTIVE"), "ACTIVE");
  assert.equal(parseAccountListFilter(["ARCHIVED", "ACTIVE"]), "ARCHIVED");
  assert.equal(parseAccountListFilter("anything-else"), "ALL");
  assert.equal(accountsListHref("/w/house/accounts", "ALL"), "/w/house/accounts");
  assert.equal(accountsListHref("/w/house/accounts", "ARCHIVED"), "/w/house/accounts?filter=ARCHIVED");
});

test("Accounts filters reuse the shared FilterLoadingSurface and keep the dedicated initial skeleton separate", async () => {
  const [filterSource, loadingSource, createSource] = await Promise.all([
    readFile(resolve("src/modules/accounts/ui/components/accounts-filter-loading.tsx"), "utf8"),
    readFile(resolve("src/app/w/[workspaceSlug]/accounts/loading.tsx"), "utf8"),
    readFile(resolve("src/modules/accounts/ui/components/accounts-create-control.tsx"), "utf8"),
  ]);

  assert.match(filterSource, /FilterLoadingSurface/);
  assert.doesNotMatch(filterSource, /animate-spin|AccountFilterLoader|AccountLoadingOverlay/);
  assert.match(loadingSource, /AccountsOverviewSkeleton/);
  assert.doesNotMatch(loadingSource, /FilterLoadingSurface/);
  assert.match(createSource, /CreateAccountForm/);
  assert.match(createSource, /\/ledger\/accounts/);
  assert.doesNotMatch(createSource, /FilterLoadingSurface/);
});
