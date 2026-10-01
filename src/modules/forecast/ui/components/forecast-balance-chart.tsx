"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";

import type { CurrencyForecast } from "@/modules/forecast/domain/forecast";
import {
  formatOverviewDate,
  formatOverviewMoney,
  minorToChartValue,
} from "@/modules/overview/domain/overview-formatters";

ChartJS.register(CategoryScale, Filler, LineElement, LinearScale, PointElement, Tooltip);

export function ForecastBalanceChart({
  currency,
  description,
  locale,
  onSelect,
  selected,
}: {
  currency: CurrencyForecast;
  description: string;
  locale: string;
  onSelect: (index: number) => void;
  selected: number;
}) {
  const labels = currency.points.map((point) => formatOverviewDate(point.date, locale));
  const data: ChartData<"line"> = {
    labels,
    datasets: [
      {
        data: currency.points.map((point) => minorToChartValue(point.projectedClosingBalance.maximumMinor, currency.currency)),
        borderColor: "transparent",
        pointRadius: 0,
        pointHitRadius: 0,
      },
      {
        backgroundColor: "rgba(203, 226, 255, 0.62)",
        borderColor: "transparent",
        data: currency.points.map((point) => minorToChartValue(point.projectedClosingBalance.minimumMinor, currency.currency)),
        fill: "-1",
        pointRadius: 0,
        pointHitRadius: 0,
      },
      {
        backgroundColor: "#1769e8",
        borderColor: "#1769e8",
        borderWidth: 2.5,
        data: currency.points.map((point) => minorToChartValue(point.projectedClosingBalance.nominalMinor, currency.currency)),
        fill: false,
        pointBackgroundColor: (context) => context.dataIndex === selected ? "#1769e8" : "#ffffff",
        pointBorderColor: "#1769e8",
        pointBorderWidth: 2,
        pointHoverRadius: 5,
        pointRadius: (context) => context.dataIndex === selected ? 4 : 2.5,
        pointHitRadius: 14,
        tension: 0.32,
      },
    ],
  };
  const options: ChartOptions<"line"> = {
    animation: { duration: 180 },
    maintainAspectRatio: false,
    normalized: true,
    onClick: (_event, elements) => {
      const index = elements.find((element) => element.datasetIndex === 2)?.index;
      if (typeof index === "number") onSelect(index);
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#ffffff",
        bodyColor: "#14203a",
        borderColor: "#dce6f3",
        borderWidth: 1,
        callbacks: {
          label: (context) => formatOverviewMoney(currency.points[context.dataIndex]!.projectedClosingBalance.nominalMinor, currency.currency, locale),
        },
        displayColors: false,
        padding: 10,
        titleColor: "#64738c",
        titleFont: { size: 11, weight: "normal" },
        bodyFont: { size: 13, weight: "bold" },
      },
    },
    scales: {
      x: {
        grid: { color: "#edf1f6", drawTicks: false },
        ticks: { color: "#71809a", font: { size: 10 }, maxRotation: 0, maxTicksLimit: 5 },
      },
      y: {
        grid: { color: "#e8eef6", drawTicks: false },
        ticks: {
          color: "#71809a",
          font: { size: 10 },
          callback: (value) => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 0 }).format(Number(value)),
        },
      },
    },
  };

  return <div aria-label={description} className="h-64 sm:h-72" role="img"><Line data={data} options={options} /></div>;
}
