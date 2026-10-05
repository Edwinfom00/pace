import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { getReportLabels } from "@/i18n/report-messages";
import type { FinancialReportDTO } from "../domain/financial-report.types";
import styles from "./financial-report.module.css";

export function reportMonth(report: FinancialReportDTO) {
  return new Intl.DateTimeFormat(report.meta.locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(`${report.period.firstDate}T12:00:00`));
}

type FinancialReportPageProps = {
  readonly children: React.ReactNode;
  readonly number: number;
  readonly report: FinancialReportDTO;
  readonly cover?: boolean;
};

export function FinancialReportPage({
  children,
  number,
  report,
  cover = false,
}: FinancialReportPageProps) {
  const labels = getReportLabels(report.meta.language);
  return (
    <article className={`${styles.page} ${cover ? styles.cover : ""}`}>
      {!cover && (
        <header className={styles.header}>
          <PaceLogo width={100} height={30} />
          <span>
            {labels["report.header.title"]} • {reportMonth(report)}
          </span>
        </header>
      )}
      <div className={cover ? styles.coverBody : styles.body}>{children}</div>
      <footer className={styles.footer}>
        {cover ? (
          <span className={styles.coverFooterBrand}>
            <PaceLogo variant="icon" width={34} height={34} />
            <span>{labels["report.brand.tagline"]}</span>
          </span>
        ) : (
          <span />
        )}
        <span>{number}</span>
      </footer>
    </article>
  );
}
