"use client";

import { FiDollarSign } from "react-icons/fi";

import type { CurrencyCode } from "@/money/currency";
import type { AccountsOverview } from "@/modules/accounts/domain/accounts-overview";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";

import type { AccountsUiLabels } from "../accounts-ui-labels";
import { AccountCard } from "../components/account-card";
import { AccountsAskPace } from "../components/accounts-ask-pace";
import { AccountsCreateControl } from "../components/accounts-create-control";
import { AccountsEmptyState } from "../components/accounts-empty-state";
import {
  AccountsFilterLoadingProvider,
  AccountsFilterLoadingSurface,
} from "../components/accounts-filter-loading";
import { AccountsFilterTabs } from "../components/accounts-filter-tabs";

function formatActiveAccountCount(template: string, count: number): string {
  return template.replaceAll("{count}", String(count));
}

function AccountsBalanceSummary({
  labels,
  locale,
  overview,
}: {
  readonly labels: AccountsUiLabels;
  readonly locale: string;
  readonly overview: AccountsOverview;
}) {
  return (
    <section aria-labelledby="accounts-balance-summary" className="rounded-[12px] border border-[#e4e9f0] bg-white p-5 sm:p-6">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#14203a]" id="accounts-balance-summary">{labels.summaryTitle}</h2>
      {overview.summary.length ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {overview.summary.map((total) => (
            <div className="flex min-w-0 items-center gap-3.5" key={total.currency}>
              <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-[13px] bg-[#eef4ff] text-[#2563eb]"><FiDollarSign className="size-5" /></span>
              <dl className="min-w-0">
                <dt className="text-[12px] font-medium text-[#71809a]">{total.currency}</dt>
                <dd className="mt-0.5 truncate text-[22px] font-semibold tracking-[-0.04em] text-[#101a35]">{formatOverviewMoney(total.currentBalanceMinor, total.currency, locale)}</dd>
                <dd className="mt-1 text-[12px] text-[#71809a]">{formatActiveAccountCount(labels.summaryAccounts, total.accountCount)}</dd>
              </dl>
            </div>
          ))}
        </div>
      ) : <p className="mt-5 text-[13px] text-[#71809a]">{labels.summaryEmpty}</p>}
    </section>
  );
}

export function AccountsOverviewView({
  defaultCurrency,
  labels,
  language,
  locale,
  overview,
  timeZone,
  workspaceId,
}: {
  readonly defaultCurrency: CurrencyCode;
  readonly labels: AccountsUiLabels;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly overview: AccountsOverview;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  return (
    <AccountsFilterLoadingProvider selectedFilter={overview.filter}>
      <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
          <div>
            <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">{labels.title}</h1>
            <p className="mt-1 text-[13px] text-[#71809a]">{labels.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AccountsAskPace language={language} locale={locale} timeZone={timeZone} workspaceId={workspaceId} />
            <AccountsCreateControl defaultCurrency={defaultCurrency} key={workspaceId} labels={labels} language={language} workspaceId={workspaceId} />
          </div>
        </header>

        <AccountsBalanceSummary labels={labels} locale={locale} overview={overview} />

        <section className="mt-7">
          <AccountsFilterTabs counts={overview.counts} labels={labels} />
          <AccountsFilterLoadingSurface label={labels.sharedFilterLoading}>
            <div aria-label={labels.title} className="pt-4" id="accounts-results" role="tabpanel">
              {overview.accounts.length ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {overview.accounts.map((account) => <AccountCard account={account} key={account.id} labels={labels} locale={locale} />)}
                </div>
              ) : <AccountsEmptyState filter={overview.filter} labels={labels} />}
            </div>
          </AccountsFilterLoadingSurface>
        </section>
      </main>
    </AccountsFilterLoadingProvider>
  );
}
