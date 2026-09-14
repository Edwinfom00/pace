"use client";

import { FinanceNavigation } from "@/app/components/finance-navigation";
import type { RecurringPaymentView } from "@/modules/financial-inbox/financial-inbox-service";
import { getTranslations, type SupportedLanguage } from "@/i18n/messages";
import Link from "next/link";

export function RecurringDashboard({
  initialPayments,
  language,
  locale,
}: {
  initialPayments: readonly RecurringPaymentView[];
  language: SupportedLanguage;
  locale: string;
}) {
  const t = getTranslations(language);
  return (
    <main className="finance-shell">
      <FinanceNavigation active="recurring" language={language} />
      <section className="finance-content" aria-label={t("recurring.title")}>
        <header className="finance-page-header">
          <div>
            <p className="finance-kicker">{t("brand.name")}</p>
            <h1>{t("recurring.title")}</h1>
            <p>{t("recurring.subtitle")}</p>
          </div>
          <Link className="finance-link-button" href="/inbox">{t("recurring.reviewCandidates")}</Link>
        </header>
        {initialPayments.length === 0 ? <p className="finance-empty">{t("recurring.empty")}</p> : null}
        <div className="recurring-grid">
          {initialPayments.map((payment) => {
            const amount = new Intl.NumberFormat(locale, {
              style: "currency",
              currency: payment.currency,
              maximumFractionDigits: 0,
            }).format(Number(payment.typicalAmountMinor));
            const lastPayment = new Intl.DateTimeFormat(locale, {
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(new Date(payment.lastOccurredAt));
            return (
              <article className="recurring-card" key={payment.id}>
                <div className="recurring-card-heading">
                  <div className="finance-item-icon" aria-hidden="true">{payment.normalizedMerchant.slice(0, 1)}</div>
                  <span className={`recurring-status recurring-${payment.status.toLocaleLowerCase("en-US")}`}>
                    {t(`recurring.${payment.status.toLocaleLowerCase("en-US")}` as "recurring.candidate")}
                  </span>
                </div>
                <h2>{payment.normalizedMerchant}</h2>
                <strong>{amount}</strong>
                <p>{t("recurring.cadence", { days: payment.cadenceDays })}</p>
                <dl>
                  <div><dt>{t("recurring.lastPayment")}</dt><dd>{lastPayment}</dd></div>
                  <div><dt>{t("recurring.samples", { count: payment.sampleTransactionIds.length })}</dt></div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
