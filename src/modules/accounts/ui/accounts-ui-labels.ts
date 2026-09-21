import type { DashboardLabels } from "@/i18n/dashboard-messages";
import type { LedgerAccountType } from "@/modules/ledger/domain";
import type { CreateAccountUiLabels } from "@/modules/ledger/ui/components/create-account-labels";

import type { AccountListFilter, AccountOverviewStatus } from "../domain/accounts-overview";

export type AccountsUiLabels = {
  readonly title: string;
  readonly subtitle: string;
  readonly add: string;
  readonly summaryTitle: string;
  readonly summaryAccounts: string;
  readonly summaryEmpty: string;
  readonly filtersLabel: string;
  readonly filters: Readonly<Record<AccountListFilter, string>>;
  readonly balanceCurrent: string;
  readonly balanceAvailable: string;
  readonly status: Readonly<Record<AccountOverviewStatus, string>>;
  readonly empty: Readonly<Record<AccountListFilter, { readonly title: string; readonly description: string }>>;
  readonly errorTitle: string;
  readonly errorRetry: string;
  readonly sharedFilterLoading: string;
  readonly createTitle: string;
  readonly createSubtitle: string;
  readonly createSuccess: string;
  readonly createErrorGeneric: string;
  readonly createErrorWorkspaceForbidden: string;
  readonly createErrorWorkspaceChanged: string;
  readonly createForm: CreateAccountUiLabels;
  readonly type: Readonly<Record<LedgerAccountType, string>>;
};

export function getAccountsUiLabels(labels: DashboardLabels): AccountsUiLabels {
  return {
    title: labels["accounts.title"],
    subtitle: labels["accounts.subtitle"],
    add: labels["accounts.add"],
    summaryTitle: labels["accounts.summary.title"],
    summaryAccounts: labels["accounts.summary.activeAccounts"],
    summaryEmpty: labels["accounts.summary.empty"],
    filtersLabel: labels["accounts.filters.label"],
    filters: {
      ALL: labels["accounts.filters.all"],
      ACTIVE: labels["accounts.filters.active"],
      ARCHIVED: labels["accounts.filters.archived"],
    },
    balanceCurrent: labels["accounts.balance.current"],
    balanceAvailable: labels["accounts.balance.available"],
    status: {
      ACTIVE: labels["accounts.status.active"],
      ARCHIVED: labels["accounts.status.archived"],
    },
    empty: {
      ALL: { title: labels["accounts.empty.all.title"], description: labels["accounts.empty.all.description"] },
      ACTIVE: { title: labels["accounts.empty.active.title"], description: labels["accounts.empty.active.description"] },
      ARCHIVED: { title: labels["accounts.empty.archived.title"], description: labels["accounts.empty.archived.description"] },
    },
    errorTitle: labels["accounts.error.title"],
    errorRetry: labels["accounts.error.retry"],
    sharedFilterLoading: labels["shared.loading.filter"],
    createTitle: labels["accounts.create.title"],
    createSubtitle: labels["accounts.create.subtitle"],
    createSuccess: labels["accounts.create.success"],
    createErrorGeneric: labels["accounts.create.errorGeneric"],
    createErrorWorkspaceForbidden: labels["accounts.create.errorWorkspaceForbidden"],
    createErrorWorkspaceChanged: labels["accounts.create.errorWorkspaceChanged"],
    createForm: {
      create: labels["accounts.actions.create"],
      pending: labels["accounts.create.pending"],
      cancel: labels["accounts.actions.cancel"],
      name: labels["accounts.fields.name"],
      namePlaceholder: labels["accounts.fields.namePlaceholder"],
      type: labels["accounts.fields.type"],
      typePlaceholder: labels["accounts.fields.typePlaceholder"],
      typeSearch: labels["accounts.fields.typeSearch"],
      typeEmpty: labels["accounts.fields.typeEmpty"],
      currency: labels["accounts.fields.currency"],
      currencyPlaceholder: labels["accounts.fields.currencyPlaceholder"],
      currencyEmpty: labels["transactions.form.currencyEmpty"],
      currencySearch: labels["transactions.form.currencySearch"],
      openingBalance: labels["accounts.fields.openingBalance"],
      openingBalanceOptional: labels["accounts.fields.openingBalanceOptional"],
      openingBalanceHelper: labels["accounts.fields.openingBalanceHelper"],
      errors: {
        name: labels["accounts.create.errorName"],
        type: labels["accounts.create.errorType"],
        currency: labels["accounts.create.errorCurrency"],
        openingBalance: labels["accounts.create.errorOpeningBalance"],
      },
      accountTypes: {
        CASH: { label: labels["accounts.type.cash.label"], description: labels["accounts.type.cash.description"] },
        CHECKING: { label: labels["accounts.type.checking.label"], description: labels["accounts.type.checking.description"] },
        SAVINGS: { label: labels["accounts.type.savings.label"], description: labels["accounts.type.savings.description"] },
        CREDIT_CARD: { label: labels["accounts.type.creditCard.label"], description: labels["accounts.type.creditCard.description"] },
        MOBILE_MONEY: { label: labels["accounts.type.mobileMoney.label"], description: labels["accounts.type.mobileMoney.description"] },
        OTHER: { label: labels["accounts.type.other.label"], description: labels["accounts.type.other.description"] },
      },
    },
    type: {
      CASH: labels["accounts.type.cash.label"],
      CHECKING: labels["accounts.type.checking.label"],
      SAVINGS: labels["accounts.type.savings.label"],
      CREDIT_CARD: labels["accounts.type.creditCard.label"],
      MOBILE_MONEY: labels["accounts.type.mobileMoney.label"],
      OTHER: labels["accounts.type.other.label"],
    },
  };
}
