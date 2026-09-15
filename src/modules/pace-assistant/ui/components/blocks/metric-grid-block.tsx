import { MetricBlock } from "./metric-block";
import type { PaceAssistantBlock } from "../../../types/pace-assistant";

type MetricGridData = Extract<PaceAssistantBlock, { type: "metric-grid" }>;

export function MetricGridBlock({ block, locale }: { readonly block: MetricGridData; readonly locale: string }) {
  return (
    <section>
      {block.title ? <h3 className="mb-2 text-[13px] font-semibold text-[#27324a]">{block.title}</h3> : null}
      <div className="grid grid-cols-2 gap-2">{block.items.map((item) => <MetricBlock block={{ type: "metric", ...item }} key={item.label} locale={locale} />)}</div>
    </section>
  );
}
