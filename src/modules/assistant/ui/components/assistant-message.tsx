import type { ReactNode } from "react";
import { HiOutlineArrowPath, HiOutlineExclamationTriangle } from "react-icons/hi2";

import { PaceLogo } from "@/components/pace/brand/pace-logo";

import type { AssistantMessages } from "../assistant-messages";

export function UserMessage({ text, messages }: { readonly text: string; readonly messages: AssistantMessages }) {
  return (
    <article className="flex justify-end">
      <div className="max-w-[85%] sm:max-w-[72%]">
        <p className="sr-only">{messages["conversation.you"]}</p>
        <div className="rounded-[12px] rounded-br-[4px] bg-[#eaf1ff] px-3.5 py-2.5 text-[14px] leading-6 whitespace-pre-wrap text-[#22304d] [overflow-wrap:anywhere]">
          {text}
        </div>
      </div>
    </article>
  );
}

export function PaceMessage({ children, messages }: { readonly children: ReactNode; readonly messages: AssistantMessages }) {
  return (
    <article className="min-w-0">
      <PaceByline label={messages["conversation.pace"]} />
      <div className="mt-2.5 min-w-0 space-y-3 [&_[data-assistant-text]>div]:text-[14px] [&_[data-assistant-text]>div]:leading-6 [&_[data-assistant-text]>div]:text-[#34405d]">
        {children}
      </div>
    </article>
  );
}

export function AssistantWorkingState({ label, messages }: { readonly label: string; readonly messages: AssistantMessages }) {
  return (
    <div className="min-w-0" role="status">
      <PaceByline label={messages["conversation.pace"]} />
      <p className="mt-2.5 flex items-center gap-2 text-[13px] text-[#65718a]">
        <span aria-hidden className="flex gap-1">
          <span className="size-1.5 rounded-full bg-[#2f6fed] motion-safe:animate-pulse" />
          <span className="size-1.5 rounded-full bg-[#2f6fed] opacity-70 motion-safe:animate-pulse motion-safe:[animation-delay:160ms]" />
          <span className="size-1.5 rounded-full bg-[#2f6fed] opacity-40 motion-safe:animate-pulse motion-safe:[animation-delay:320ms]" />
        </span>
        {label}
      </p>
    </div>
  );
}

export function AssistantErrorMessage({
  title,
  description,
  retryLabel,
  onRetry,
}: {
  readonly title: string;
  readonly description?: string;
  readonly retryLabel?: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[12px] border border-[#f1d5cf] bg-[#fffaf9] px-4 py-3.5" role="alert">
      <HiOutlineExclamationTriangle aria-hidden className="mt-0.5 size-4.5 shrink-0 text-[#b4472f]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#7c2d1c]">{title}</p>
        {description ? <p className="mt-0.5 text-[13px] leading-5 text-[#94503f]">{description}</p> : null}
      </div>
      {onRetry && retryLabel ? (
        <button
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-[#ecc9c1] bg-white px-2.5 text-[12px] font-semibold text-[#8f3521] transition-colors hover:bg-[#fff3f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b4472f]"
          onClick={onRetry}
          type="button"
        >
          <HiOutlineArrowPath aria-hidden className="size-3.5" />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

function PaceByline({ label }: { readonly label: string }) {
  return (
    <div className="flex items-center gap-2">
      <PaceLogo alt="" height={20} variant="icon" width={20} />
      <span className="text-[12px] font-semibold text-[#34405d]">{label}</span>
    </div>
  );
}
