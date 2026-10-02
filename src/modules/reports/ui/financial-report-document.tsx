import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { formatReportLabel, getReportLabels } from "@/i18n/report-messages";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import type {
  FinancialReportDTO,
  ReportInsight,
  ReportRecommendation,
} from "../domain/financial-report.types";
import styles from "./financial-report.module.css";
import { FinancialReportPage as ReportPage } from "./financial-report-page";
import { CalendarDays } from "lucide-react";

type Props = {
  readonly report: FinancialReportDTO;
  readonly onlyPage?: string;
  readonly pdf?: boolean;
};
const colors = [
  "#1976ef",
  "#ff5b60",
  "#35be9a",
  "#ffb540",
  "#15b6d1",
  "#8c68e8",
  "#9a79ed",
  "#a8b4ca",
];

function money(report: FinancialReportDTO, value: string) {
  return formatOverviewMoney(value, report.currency.code, report.meta.locale);
}
function signed(report: FinancialReportDTO, value: string) {
  const amount = BigInt(value);
  return `${amount > 0n ? "+" : amount < 0n ? "−" : ""}${money(report, (amount < 0n ? -amount : amount).toString())}`;
}
function percent(bps: number) {
  return `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
function date(
  report: FinancialReportDTO,
  value: string,
  opts: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(report.meta.locale, opts).format(
    new Date(`${value}T12:00:00`),
  );
}
function titleCaseMonth(report: FinancialReportDTO) {
  return date(report, report.period.firstDate, {
    month: "long",
    year: "numeric",
  });
}

function ReportIcon({
  type,
}: {
  type:
    | "income"
    | "expense"
    | "net"
    | "transactions"
    | "insight"
    | "calendar"
    | "account"
    | "recurring";
}) {
  return (
    <span className={`${styles.icon} ${styles[type]}`}>
      {type === "income"
        ? "↗"
        : type === "expense"
          ? "↙"
          : type === "net"
            ? "▥"
            : type === "transactions"
              ? "⌁"
              : type === "calendar"
                ? "□"
                : type === "account"
                  ? "▣"
                  : type === "recurring"
                    ? "□"
                    : "↗"}
    </span>
  );
}
function PageIntro({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      <p className={styles.subtitle}>{subtitle}</p>
    </>
  );
}

function Cover({ report }: { report: FinancialReportDTO }) {
  const l = getReportLabels(report.meta.language);
  return (
    <ReportPage report={report} number={1} cover>
      <div className={styles.coverTop}>
        <PaceLogo width={62} height={20} />
        <span>
          {l["report.header.title"]}
          <br />
          {titleCaseMonth(report)}
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
          <CalendarDays size={16} strokeWidth={2} />
        </span>
        <div>
          <small>{l["report.cover.periodLabel"]}</small>
          <strong>
            {date(report, report.period.firstDate, {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}{" "}
            –{" "}
            {date(report, report.period.lastDate, {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </strong>
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
      <div className={styles.coverArt} />
    </ReportPage>
  );
}

function Metric({
  label,
  value,
  type,
  delta,
}: {
  label: string;
  value: string;
  type: "income" | "expense" | "net" | "transactions";
  delta: string;
}) {
  return (
    <div className={styles.metric}>
      <ReportIcon type={type} />
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{delta}</em>
      </div>
    </div>
  );
}
function Summary({ report }: { report: FinancialReportDTO }) {
  const l = getReportLabels(report.meta.language);
  const m = report.executiveSummary;
  return (
    <ReportPage
      report={report}
      number={2}
      section={`01. ${l["report.section.executiveSummary"]}`}>
      <PageIntro
        eyebrow={`01. ${l["report.section.executiveSummary"]}`}
        title={l["report.executive.title"]}
        subtitle={formatReportLabel(l, "report.executive.subtitle", {
          period: titleCaseMonth(report),
        })}
      />
      <div className={styles.metricGrid}>
        <Metric
          label={l["report.metric.income"]}
          value={money(report, m.income.minor)}
          type="income"
          delta={signed(report, m.income.deltaMinor)}
        />
        <Metric
          label={l["report.metric.spending"]}
          value={money(report, m.spending.minor)}
          type="expense"
          delta={signed(report, m.spending.deltaMinor)}
        />
        <Metric
          label={l["report.metric.net"]}
          value={signed(report, m.net.minor)}
          type="net"
          delta={signed(report, m.net.deltaMinor)}
        />
        <Metric
          label={l["report.metric.transactions"]}
          value={String(m.transactions.current)}
          type="transactions"
          delta={`${m.transactions.percentage ?? "0"}%`}
        />
      </div>
      <section className={styles.highlight}>
        <h2>{l["report.highlights.title"]}</h2>
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
  const l = getReportLabels(r.meta.language);
  switch (item.kind) {
    case "spendingChange":
      return formatReportLabel(
        l,
        item.direction === "up"
          ? "report.highlight.spendingUp"
          : "report.highlight.spendingDown",
        { percentage: item.percentage },
      );
    case "incomeChange":
      return formatReportLabel(
        l,
        item.direction === "up"
          ? "report.highlight.incomeUp"
          : "report.highlight.incomeDown",
        { percentage: item.percentage },
      );
    case "netPositive":
      return formatReportLabel(l, "report.highlight.netPositive", {
        amount: money(r, item.amountMinor),
      });
    case "netNegative":
      return formatReportLabel(l, "report.highlight.netNegative", {
        amount: money(r, item.amountMinor),
      });
    case "recurringShare":
      return formatReportLabel(l, "report.highlight.recurringShare", {
        share: percent(item.shareBps),
      });
    case "topCategory":
      return formatReportLabel(l, "report.highlight.topCategory", {
        category: item.name,
        share: percent(item.shareBps),
      });
    case "transfersExcluded":
      return formatReportLabel(l, "report.highlight.transfersExcluded", {
        count: item.count,
      });
  }
}

function Trends({ report }: { report: FinancialReportDTO }) {
  const l = getReportLabels(report.meta.language);
  const months = report.incomeSpending.months;
  const max = months.reduce(
    (v, m) =>
      [m.incomeMinor, m.spendingMinor].reduce(
        (a, n) => (BigInt(n) > a ? BigInt(n) : a),
        v,
      ),
    1n,
  );
  return (
    <ReportPage
      report={report}
      number={3}
      section={`02. ${l["report.section.incomeSpending"]}`}>
      <PageIntro
        eyebrow={`02. ${l["report.section.incomeSpending"]}`}
        title={l["report.incomeSpending.title"]}
        subtitle={formatReportLabel(l, "report.incomeSpending.subtitle", {
          count: months.length,
        })}
      />
      <ChartTitle title={l["report.incomeSpending.title"]} />
      <div className={styles.bars}>
        {months.map((m) => (
          <div className={styles.barGroup} key={m.month}>
            <div>
              <i
                style={{
                  height: `${Number((BigInt(m.incomeMinor) * 100n) / max)}%`,
                }}
              />
              <b
                style={{
                  height: `${Number((BigInt(m.spendingMinor) * 100n) / max)}%`,
                }}
              />
            </div>
            <small>{date(report, `${m.month}-01`, { month: "short" })}</small>
          </div>
        ))}
      </div>
      <ChartTitle title={l["report.incomeSpending.netTitle"]} />
      <LineChart report={report} />
    </ReportPage>
  );
}
function ChartTitle({ title }: { title: string }) {
  return <h2 className={styles.chartTitle}>{title}</h2>;
}
function LineChart({ report }: { report: FinancialReportDTO }) {
  const data = report.incomeSpending.months;
  const nums = data.map((x) => BigInt(x.netMinor));
  const max = nums.reduce((a, b) => (a > b ? a : b), 1n);
  const ceiling = ((max + 99999n) / 100000n) * 100000n;
  const x = (i: number) => 55 + (i * 545) / Math.max(1, nums.length - 1);
  const y = (n: bigint) => 190 - Number((n * 160n) / ceiling);
  const points = nums.map((n, i) => `${x(i)},${y(n)}`).join(" ");
  const area = `55,190 ${points} 600,190`;
  return (
    <div className={styles.line}>
      <svg viewBox="0 0 640 230" role="img" aria-label={report.meta.language === "fr" ? "Évolution du solde net mensuel" : "Monthly net balance trend"}>
        <defs>
          <linearGradient id="reportNetFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2c83f7" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#2c83f7" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((step) => {
          const value = (ceiling * BigInt(4 - step)) / 4n;
          const ordinate = 30 + step * 40;
          return (
            <g key={step}>
              <line x1="55" x2="600" y1={ordinate} y2={ordinate} className={styles.chartGridLine} />
              <text x="45" y={ordinate + 4} textAnchor="end" className={styles.chartAxisLabel}>
                {value === 0n ? "0" : `${Number(value / 1000n)}K`}
              </text>
            </g>
          );
        })}
        <polygon points={area} fill="url(#reportNetFill)" />
        <polyline points={points} className={styles.netLine} />
        {nums.map((n, i) => (
          <g key={data[i].month}>
            <circle cx={x(i)} cy={y(n)} r="4" className={styles.netPoint} />
            <text x={x(i)} y="218" textAnchor="middle" className={styles.chartAxisLabel}>
              {date(report, `${data[i].month}-01`, { month: "short" })}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Categories({ report }: { report: FinancialReportDTO }) {
  const l = getReportLabels(report.meta.language);
  const cats = report.categoryBreakdown.items;
  const gradient = cats.reduce(
    (parts, c, i) => {
      const start = parts.offset;
      const offset = start + c.shareBps / 100;
      return {
        offset,
        stops: [...parts.stops, `${colors[i % colors.length]} ${start}% ${offset}%`],
      };
    },
    { offset: 0, stops: [] as string[] },
  ).stops.join(", ");
  return (
    <ReportPage
      report={report}
      number={4}
      section={`03. ${l["report.section.categories"]}`}>
      <PageIntro
        eyebrow={`03. ${l["report.section.categories"]}`}
        title={l["report.categories.title"]}
        subtitle={formatReportLabel(l, "report.categories.subtitle", {
          period: titleCaseMonth(report),
        })}
      />
      <div className={styles.categoryTop}>
        <div
          className={styles.donut}
          style={{
            background: `conic-gradient(${gradient || "#e8eef7 0 100%"})`,
          }}>
          <div>
            <strong>
              {money(report, report.categoryBreakdown.totalMinor)}
            </strong>
            <small>{l["report.categories.total"]}</small>
          </div>
        </div>
        <ul className={styles.legend}>
          {cats.slice(0, 7).map((c, i) => (
            <li key={c.id}>
              <i style={{ background: colors[i % colors.length] }} />
              <span>{c.name}</span>
              <b>{money(report, c.amountMinor)}</b>
              <em>{percent(c.shareBps)}</em>
            </li>
          ))}
        </ul>
      </div>
      <ChartTitle title={l["report.categories.evolutionTitle"]} />
      <EvolutionTable report={report} />
    </ReportPage>
  );
}
function EvolutionTable({ report }: { report: FinancialReportDTO }) {
  const l = getReportLabels(report.meta.language);
  return (
    <table>
      <thead>
        <tr>
          <th>{l["report.table.category"]}</th>
          <th>{l["report.table.amount"]}</th>
          <th>{l["report.table.change"]}</th>
        </tr>
      </thead>
      <tbody>
        {report.categoryBreakdown.evolution.slice(0, 5).map((c) => (
          <tr key={c.id}>
            <td>{c.name}</td>
            <td>{money(report, c.amountMinor)}</td>
            <td>
              <span
                className={
                  BigInt(c.previousMinor) > BigInt(c.amountMinor)
                    ? styles.good
                    : styles.bad
                }>
                {c.changePercentage
                  ? `${c.direction === "up" ? "+" : ""}${c.changePercentage}%`
                  : l["report.categories.new"]}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Transactions({ report }: { report: FinancialReportDTO }) {
  const l = getReportLabels(report.meta.language);
  const page = report.keyTransactions;
  return (
    <ReportPage
      report={report}
      number={5}
      section={`04. ${l["report.section.transactions"]}`}>
      <PageIntro
        eyebrow={`04. ${l["report.section.transactions"]}`}
        title={l["report.transactions.title"]}
        subtitle={l["report.transactions.subtitle"]}
      />
      {page?.items.length ? (
        <table className={styles.transactionTable}>
          <thead>
            <tr>
              <th>{l["report.table.date"]}</th>
              <th>{l["report.table.description"]}</th>
              <th>{l["report.table.category"]}</th>
              <th>{l["report.table.amount"]}</th>
            </tr>
          </thead>
          <tbody>
            {page.items.slice(0, 11).map((t) => (
              <tr key={t.id}>
                <td>
                  {date(report, t.date, { day: "2-digit", month: "short" })}
                </td>
                <td>
                  <b>{t.merchantName ?? t.title ?? l["report.note.unnamed"]}</b>
                  <small>{t.title && t.merchantName ? t.title : ""}</small>
                </td>
                <td>
                  {t.categoryName ?? l["report.transactions.uncategorized"]}
                </td>
                <td
                  className={
                    BigInt(t.signedMinor) >= 0n
                      ? styles.positive
                      : styles.negative
                  }>
                  {signed(report, t.signedMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty text={l["report.transactions.empty"]} />
      )}
    </ReportPage>
  );
}
function Accounts({ report }: { report: FinancialReportDTO }) {
  const l = getReportLabels(report.meta.language),
    a = report.accounts;
  return (
    <ReportPage
      report={report}
      number={6}
      section={`05. ${l["report.section.accounts"]}`}>
      <PageIntro
        eyebrow={`05. ${l["report.section.accounts"]}`}
        title={l["report.accounts.title"]}
        subtitle={formatReportLabel(l, "report.accounts.subtitle", {
          date: date(report, report.period.lastDate, {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
        })}
      />
      {a?.items.length ? (
        <>
          <div className={styles.accounts}>
            {a.items.slice(0, 4).map((x) => (
              <div key={x.id}>
                <ReportIcon type="account" />
                <span>
                  <b>{x.name}</b>
                  <small>{x.typeLabel}</small>
                </span>
                <strong>{money(report, x.closingMinor)}</strong>
              </div>
            ))}
          </div>
          <ChartTitle title={l["report.accounts.movementsTitle"]} />
          <table>
            <thead>
              <tr>
                <th>{l["report.table.account"]}</th>
                <th>{l["report.table.inflows"]}</th>
                <th>{l["report.table.outflows"]}</th>
                <th>{l["report.table.netMovement"]}</th>
              </tr>
            </thead>
            <tbody>
              {a.items.slice(0, 6).map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td className={styles.positive}>
                    {signed(report, x.inflowsMinor)}
                  </td>
                  <td className={styles.negative}>
                    {signed(report, -BigInt(x.outflowsMinor) + "")}
                  </td>
                  <td
                    className={
                      BigInt(x.netMinor) >= 0n
                        ? styles.positive
                        : styles.negative
                    }>
                    {signed(report, x.netMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.note}>{l["report.accounts.movementsNote"]}</p>
        </>
      ) : (
        <Empty text={l["report.accounts.empty"]} />
      )}
    </ReportPage>
  );
}
function Recurring({ report }: { report: FinancialReportDTO }) {
  const l = getReportLabels(report.meta.language),
    r = report.recurring;
  return (
    <ReportPage
      report={report}
      number={7}
      section={`06. ${l["report.section.recurring"]}`}>
      <PageIntro
        eyebrow={`06. ${l["report.section.recurring"]}`}
        title={l["report.recurring.title"]}
        subtitle={
          r
            ? formatReportLabel(l, "report.recurring.subtitle", {
                share: percent(r.shareBps),
              })
            : l["report.recurring.subtitleEmpty"]
        }
      />
      {r?.items.length ? (
        <>
          <div className={styles.recurringHero}>
            <ReportIcon type="recurring" />
            <span>
              <small>{l["report.recurring.actualLabel"]}</small>
              <strong>{money(report, r.actualMinor)}</strong>
            </span>
            <b>
              {percent(r.shareBps)}
              <small>{l["report.recurring.shareLabel"]}</small>
            </b>
          </div>
          <table>
            <thead>
              <tr>
                <th>{l["report.table.service"]}</th>
                <th>{l["report.table.category"]}</th>
                <th>{l["report.table.amount"]}</th>
                <th>{l["report.table.frequency"]}</th>
              </tr>
            </thead>
            <tbody>
              {r.items.slice(0, 9).map((x) => (
                <tr key={x.id}>
                  <td>{x.name ?? l["report.note.unnamed"]}</td>
                  <td>{x.categoryName ?? "—"}</td>
                  <td>{money(report, x.actualMinor)}</td>
                  <td>{x.cadence}</td>
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
function insightText(r: FinancialReportDTO, item: ReportInsight) {
  const l = getReportLabels(r.meta.language);
  const key = `report.insight.${item.kind}.title` as keyof typeof l;
  return [
    l[key] ?? item.kind,
    item.kind === "engine"
      ? (item.description ?? "")
      : (l[`report.insight.${item.kind}.body` as keyof typeof l] ?? ""),
  ];
}
function Insights({ report }: { report: FinancialReportDTO }) {
  const l = getReportLabels(report.meta.language);
  return (
    <ReportPage
      report={report}
      number={8}
      section={`07. ${l["report.section.insights"]}`}>
      <PageIntro
        eyebrow={`07. ${l["report.section.insights"]}`}
        title={l["report.insights.title"]}
        subtitle={l["report.insights.subtitle"]}
      />
      {report.insights?.items.length ? (
        <div className={styles.insights}>
          {report.insights.items.slice(0, 5).map((x, i) => {
            const [head, body] = insightText(report, x);
            return (
              <div key={i}>
                <ReportIcon type="insight" />
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
  const l = getReportLabels(r.meta.language);
  return [
    l[`report.recommendation.${item.kind}.title` as keyof typeof l],
    l[`report.recommendation.${item.kind}.body` as keyof typeof l],
  ];
}
function Recommendations({ report }: { report: FinancialReportDTO }) {
  const l = getReportLabels(report.meta.language);
  return (
    <ReportPage
      report={report}
      number={9}
      section={`08. ${l["report.section.recommendations"]}`}>
      <PageIntro
        eyebrow={`08. ${l["report.section.recommendations"]}`}
        title={l["report.recommendations.title"]}
        subtitle={l["report.recommendations.subtitle"]}
      />
      <div className={styles.recommendations}>
        {report.recommendations.items.slice(0, 4).map((x, i) => {
          const [head, body] = recommendationText(report, x);
          return (
            <div key={i}>
              <b>{i + 1}</b>
              <span>
                <h2>{head}</h2>
                <p>{body}</p>
              </span>
            </div>
          );
        })}
      </div>
      <blockquote>
        “ {l["report.closing.line1"]}
        <br />
        {l["report.closing.line2"]} ”
        <small>— {l["report.closing.signature"]}</small>
      </blockquote>
    </ReportPage>
  );
}
function Empty({ text }: { text: string }) {
  return <div className={styles.empty}>{text}</div>;
}
const pages: Record<
  string,
  (p: { report: FinancialReportDTO }) => React.ReactNode
> = {
  cover: Cover,
  summary: Summary,
  income: Trends,
  categories: Categories,
  transactions: Transactions,
  accounts: Accounts,
  recurring: Recurring,
  insights: Insights,
  recommendations: Recommendations,
};
export function FinancialReportDocument({ report, onlyPage, pdf = false }: Props) {
  const selected = onlyPage
    ? [onlyPage]
    : report.meta.pages.map((page) =>
        page === "executiveSummary"
          ? "summary"
          : page === "incomeSpending"
            ? "income"
            : page,
      );
  return (
    <main className={`${styles.canvas} ${pdf ? styles.pdfCanvas : ""}`}>
      {selected.map((key) => {
        const Page = pages[key];
        return Page ? <Page key={key} report={report} /> : null;
      })}
    </main>
  );
}
