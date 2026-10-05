import type { ReactNode } from "react";
import type { IconType } from "react-icons";

import { cn } from "@/lib/utils";

import type { AssistantActionView } from "../../domain/assistant-action";

export function ActionStatusBar({
  icon: Icon,
  label,
  tone,
}: {
  readonly icon: IconType;
  readonly label: string;
  readonly tone: "approval" | "draft";
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 border-b px-4 py-2.5 text-[12px] font-semibold",
        tone === "approval"
          ? "border-[#d5e2fb] bg-[#f3f7ff] text-[#1f4fb8]"
          : "border-[#e9edf3] bg-[#f8f9fb] text-[#536079]",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {label}
    </p>
  );
}

export function ActionSummary({
  view,
  headingId,
  effectsLabel,
  children,
}: {
  readonly view: AssistantActionView;
  readonly headingId: string;
  readonly effectsLabel: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="px-4 py-4">
      <h3 className="text-[14px] font-semibold text-[#18233d]" id={headingId}>
        {view.title}
      </h3>
      {view.amount ? (
        <p className="mt-1 text-[28px] leading-9 font-semibold tracking-[-0.03em] text-[#101a35] tabular-nums">{view.amount}</p>
      ) : null}
      {view.fields.length ? (
        <dl className="mt-3.5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {view.fields.map((field, index) => (
            <div className="min-w-0" key={`${field.label}-${index}`}>
              <dt className="text-[11px] font-medium text-[#7b859a]">{field.label}</dt>
              <dd className="mt-0.5 text-[13px] font-medium text-[#22304d] [overflow-wrap:anywhere]">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {view.effects.length ? (
        <div className="mt-3.5 border-t border-[#edf0f4] pt-3">
          <p className="text-[11px] font-medium text-[#7b859a]">{effectsLabel}</p>
          <ul className="mt-1 space-y-1 text-[13px] leading-5 text-[#34405d]">
            {view.effects.map((effect) => (
              <li className="flex gap-2" key={effect}>
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-[#a4afbf]" />
                <span>{effect}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {children}
    </div>
  );
}
