import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { formatReportLabel, getReportLabels } from "@/i18n/report-messages";
import type { FinancialReportDTO } from "../domain/financial-report.types";
import styles from "./financial-report.module.css";

function reportMonth(report: FinancialReportDTO) {
  return new Intl.DateTimeFormat(report.meta.locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(`${report.period.firstDate}T12:00:00`));
}

type FinancialReportPageProps = {
  readonly children: React.ReactNode;
  readonly number: number;
  readonly report: FinancialReportDTO;
  readonly section?: string;
  readonly cover?: boolean;
};

export function FinancialReportPage({
  children,
  number,
  report,
  section,
  cover = false,
}: FinancialReportPageProps) {
  const labels = getReportLabels(report.meta.language);
  return (
    <article className={`${styles.page} ${cover ? styles.cover : ""}`}>
      {!cover && (
        <header className={styles.header}>
          <PaceLogo width={54} height={18} />
          <span>
            {section} · {formatReportLabel(labels, "report.header.title")} ·{" "}
            {reportMonth(report)}
          </span>
        </header>
      )}
      <div className={cover ? styles.coverBody : styles.body}>{children}</div>
      <footer className={styles.footer}>
        {cover ? (
          <span className={styles.coverFooterBrand}>
            <PaceLogo variant="icon" width={12} height={12} />
            <span>{labels["report.brand.tagline"]}</span>
          </span>
        ) : (
          <span>Pace</span>
        )}
        <span>{number}</span>
      </footer>
    </article>
  );
}
