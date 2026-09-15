import {
  FiAlertCircle,
  FiArrowDown,
  FiArrowUpRight,
  FiBarChart2,
  FiCheck,
  FiTrendingDown,
} from "react-icons/fi";

import type { DailyBriefItem as DailyBriefItemData, OverviewInsightTone } from "../../domain/overview-right-rail";

const toneClasses: Record<OverviewInsightTone, string> = {
  positive: "bg-[#eaf8f0] text-[#128257]",
  neutral: "bg-[#f0f4fa] text-[#50627f]",
  attention: "bg-[#fff2e7] text-[#b46021]",
};

export function DailyBriefItem({ item }: { readonly item: DailyBriefItemData }) {
  const icon = iconForInsight(item.type);
  return (
    <article className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${toneClasses[item.tone]}`}>
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <h3 className="text-[13px] leading-5 font-medium text-[#1c2740]">{item.title}</h3>
        {item.description ? <p className="mt-0.5 text-[12px] leading-5 text-[#68758d]">{item.description}</p> : null}
      </div>
    </article>
  );
}

function iconForInsight(type: DailyBriefItemData["type"]) {
  const className = "size-4";
  if (type === "CATEGORY_DROP" || type === "SPENDING_PACE_LOW") return <FiArrowDown aria-hidden className={className} />;
  if (type === "GOAL_ON_TRACK" || type === "POTENTIAL_SAVINGS") return <FiCheck aria-hidden className={className} />;
  if (type === "SPENDING_PACE_HIGH" || type === "MONTH_OVER_MONTH_CHANGE") return <FiBarChart2 aria-hidden className={className} />;
  if (type === "CATEGORY_SPIKE" || type === "MERCHANT_SPIKE") return <FiArrowUpRight aria-hidden className={className} />;
  if (type === "BUDGET_AT_RISK" || type === "BUDGET_EXCEEDED" || type === "GOAL_OFF_TRACK") return <FiAlertCircle aria-hidden className={className} />;
  if (type === "UNUSUAL_TRANSACTION" || type === "RECURRING_PRICE_INCREASE") return <FiTrendingDown aria-hidden className={className} />;
  return <FiBarChart2 aria-hidden className={className} />;
}
