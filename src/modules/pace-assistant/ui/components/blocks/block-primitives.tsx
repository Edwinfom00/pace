import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AssistantBlock({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <section className={cn("rounded-[12px] border border-[#e8ebf1] bg-white", className)}>{children}</section>;
}

export function BlockTitle({ children }: { readonly children: ReactNode }) {
  return <h3 className="px-3.5 pt-3.5 text-[13px] font-semibold tracking-[-0.01em] text-[#18233d]">{children}</h3>;
}

export function DetailRow({ label, value, className }: { readonly label: ReactNode; readonly value: ReactNode; readonly className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center justify-between gap-3 text-xs", className)}>
      <span className="min-w-0 text-[#7a849a]">{label}</span>
      <span className="shrink-0 font-medium text-[#34405a]">{value}</span>
    </div>
  );
}

export function ProgressLine({ value, tone = "blue" }: { readonly value: number; readonly tone?: "blue" | "green" | "amber" }) {
  const width = Math.max(0, Math.min(value, 100));
  const toneClass = tone === "green" ? "bg-[#20a36b]" : tone === "amber" ? "bg-[#d58a2d]" : "bg-[#2f6fed]";
  return (
    <div aria-label={`${width}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={width} className="h-1.5 overflow-hidden rounded-full bg-[#eef1f5]" role="progressbar">
      <div className={cn("h-full rounded-full transition-[width] duration-200", toneClass)} style={{ width: `${width}%` }} />
    </div>
  );
}

export function semanticAmountClass(kind: "EXPENSE" | "INCOME" | "TRANSFER" | "REFUND") {
  if (kind === "INCOME" || kind === "REFUND") return "text-[#168455]";
  if (kind === "TRANSFER") return "text-[#53627c]";
  return "text-[#17223b]";
}
