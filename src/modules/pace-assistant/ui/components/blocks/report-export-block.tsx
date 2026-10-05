"use client";

import { FiCheckCircle, FiDownload, FiFileText, FiLoader } from "react-icons/fi";

import { formatReportLabel, getReportLabels } from "@/i18n/report-messages";
import { useFinancialReportPdf } from "@/modules/reports/ui/use-financial-report-pdf";

import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock, DetailRow } from "./block-primitives";

type ReportExportData = Extract<PaceAssistantBlock, { type: "report-export" }>;

const LANGUAGE_NAMES = { en: "English", fr: "Français", de: "Deutsch" } as const;

export function ReportExportBlock({ block, locale }: { readonly block: ReportExportData; readonly locale: string }) {
  const { stage, error, savedFile, generate, renderHost } = useFinancialReportPdf();
  const labels = getReportLabels(block.language);
  const busy = stage !== "idle";
  const period = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).formatRange(
    new Date(`${block.periodFrom}T12:00:00Z`),
    new Date(`${block.periodTo}T12:00:00Z`),
  );

  return (
    <AssistantBlock className="px-3.5 py-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#f1f5ff] text-[#376fe6]"><FiFileText aria-hidden className="size-3.5" /></span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[#18233d]">{labels["report.header.title"]}</p>
          <p className="truncate text-[11px] text-[#7b859a]">{block.fileName}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <DetailRow label={labels["report.export.period"]} value={period} />
        <DetailRow label={labels["report.export.language"]} value={LANGUAGE_NAMES[block.language]} />
        <DetailRow label="PDF" value={formatReportLabel(labels, "report.export.pageCount", { count: block.pageCount })} />
      </div>
      {error ? <p className="mt-3 text-[12px] leading-5 text-[#9f1f30]" role="alert">{labels[`report.export.error.${error}`]}</p> : null}
      {savedFile && !busy ? (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[#168455]"><FiCheckCircle aria-hidden className="size-3.5" />{formatReportLabel(labels, "report.export.successFile", { file: savedFile })}</p>
      ) : null}
      <button
        aria-busy={busy || undefined}
        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-[#2563eb] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#1e55d1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976ef] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy}
        onClick={() => void generate({ workspaceSlug: block.workspaceSlug, period: block.period, currency: block.currency, language: block.language, sections: block.sections })}
        type="button"
      >
        {busy ? <FiLoader aria-hidden className="size-3.5 motion-safe:animate-spin" /> : <FiDownload aria-hidden className="size-3.5" />}
        {busy ? labels[`report.export.stage.${stage}`] : error ? labels["report.export.retry"] : savedFile ? labels["report.export.downloadAgain"] : labels["report.export.generate"]}
      </button>
      {renderHost}
    </AssistantBlock>
  );
}
