"use client";

import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineDocumentText,
} from "react-icons/hi2";

import { formatReportLabel, getReportLabels } from "@/i18n/report-messages";
import type { PaceAssistantBlock } from "@/modules/pace-assistant/types/pace-assistant";
import { useFinancialReportPdf } from "@/modules/reports/ui/use-financial-report-pdf";

type ReportExportBlock = Extract<PaceAssistantBlock, { type: "report-export" }>;

export function ReportResultCard({ block, locale }: { readonly block: ReportExportBlock; readonly locale: string }) {
  const { stage, error, savedFile, generate, renderHost } = useFinancialReportPdf();
  const labels = getReportLabels(block.language);
  const busy = stage !== "idle";
  const period = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).formatRange(
    new Date(`${block.periodFrom}T12:00:00Z`),
    new Date(`${block.periodTo}T12:00:00Z`),
  );

  return (
    <section className="rounded-[12px] border border-[#e5e9f0] bg-white">
      <div className="flex flex-col gap-3.5 px-4 py-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f1f5ff] text-[#2f6fed]">
            <HiOutlineDocumentText aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-[#18233d]">{labels["report.header.title"]}</h3>
            <p className="mt-0.5 text-[12px] leading-5 text-[#536079]">{period}</p>
            <p className="truncate text-[11px] text-[#7b859a]">
              PDF · {formatReportLabel(labels, "report.export.pageCount", { count: block.pageCount })} · {block.fileName}
            </p>
          </div>
        </div>
        <button
          aria-busy={busy || undefined}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[9px] bg-[#2f6fed] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#225ed6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy}
          onClick={() =>
            void generate({
              workspaceSlug: block.workspaceSlug,
              period: block.period,
              currency: block.currency,
              language: block.language,
              sections: block.sections,
            })
          }
          type="button"
        >
          {busy ? (
            <HiOutlineArrowPath aria-hidden className="size-4 motion-safe:animate-spin" />
          ) : (
            <HiOutlineArrowDownTray aria-hidden className="size-4" />
          )}
          {busy
            ? labels[`report.export.stage.${stage}`]
            : error
              ? labels["report.export.retry"]
              : savedFile
                ? labels["report.export.downloadAgain"]
                : labels["report.export.generate"]}
        </button>
      </div>
      {error ? (
        <p className="border-t border-[#f1d5cf] bg-[#fffaf9] px-4 py-2.5 text-[12px] leading-5 text-[#94503f]" role="alert">
          {labels[`report.export.error.${error}`]}
        </p>
      ) : null}
      {savedFile && !busy ? (
        <p className="flex items-center gap-1.5 border-t border-[#edf0f4] px-4 py-2.5 text-[12px] text-[#157a50]" role="status">
          <HiOutlineCheckCircle aria-hidden className="size-4 shrink-0" />
          {formatReportLabel(labels, "report.export.successFile", { file: savedFile })}
        </p>
      ) : null}
      {renderHost}
    </section>
  );
}
