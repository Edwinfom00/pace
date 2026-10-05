import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Banknote,
  CalendarDays,
  ChartColumnIncreasing,
  ChartPie,
  CreditCard,
  Landmark,
  Lightbulb,
  PiggyBank,
  ReceiptText,
  Smartphone,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import { formatReportLabel, getReportLabels } from "@/i18n/report-messages";
import { resolveTransactionIcon } from "@/lib/transaction-visuals/transaction-icon-matcher";
import { getCurrencyExponent } from "@/money";
import {
  formatOverviewMoney,
  minorToChartValue,
} from "@/modules/overview/domain/overview-formatters";

import type {
  FinancialReportDTO,
  ReportInsight,
  ReportMetric,
  ReportCountMetric,
  ReportRecommendation,
  ReportPageKind,
} from "../domain/financial-report.types";
import styles from "./financial-report.module.css";
import { FinancialReportPage as ReportPage, reportMonth } from "./financial-report-page";

type Props = {
  readonly report: FinancialReportDTO;
  readonly pdf?: boolean;
};

type PageProps = {
  readonly report: FinancialReportDTO;
  readonly number: number;
  readonly section: number;
};

type Tone = "green" | "red" | "blue" | "purple" | "orange" | "amber" | "gray";

const TONES: Record<Tone, { readonly background: string; readonly color: string }> = {
  green: { background: "#e6f7ef", color: "#16a066" },
  red: { background: "#fdeced", color: "#ef4450" },
  blue: { background: "#e9f1ff", color: "#2563eb" },
  purple: { background: "#f1ebff", color: "#7c4ddb" },
  orange: { background: "#fff1e2", color: "#f08a12" },
  amber: { background: "#fff5df", color: "#f2a20c" },
  gray: { background: "#eef1f6", color: "#5b6b85" },
};

const CATEGORY_COLORS = [
  "#2f7bf6",
  "#ff5a5f",
  "#22b07d",
  "#ffb547",
  "#1ec8e6",
  "#5b5fe0",
  "#a66cf0",
];
const OTHER_COLOR = "#c5cdd9";

const CATEGORY_TEXT_COLORS: Record<string, string> = {
  FOOD: "#e8870e",
  TRANSPORT: "#c04fd6",
  HOME: "#6656b8",
  HEALTH: "#15835a",
  EDUCATION: "#3a68bd",
  SHOPPING: "#a463e6",
  DIGITAL: "#4f63e8",
  FINANCE: "#14845c",
  INCOME: "#16a066",
  TRAVEL: "#2675a6",
  COMMUNITY: "#b66a3f",
  PETS: "#a96c37",
  ELECTRONICS: "#5366b8",
  AGRICULTURE: "#56823c",
  DELIVERY: "#735fbc",
  PROFESSIONAL: "#52627d",
  UTILITIES: "#8b5cf6",
  GENERIC: "#52627d",
};

const ACCOUNT_VISUALS: Record<string, { readonly icon: LucideIcon; readonly tone: Tone }> = {
  CHECKING: { icon: Landmark, tone: "blue" },
  SAVINGS: { icon: PiggyBank, tone: "green" },
  CASH: { icon: Banknote, tone: "orange" },
  CREDIT_CARD: { icon: CreditCard, tone: "purple" },
  MOBILE_MONEY: { icon: Smartphone, tone: "blue" },
  OTHER: { icon: Wallet, tone: "gray" },
};

function labels(report: FinancialReportDTO) {
  return getReportLabels(report.meta.language);
}

function money(report: FinancialReportDTO, value: string | bigint) {
  return formatOverviewMoney(value, report.currency.code, report.meta.locale);
}

function signedMoney(report: FinancialReportDTO, value: string | bigint) {
  const amount = BigInt(value);
  return `${amount > 0n ? "+" : amount < 0n ? "−" : ""}${money(report, amount < 0n ? -amount : amount)}`;
}

function plainAmount(report: FinancialReportDTO, value: string | bigint) {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  const exponent = getCurrencyExponent(report.currency.code);
  const divisor = 10n ** BigInt(exponent);
  const integer = new Intl.NumberFormat(report.meta.locale).format(absolute / divisor);
  if (exponent === 0) return integer;
  const decimal =
    new Intl.NumberFormat(report.meta.locale)
      .formatToParts(1.5)
      .find((part) => part.type === "decimal")?.value ?? ".";
  return `${integer}${decimal}${(absolute % divisor).toString().padStart(exponent, "0")}`;
}

function signedPlain(report: FinancialReportDTO, value: string | bigint) {
  const amount = BigInt(value);
  return `${amount > 0n ? "+" : amount < 0n ? "−" : ""}${plainAmount(report, amount)}`;
}

function percentage(report: FinancialReportDTO, value: string) {
  return report.meta.language === "fr" ? `${value} %` : `${value}%`;
}

function percent(report: FinancialReportDTO, bps: number) {
  return percentage(
    report,
    new Intl.NumberFormat(report.meta.locale, { maximumFractionDigits: 1 }).format(bps / 100),
  );
}

function date(report: FinancialReportDTO, value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(report.meta.locale, options).format(
    new Date(`${value}T12:00:00`),
  );
}

function capitalize(report: FinancialReportDTO, value: string) {
  return value.charAt(0).toLocaleUpperCase(report.meta.locale) + value.slice(1);
}

function shortMonth(report: FinancialReportDTO, month: string) {
  return capitalize(report, date(report, `${month}-01`, { month: "short" }).replace(/\.$/, ""));
}

function previousMonthShort(report: FinancialReportDTO) {
  return date(report, report.period.previous.firstDate, { month: "short", year: "numeric" });
}

function previousMonthLong(report: FinancialReportDTO) {
  return date(report, report.period.previous.firstDate, { month: "long", year: "numeric" });
}

function periodRange(report: FinancialReportDTO) {
  const format = new Intl.DateTimeFormat(report.meta.locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return format.formatRange(
    new Date(`${report.period.firstDate}T12:00:00`),
    new Date(`${report.period.lastDate}T12:00:00`),
  );
}

function sectionLabel(section: number) {
  return `${String(section).padStart(2, "0")}.`;
}

function IconBadge({
  icon: Icon,
  tone,
  shape = "square",
  size = "md",
}: {
  readonly icon: LucideIcon;
  readonly tone: Tone;
  readonly shape?: "square" | "circle";
  readonly size?: "md" | "lg";
}) {
  const palette = TONES[tone];
  return (
    <span
      className={`${styles.badge} ${shape === "circle" ? styles.badgeCircle : ""} ${size === "lg" ? styles.badgeLarge : ""}`}
      style={{ background: palette.background }}>
      <Icon aria-hidden="true" color={palette.color} strokeWidth={2} />
    </span>
  );
}

function PageIntro({
  section,
  name,
  title,
  subtitle,
}: {
  readonly section: number;
  readonly name: string;
  readonly title: string;
  readonly subtitle: string;
}) {
  return (
    <div className={styles.intro}>
      <p className={styles.eyebrow}>
        <span>{sectionLabel(section)}</span> {name}
      </p>
      <h1>{title}</h1>
      <p className={styles.subtitle}>{subtitle}</p>
    </div>
  );
}

function ChangePill({
  direction,
  tone,
  text,
}: {
  readonly direction: "up" | "down" | "neutral";
  readonly tone: "positive" | "negative" | "neutral";
  readonly text: string;
}) {
  const palette = tone === "positive" ? TONES.green : tone === "negative" ? TONES.red : TONES.gray;
  const Arrow = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : null;
  return (
    <span className={styles.pill} style={{ background: palette.background, color: palette.color }}>
      {Arrow ? <Arrow aria-hidden="true" color={palette.color} strokeWidth={3} /> : null}
      {text}
    </span>
  );
}

function Cover({ report, number }: PageProps) {
  const l = labels(report);
  return (
    <ReportPage report={report} number={number} cover>
      <div aria-hidden="true" className={styles.coverArt} />
      <div className={styles.coverTop}>
        <PaceLogo width={120} height={36} />
        <span>
          {l["report.header.title"]}
          <br />
          {reportMonth(report)}
        </span>
      </div>
      <div className={styles.coverHeading}>
        <h1>
          {l["report.cover.titleLine1"]}
          <br />
          {l["report.cover.titleLine2"]}
        </h1>
        <p>{l["report.cover.subtitle"]}</p>
        <i />
      </div>
      <div className={styles.period}>
        <span className={styles.periodIcon}>
          <CalendarDays aria-hidden="true" color="#2563eb" strokeWidth={2} />
        </span>
        <div>
          <small>{l["report.cover.periodLabel"]}</small>
          <strong>{periodRange(report)}</strong>
          <em>
            {formatReportLabel(l, "report.cover.generated", {
              date: date(report, report.meta.generatedDate, {
                day: "2-digit",
                month: "long",
                year: "numeric",
              }),
            })}
          </em>
        </div>
      </div>
    </ReportPage>
  );
}

function metricPill(report: FinancialReportDTO, metric: ReportMetric | ReportCountMetric, sentiment: "positive" | "negative" | "neutral") {
  const l = labels(report);
  if (metric.percentage === null) return null;
  if (metric.direction === "neutral") {
    return <ChangePill direction="neutral" text={l["report.comparison.unchanged"]} tone="neutral" />;
  }
  return (
    <ChangePill
      direction={metric.direction}
      text={`${metric.direction === "up" ? "+" : "−"}${percentage(report, metric.percentage)}`}
      tone={sentiment}
    />
  );
}

function Metric({
  report,
  label,
  value,
  icon,
  tone,
  pill,
}: {
  readonly report: FinancialReportDTO;
  readonly label: string;
  readonly value: string;
  readonly icon: LucideIcon;
  readonly tone: Tone;
  readonly pill: React.ReactNode;
}) {
  const l = labels(report);
  return (
    <div className={styles.metric}>
      <IconBadge icon={icon} size="lg" tone={tone} />
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>
          {pill ?? <span className={styles.muted}>{l["report.comparison.none"]}</span>}
          {pill ? (
            <span className={styles.muted}>
              {formatReportLabel(l, "report.comparison.versus", { period: previousMonthShort(report) })}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function Summary({ report, number, section }: PageProps) {
  const l = labels(report);
  const m = report.executiveSummary;
  return (
    <ReportPage number={number} report={report}>
      <PageIntro
        name={l["report.section.executiveSummary"]}
        section={section}
        subtitle={formatReportLabel(l, "report.executive.subtitle", { period: reportMonth(report) })}
        title={l["report.executive.title"]}
      />
      <div className={styles.metricGrid}>
        <Metric
          icon={ReceiptText}
          label={l["report.metric.income"]}
          pill={metricPill(report, m.income, m.income.sentiment)}
          report={report}
          tone="green"
          value={signedMoney(report, m.income.minor)}
        />
        <Metric
          icon={Wallet}
          label={l["report.metric.spending"]}
          pill={metricPill(report, m.spending, m.spending.sentiment)}
          report={report}
          tone="red"
          value={signedMoney(report, -BigInt(m.spending.minor))}
        />
        <Metric
          icon={ChartColumnIncreasing}
          label={l["report.metric.net"]}
          pill={metricPill(report, m.net, m.net.sentiment)}
          report={report}
          tone="blue"
          value={signedMoney(report, m.net.minor)}
        />
        <Metric
          icon={ArrowLeftRight}
          label={l["report.metric.transactions"]}
          pill={metricPill(report, m.transactions, "neutral")}
          report={report}
          tone="purple"
          value={new Intl.NumberFormat(report.meta.locale).format(m.transactions.current)}
        />
      </div>
      <section className={styles.highlight}>
        <div className={styles.highlightTitle}>
          <IconBadge icon={Lightbulb} shape="circle" tone="amber" />
          <h2>{l["report.highlights.title"]}</h2>
        </div>
        {m.highlights.length ? (
          <ul>
            {m.highlights.slice(0, 5).map((item, i) => (
              <li key={i}>{highlight(report, item)}</li>
            ))}
          </ul>
        ) : (
          <p>{l["report.highlights.empty"]}</p>
        )}
      </section>
    </ReportPage>
  );
}

function highlight(
  r: FinancialReportDTO,
  item: FinancialReportDTO["executiveSummary"]["highlights"][number],
) {
  const l = labels(r);
  switch (item.kind) {
    case "spendingChange":
      return item.direction === "up" && item.categoryName
        ? formatReportLabel(l, "report.highlight.spendingUpCategory", {
            percentage: item.percentage,
            category: item.categoryName,
          })
        : formatReportLabel(
            l,
            item.direction === "up" ? "report.highlight.spendingUp" : "report.highlight.spendingDown",
            { percentage: item.percentage },
          );
    case "incomeChange":
      return formatReportLabel(
        l,
        item.direction === "up" ? "report.highlight.incomeUp" : "report.highlight.incomeDown",
        { percentage: item.percentage },
      );
    case "netPositive":
      return formatReportLabel(l, "report.highlight.netPositive", { amount: money(r, item.amountMinor) });
    case "netNegative":
      return formatReportLabel(l, "report.highlight.netNegative", { amount: money(r, item.amountMinor) });
    case "recurringShare":
      return formatReportLabel(l, "report.highlight.recurringShare", { share: percent(r, item.shareBps) });
    case "topCategory":
      return formatReportLabel(l, "report.highlight.topCategory", {
        category: item.name,
        share: percent(r, item.shareBps),
      });
    case "transfersExcluded":
      return formatReportLabel(l, "report.highlight.transfersExcluded", { count: item.count });
  }
}

function chartTicks(values: readonly number[], intervals: number) {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const raw = (high - low || 1) / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw)!;
  const start = Math.floor(low / step) * step;
  const end = Math.max(start + step, Math.ceil(high / step) * step);
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) ticks.push(value);
  return { ticks, min: start, max: ticks[ticks.length - 1] };
}

function compact(report: FinancialReportDTO, value: number) {
  return new Intl.NumberFormat(report.meta.locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function ChartFrame({
  report,
  ticks,
  min,
  max,
  labels: xLabels,
  height,
  children,
}: {
  readonly report: FinancialReportDTO;
  readonly ticks: readonly number[];
  readonly min: number;
  readonly max: number;
  readonly labels: readonly string[];
  readonly height: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className={styles.chart}>
      <div className={styles.chartPlot} style={{ height }}>
        {ticks.map((tick) => {
          const bottom = `${((tick - min) / (max - min)) * 100}%`;
          return (
            <div className={styles.chartTick} key={tick} style={{ bottom }}>
              <span>{tick === 0 ? "0" : compact(report, tick)}</span>
            </div>
          );
        })}
        <div className={styles.chartArea}>{children}</div>
      </div>
      <div className={styles.chartLabels}>
        {xLabels.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function Trends({ report, number, section }: PageProps) {
  const l = labels(report);
  const months = report.incomeSpending.months;
  const income = months.map((m) => minorToChartValue(m.incomeMinor, report.currency.code));
  const spending = months.map((m) => minorToChartValue(m.spendingMinor, report.currency.code));
  const net = months.map((m) => minorToChartValue(m.netMinor, report.currency.code));
  const barScale = chartTicks([...income, ...spending].map((value) => value * 1.08), 3);
  const netScale = chartTicks(net.map((value) => value * 1.05), 4);
  const xLabels = months.map((m) => shortMonth(report, m.month));
  const y = (value: number) => 100 - ((value - netScale.min) / (netScale.max - netScale.min)) * 100;
  const x = (index: number) => ((index + 0.5) / months.length) * 100;
  const points = net.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const baseline = y(Math.max(netScale.min, 0));
  return (
    <ReportPage number={number} report={report}>
      <PageIntro
        name={l["report.section.incomeSpending"]}
        section={section}
        subtitle={formatReportLabel(l, "report.incomeSpending.subtitle", { count: months.length })}
        title={l["report.incomeSpending.title"]}
      />
      <div className={styles.chartLegend}>
        <span>
          <i style={{ background: "#22b07d" }} />
          {l["report.metric.income"]}
        </span>
        <span>
          <i style={{ background: "#ff5a5f" }} />
          {l["report.metric.spending"]}
        </span>
      </div>
      <ChartFrame height="70mm" labels={xLabels} max={barScale.max} min={barScale.min} report={report} ticks={barScale.ticks}>
        <div className={styles.bars}>
          {months.map((m, index) => (
            <div key={m.month}>
              <i style={{ height: `${(income[index] / barScale.max) * 100}%` }} />
              <b style={{ height: `${(spending[index] / barScale.max) * 100}%` }} />
            </div>
          ))}
        </div>
      </ChartFrame>
      <h2 className={styles.chartTitle}>{l["report.incomeSpending.netTitle"]}</h2>
      <ChartFrame height="62mm" labels={xLabels} max={netScale.max} min={netScale.min} report={report} ticks={netScale.ticks}>
        <svg aria-hidden="true" className={styles.netSvg} preserveAspectRatio="none" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="reportNetFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#2f7bf6" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#2f7bf6" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          <polygon fill="url(#reportNetFill)" points={`${x(0)},${baseline} ${points} ${x(months.length - 1)},${baseline}`} />
          <polyline fill="none" points={points} stroke="#2f7bf6" strokeLinejoin="round" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        </svg>
        {net.map((value, index) => (
          <i className={styles.netPoint} key={months[index].month} style={{ left: `${x(index)}%`, top: `${y(value)}%` }} />
        ))}
      </ChartFrame>
    </ReportPage>
  );
}

function Categories({ report, number, section }: PageProps) {
  const l = labels(report);
  const breakdown = report.categoryBreakdown;
  const legend = [
    ...breakdown.items.slice(0, 7).map((c, i) => ({
      id: c.id,
      name: c.name,
      amountMinor: c.amountMinor,
      shareBps: c.shareBps,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    })),
    ...(breakdown.other
      ? [
          {
            id: "other",
            name: formatReportLabel(l, "report.categories.other", { count: breakdown.other.categoryCount }),
            amountMinor: breakdown.other.amountMinor,
            shareBps: breakdown.other.shareBps,
            color: OTHER_COLOR,
          },
        ]
      : []),
  ];
  const segments = legend.filter((item) => item.shareBps > 0);
  const gap = segments.length > 1 ? 0.7 : 0;
  let offset = 0;
  const arcs = segments.map((item) => {
    const share = item.shareBps / 100;
    const arc = { ...item, start: offset, length: Math.max(share - gap, 0.1) };
    offset += share;
    return arc;
  });
  return (
    <ReportPage number={number} report={report}>
      <PageIntro
        name={l["report.section.categories"]}
        section={section}
        subtitle={formatReportLabel(l, "report.categories.subtitle", { period: reportMonth(report) })}
        title={l["report.categories.title"]}
      />
      {legend.length ? (
        <>
          <div className={styles.categoryTop}>
            <div className={styles.donut}>
              <svg aria-hidden="true" viewBox="0 0 42 42">
                <circle cx="21" cy="21" fill="none" r="15.5" stroke="#eef2f7" strokeWidth="10" />
                {arcs.map((arc) => (
                  <circle
                    cx="21"
                    cy="21"
                    fill="none"
                    key={arc.id}
                    pathLength="100"
                    r="15.5"
                    stroke={arc.color}
                    strokeDasharray={`${arc.length} ${100 - arc.length}`}
                    strokeDashoffset={-arc.start}
                    strokeWidth="10"
                    transform="rotate(-90 21 21)"
                  />
                ))}
              </svg>
              <div>
                <strong>{plainAmount(report, breakdown.totalMinor)}</strong>
                <small>{report.currency.code}</small>
              </div>
            </div>
            <ul className={styles.legend}>
              {legend.map((item) => (
                <li key={item.id}>
                  <i style={{ background: item.color }} />
                  <span>{item.name}</span>
                  <b>{money(report, item.amountMinor)}</b>
                  <em>{percent(report, item.shareBps)}</em>
                </li>
              ))}
            </ul>
          </div>
          <h2 className={styles.chartTitle}>{l["report.categories.evolutionTitle"]}</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{l["report.table.category"]}</th>
                <th className={styles.alignRight}>{l["report.table.amount"]}</th>
                <th className={styles.alignRight}>{l["report.table.change"]}</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.evolution.slice(0, 5).map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={styles.withIcon}>
                      <TransactionIcon categoryKey={c.categoryKey} categoryName={c.name} size="sm" />
                      {c.name}
                    </span>
                  </td>
                  <td className={styles.alignRight}>{money(report, c.amountMinor)}</td>
                  <td className={styles.alignRight}>
                    {c.changePercentage ? (
                      <ChangePill
                        direction="neutral"
                        text={`${c.direction === "down" ? "−" : "+"}${percentage(report, c.changePercentage)}`}
                        tone={c.direction === "down" ? "positive" : c.direction === "up" ? "negative" : "neutral"}
                      />
                    ) : (
                      <ChangePill direction="neutral" text={l["report.categories.new"]} tone="neutral" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <Empty text={l["report.categories.empty"]} />
      )}
    </ReportPage>
  );
}

function Transactions({ report, number, section }: PageProps) {
  const l = labels(report);
  const page = report.keyTransactions;
  return (
    <ReportPage number={number} report={report}>
      <PageIntro
        name={l["report.section.transactions"]}
        section={section}
        subtitle={l["report.transactions.subtitle"]}
        title={l["report.transactions.title"]}
      />
      {page?.items.length ? (
        <table className={`${styles.table} ${styles.transactionTable}`}>
          <thead>
            <tr>
              <th>{l["report.table.date"]}</th>
              <th>{l["report.table.description"]}</th>
              <th>{l["report.table.category"]}</th>
              <th className={styles.alignRight}>
                {l["report.table.amount"]} ({report.currency.code})
              </th>
            </tr>
          </thead>
          <tbody>
            {page.items.slice(0, 10).map((t) => {
              const primary = t.merchantName ?? t.title ?? l["report.note.unnamed"];
              const secondary =
                t.kind === "TRANSFER" && t.counterpartyAccountName
                  ? formatReportLabel(l, "report.transactions.transferRoute", {
                      from: t.accountName ?? "—",
                      to: t.counterpartyAccountName,
                    })
                  : t.title && t.merchantName
                    ? t.title
                    : null;
              const category =
                t.kind === "TRANSFER"
                  ? l["report.kind.TRANSFER"]
                  : t.kind === "INCOME"
                    ? (t.categoryName ?? l["report.kind.INCOME"])
                    : (t.categoryName ?? l["report.transactions.uncategorized"]);
              const visual = resolveTransactionIcon({
                merchantName: t.merchantName,
                categoryName: t.categoryName,
                categoryKey: t.categoryKey,
                transactionKind: t.kind,
              });
              return (
                <tr key={t.id}>
                  <td className={styles.muted}>{date(report, t.date, { day: "numeric", month: "short" })}</td>
                  <td>
                    <span className={styles.withIcon}>
                      <TransactionIcon
                        categoryKey={t.categoryKey}
                        categoryName={t.categoryName}
                        merchantName={t.merchantName}
                        size="sm"
                        transactionKind={t.kind}
                      />
                      <span>
                        <b>{primary}</b>
                        {secondary ? <small>{secondary}</small> : null}
                      </span>
                    </span>
                  </td>
                  <td style={{ color: t.kind === "TRANSFER" ? "#52627d" : CATEGORY_TEXT_COLORS[visual.category] }}>
                    {category}
                  </td>
                  <td className={`${styles.alignRight} ${BigInt(t.signedMinor) >= 0n ? styles.positive : styles.negative}`}>
                    {signedPlain(report, t.signedMinor)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <Empty text={l["report.transactions.empty"]} />
      )}
    </ReportPage>
  );
}

function Accounts({ report, number, section }: PageProps) {
  const l = labels(report);
  const accounts = report.accounts;
  return (
    <ReportPage number={number} report={report}>
      <PageIntro
        name={l["report.section.accounts"]}
        section={section}
        subtitle={formatReportLabel(l, "report.accounts.subtitle", {
          date: date(report, report.period.lastDate, { day: "2-digit", month: "long", year: "numeric" }),
        })}
        title={l["report.accounts.title"]}
      />
      {accounts?.items.length ? (
        <>
          <div className={styles.accounts}>
            {accounts.items.slice(0, 3).map((account) => {
              const visual = ACCOUNT_VISUALS[account.type] ?? ACCOUNT_VISUALS.OTHER;
              return (
                <div key={account.id}>
                  <IconBadge icon={visual.icon} size="lg" tone={visual.tone} />
                  <span>
                    <b>{account.name}</b>
                    <small>{account.isArchived ? `${account.typeLabel} · ${l["report.accounts.archived"]}` : account.typeLabel}</small>
                  </span>
                  <span className={styles.accountBalance}>
                    <strong>{money(report, account.closingMinor)}</strong>
                    {account.balanceChangePercentage && account.balanceDirection !== "neutral" ? (
                      <ChangePill
                        direction={account.balanceDirection}
                        text={`${account.balanceDirection === "up" ? "+" : "−"}${percentage(report, account.balanceChangePercentage)}`}
                        tone={account.balanceDirection === "up" ? "positive" : "negative"}
                      />
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
          <h2 className={styles.chartTitle}>
            {l["report.accounts.movementsTitle"]} <span className={styles.muted}>· {report.currency.code}</span>
          </h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{l["report.table.account"]}</th>
                <th className={styles.alignRight}>{l["report.table.inflows"]}</th>
                <th className={styles.alignRight}>{l["report.table.outflows"]}</th>
                <th className={styles.alignRight}>{l["report.table.netMovement"]}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.items.slice(0, 6).map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td className={`${styles.alignRight} ${BigInt(account.inflowsMinor) > 0n ? styles.positive : ""}`}>
                    {signedPlain(report, account.inflowsMinor)}
                  </td>
                  <td className={`${styles.alignRight} ${BigInt(account.outflowsMinor) > 0n ? styles.negative : ""}`}>
                    {signedPlain(report, -BigInt(account.outflowsMinor))}
                  </td>
                  <td className={`${styles.alignRight} ${BigInt(account.netMinor) >= 0n ? styles.positive : styles.negative}`}>
                    {signedPlain(report, account.netMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.note}>{l["report.accounts.movementsNote"]}</p>
        </>
      ) : (
        <Empty text={formatReportLabel(l, "report.accounts.empty", { currency: report.currency.code })} />
      )}
    </ReportPage>
  );
}

function Recurring({ report, number, section }: PageProps) {
  const l = labels(report);
  const recurring = report.recurring;
  return (
    <ReportPage number={number} report={report}>
      <PageIntro
        name={l["report.section.recurring"]}
        section={section}
        subtitle={
          recurring
            ? formatReportLabel(l, "report.recurring.subtitle", { share: percent(report, recurring.shareBps) })
            : l["report.recurring.subtitleEmpty"]
        }
        title={l["report.recurring.title"]}
      />
      {recurring?.items.length ? (
        <>
          <div className={styles.recurringHero}>
            <IconBadge icon={CalendarDays} size="lg" tone="orange" />
            <span>
              <b>{l["report.recurring.actualLabel"]}</b>
              <strong>{money(report, recurring.actualMinor)}</strong>
            </span>
            <span className={styles.recurringShare}>
              <strong>{percent(report, recurring.shareBps)}</strong>
              <small>{l["report.recurring.shareLabel"]}</small>
            </span>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{l["report.table.service"]}</th>
                <th>{l["report.table.category"]}</th>
                <th className={styles.alignRight}>{l["report.table.amount"]}</th>
                <th className={styles.alignRight}>{l["report.table.frequency"]}</th>
              </tr>
            </thead>
            <tbody>
              {recurring.items.slice(0, 9).map((item) => (
                <tr key={item.id}>
                  <td>
                    <b>{item.name ?? l["report.note.unnamed"]}</b>
                  </td>
                  <td className={styles.muted}>{item.categoryName ?? "—"}</td>
                  <td className={styles.alignRight}>{money(report, item.actualMinor)}</td>
                  <td className={`${styles.alignRight} ${styles.muted}`}>
                    {formatReportLabel(l, `report.cadence.${item.cadence}`, { days: item.cadenceDays })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <Empty text={l["report.recurring.empty"]} />
      )}
    </ReportPage>
  );
}

function insightVisual(item: ReportInsight): { icon: LucideIcon; tone: Tone } {
  switch (item.kind) {
    case "spendingUp":
      return { icon: TrendingUp, tone: "red" };
    case "spendingDown":
      return { icon: TrendingDown, tone: "green" };
    case "netImproved":
      return { icon: TrendingUp, tone: "green" };
    case "netDeclined":
      return { icon: TrendingDown, tone: "red" };
    case "recurringHigh":
      return { icon: CalendarDays, tone: "orange" };
    case "recurringPriceIncrease":
      return { icon: Tag, tone: "orange" };
    case "categoryConcentration":
      return { icon: ChartPie, tone: "blue" };
    case "engine":
      return {
        icon: Lightbulb,
        tone: item.tone === "positive" ? "green" : item.tone === "attention" ? "amber" : "blue",
      };
  }
}

function insightText(r: FinancialReportDTO, item: ReportInsight) {
  const l = labels(r);
  switch (item.kind) {
    case "engine":
      return [item.subject ? `${item.title} · ${item.subject}` : item.title, item.description ?? ""];
    case "spendingUp":
    case "spendingDown":
      return [
        l[`report.insight.${item.kind}.title`],
        item.kind === "spendingUp" && item.categoryName && item.categoryDeltaMinor
          ? formatReportLabel(l, "report.insight.spendingUp.bodyCategory", {
              percentage: item.percentage,
              previous: previousMonthLong(r),
              category: item.categoryName,
              categoryAmount: money(r, item.categoryDeltaMinor),
            })
          : formatReportLabel(l, `report.insight.${item.kind}.body`, {
              percentage: item.percentage,
              previous: previousMonthLong(r),
              amount: money(r, item.deltaMinor),
            }),
      ];
    case "netImproved":
    case "netDeclined":
      return [
        l[`report.insight.${item.kind}.title`],
        formatReportLabel(l, `report.insight.${item.kind}.body`, {
          amount: money(r, item.deltaMinor),
          previous: previousMonthLong(r),
        }),
      ];
    case "recurringHigh":
      return [
        l["report.insight.recurringHigh.title"],
        formatReportLabel(l, "report.insight.recurringHigh.body", {
          share: percent(r, item.shareBps),
          amount: money(r, item.amountMinor),
        }),
      ];
    case "recurringPriceIncrease":
      return [
        l["report.insight.recurringPriceIncrease.title"],
        formatReportLabel(l, "report.insight.recurringPriceIncrease.body", {
          name: item.name ?? l["report.note.unnamed"],
          percentage: item.percentage,
          amount: money(r, item.deltaMinor),
        }),
      ];
    case "categoryConcentration":
      return [
        l["report.insight.categoryConcentration.title"],
        formatReportLabel(l, "report.insight.categoryConcentration.body", {
          category: item.name,
          share: percent(r, item.shareBps),
        }),
      ];
  }
}

function Insights({ report, number, section }: PageProps) {
  const l = labels(report);
  return (
    <ReportPage number={number} report={report}>
      <PageIntro
        name={l["report.section.insights"]}
        section={section}
        subtitle={l["report.insights.subtitle"]}
        title={l["report.insights.title"]}
      />
      {report.insights?.items.length ? (
        <div className={styles.insights}>
          {report.insights.items.slice(0, 5).map((item, i) => {
            const [head, body] = insightText(report, item);
            const visual = insightVisual(item);
            return (
              <div key={i}>
                <IconBadge icon={visual.icon} shape="circle" size="lg" tone={visual.tone} />
                <span>
                  <h2>{head}</h2>
                  <p>{body}</p>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty text={l["report.insights.empty"]} />
      )}
    </ReportPage>
  );
}

function recommendationText(r: FinancialReportDTO, item: ReportRecommendation) {
  const l = labels(r);
  const variables: Record<string, string | number> =
    item.kind === "budgetCategory"
      ? { category: item.categoryName, percentage: item.percentage, amount: money(r, item.deltaMinor) }
      : item.kind === "reviewRecurring"
        ? { count: item.count, amount: money(r, item.amountMinor), share: percent(r, item.shareBps) }
        : item.kind === "reviewPriceIncrease"
          ? { name: item.name ?? l["report.note.unnamed"], percentage: item.percentage }
          : item.kind === "keepSaving"
            ? { rate: percent(r, item.savingsRateBps), amount: money(r, item.netMinor) }
            : item.kind === "reduceDeficit"
              ? { amount: money(r, item.deficitMinor) }
              : { amount: money(r, item.amountMinor), count: item.count };
  return [
    formatReportLabel(l, `report.recommendation.${item.kind}.title`, variables),
    formatReportLabel(l, `report.recommendation.${item.kind}.body`, variables),
  ];
}

function Recommendations({ report, number, section }: PageProps) {
  const l = labels(report);
  return (
    <ReportPage number={number} report={report}>
      <PageIntro
        name={l["report.section.recommendations"]}
        section={section}
        subtitle={l["report.recommendations.subtitle"]}
        title={l["report.recommendations.title"]}
      />
      {report.recommendations.items.length ? (
        <div className={styles.recommendations}>
          {report.recommendations.items.slice(0, 4).map((item, i) => {
            const [head, body] = recommendationText(report, item);
            return (
              <div key={i}>
                <span className={styles.step}>
                  <b>{i + 1}</b>
                </span>
                <span>
                  <h2>{head}</h2>
                  <p>{body}</p>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty text={l["report.recommendations.empty"]} />
      )}
      <blockquote className={styles.closing}>
        <span aria-hidden="true" className={styles.quoteMark}>
          “
        </span>
        <span>
          <p>
            {l["report.closing.line1"]}
            <br />
            {l["report.closing.line2"]}
          </p>
          <small>— {l["report.closing.signature"]}</small>
        </span>
      </blockquote>
    </ReportPage>
  );
}

function Empty({ text }: { readonly text: string }) {
  return <div className={styles.empty}>{text}</div>;
}

const PAGE_COMPONENTS: Record<ReportPageKind, (props: PageProps) => React.ReactNode> = {
  cover: Cover,
  executiveSummary: Summary,
  incomeSpending: Trends,
  categories: Categories,
  transactions: Transactions,
  accounts: Accounts,
  recurring: Recurring,
  insights: Insights,
  recommendations: Recommendations,
};

export function FinancialReportDocument({ report, pdf = false }: Props) {
  const pages = report.meta.pages.filter((page) => PAGE_COMPONENTS[page]);
  const sectionOffset = pages.includes("cover") ? 0 : 1;
  return (
    <main className={`${styles.canvas} ${pdf ? styles.pdfCanvas : ""}`}>
      {pages.map((page, index) => {
        const Page = PAGE_COMPONENTS[page];
        return <Page key={page} number={index + 1} report={report} section={index + sectionOffset} />;
      })}
    </main>
  );
}
