import { formatAssistantDate, formatAssistantMoney, formatBps } from "../../../domain/formatters";
import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock, ProgressLine } from "./block-primitives";

type GoalSummaryData = Extract<PaceAssistantBlock, { type: "goal-summary" }>;

export function GoalSummaryBlock({ block, locale, timeZone, targetLabel }: { readonly block: GoalSummaryData; readonly locale: string; readonly timeZone: string; readonly targetLabel: string }) {
  return <div className="space-y-2">{block.goals.map((goal) => <AssistantBlock className="p-3.5" key={goal.id}>
    <div className="flex items-start justify-between gap-3"><h3 className="text-[13px] font-semibold text-[#263149]">{goal.name}</h3><span className="shrink-0 text-[11px] font-medium text-[#65718a]">{formatBps(goal.progressBps)}</span></div>
    <p className="mt-1 text-[12px] text-[#7b859a] tabular-nums">{formatAssistantMoney(goal.saved, locale)} / {formatAssistantMoney(goal.target, locale)}</p>
    <div className="mt-2.5"><ProgressLine tone={goal.status === "COMPLETED" ? "green" : "blue"} value={Number(BigInt(goal.progressBps) / 100n)} /></div>
    {goal.targetDate ? <p className="mt-2 text-[11px] text-[#7b859a]">{targetLabel}: {formatAssistantDate(goal.targetDate, locale, timeZone)}</p> : null}
  </AssistantBlock>)}</div>;
}
