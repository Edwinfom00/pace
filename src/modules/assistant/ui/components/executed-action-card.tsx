import Link from "next/link";
import {
  HiCheckBadge,
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineNoSymbol,
} from "react-icons/hi2";

import type { AssistantActionView } from "../../domain/assistant-action";
import {
  formatAssistantMessage,
  type AssistantMessages,
} from "../assistant-messages";

export function ExecutedActionCard({
  outcome,
  view,
  messages,
  locale,
  timeZone,
}: {
  readonly outcome: "completed" | "cancelled" | "failed";
  readonly view: AssistantActionView;
  readonly messages: AssistantMessages;
  readonly locale: string;
  readonly timeZone: string;
}) {
  if (outcome === "cancelled") {
    return (
      <section className="flex items-start gap-3 rounded-[12px] border border-[#e5e9f0] bg-[#fafbfc] px-4 py-3.5">
        <HiOutlineNoSymbol
          aria-hidden
          className="mt-0.5 size-4.5 shrink-0 text-[#7b859a]"
        />
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-[#536079]">
            {view.title} · {messages["action.status.cancelled"]}
          </h3>
          <p className="mt-0.5 text-[12px] leading-5 text-[#7b859a]">
            {[view.amount, view.route].filter(Boolean).join(" · ") || null}
            {view.amount || view.route ? " — " : null}
            {messages["action.status.cancelledDescription"]}
          </p>
        </div>
      </section>
    );
  }

  if (outcome === "failed") {
    return (
      <section
        className="flex items-start gap-3 rounded-[12px] border border-[#f1d5cf] bg-[#fffaf9] px-4 py-3.5"
        role="alert">
        <HiOutlineExclamationTriangle
          aria-hidden
          className="mt-0.5 size-4.5 shrink-0 text-[#b4472f]"
        />
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-[#7c2d1c]">
            {view.title} · {messages["action.status.failed"]}
          </h3>
          <p className="mt-0.5 text-[12px] leading-5 text-[#94503f]">
            {view.failureMessage ?? messages["action.status.failedDescription"]}
          </p>
        </div>
      </section>
    );
  }

  const verifiedAt =
    view.verifiedAt && !Number.isNaN(Date.parse(view.verifiedAt))
      ? new Intl.DateTimeFormat(locale, {
          hour: "numeric",
          minute: "2-digit",
          timeZone,
        }).format(new Date(view.verifiedAt))
      : null;
  const details = view.route ? [] : view.fields.slice(0, 3);

  return (
    <section
      className="rounded-[12px] border border-[#cfe6da] bg-white"
      role="status">
      <div className="flex items-start gap-3 px-4 py-4">
        <HiOutlineCheckCircle
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-[#168455]"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-[#18233d]">
            {view.completedTitle}
          </h3>
          {view.amount ? (
            <p className="mt-0.5 text-[20px] leading-7 font-semibold tracking-[-0.02em] text-[#101a35] tabular-nums">
              {view.amount}
            </p>
          ) : null}
          {view.route ? (
            <p className="mt-0.5 text-[13px] text-[#536079]">{view.route}</p>
          ) : null}
          {details.length ? (
            <p className="mt-0.5 text-[13px] leading-5 text-[#536079]">
              {details.map((field) => field.value).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[#e3f0e9] px-4 py-2.5">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#157a50]">
          <HiCheckBadge aria-hidden className="size-4 shrink-0" />
          {verifiedAt
            ? formatAssistantMessage(messages, "action.status.verifiedAt", {
                time: verifiedAt,
              })
            : messages["action.status.verified"]}
        </p>
        {view.link ? (
          <Link
            className="inline-flex items-center gap-1 rounded-lg text-[12px] font-semibold text-[#2457c5] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed]"
            href={view.link.href}>
            {view.link.label}
            <HiOutlineArrowRight aria-hidden className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
