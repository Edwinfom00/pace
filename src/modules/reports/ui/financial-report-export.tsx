"use client";

import { Download, FileText } from "lucide-react";
import { useRef, useState } from "react";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getReportLabels } from "@/i18n/report-messages";

import {
  REPORT_OPTIONAL_SECTIONS,
  type FinancialReportDTO,
  type ReportLanguage,
  type ReportOptionalSection,
} from "../domain/financial-report.types";
import { FinancialReportDocument } from "./financial-report-document";

type Props = {
  readonly workspaceSlug: string;
  readonly periodKey: string;
  readonly currency: string;
  readonly language: ReportLanguage;
};

export function FinancialReportExport({
  workspaceSlug,
  periodKey,
  currency,
  language: initialLanguage,
}: Props) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState(initialLanguage);
  const [sections, setSections] = useState<ReportOptionalSection[]>([
    ...REPORT_OPTIONAL_SECTIONS,
  ]);
  const [stage, setStage] = useState<"idle" | "preparing" | "rendering" | "exporting">("idle");
  const [error, setError] = useState(false);
  const [report, setReport] = useState<FinancialReportDTO | null>(null);
  const renderHost = useRef<HTMLDivElement>(null);
  const labels = getReportLabels(language);
  const busy = stage !== "idle";

  function toggleSection(section: ReportOptionalSection) {
    setSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : REPORT_OPTIONAL_SECTIONS.filter(
            (item) => current.includes(item) || item === section,
          ),
    );
  }

  async function generate() {
    setError(false);
    setStage("preparing");
    try {
      const response = await fetch("/api/reports/financial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          workspaceSlug,
          period: periodKey,
          currency,
          language,
          sections: sections.join(","),
        }),
      });
      if (!response.ok) throw new Error("Report request failed");
      const document = (await response.json()) as FinancialReportDTO;
      setReport(document);
      setStage("rendering");
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await window.document.fonts.ready;
      const element = renderHost.current?.firstElementChild;
      if (!(element instanceof HTMLElement)) throw new Error("Report was not rendered");
      await Promise.all(
        Array.from(element.querySelectorAll("img")).map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      );
      setStage("exporting");
      const { default: html2pdf } = await import("html2pdf.js");
      await html2pdf()
        .set({
          margin: 0,
          filename: document.meta.fileName,
          image: { type: "jpeg", quality: 0.96 },
          html2canvas: { scale: 1.5, useCORS: true, backgroundColor: "#fff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(element)
        .save();
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setReport(null);
      setStage("idle");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#dbe3ef] bg-white px-3.5 text-[13px] font-medium text-[#243551] hover:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976ef]" type="button">
            <Download size={15} />
            {labels["report.export.trigger"]}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <FileText size={16} />
            {labels["report.export.menuPdf"]}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResponsiveDialog onOpenChange={(next) => !busy && setOpen(next)} open={open}>
        <ResponsiveDialogContent className="max-w-lg gap-0 p-0">
          <ResponsiveDialogHeader className="border-b border-[#e7ecf3] px-6 py-5">
            <ResponsiveDialogTitle className="text-xl font-semibold">
              {labels["report.export.dialogTitle"]}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {labels["report.export.dialogDescription"]}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="space-y-5 px-6 py-6 text-sm text-[#263653]">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{labels["report.export.period"]}</span>
              <span>{periodKey}</span>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="font-medium">{labels["report.export.language"]}</span>
              <select className="rounded-[8px] border border-[#dbe3ef] bg-white px-3 py-2" disabled={busy} onChange={(event) => setLanguage(event.target.value as ReportLanguage)} value={language}>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
              </select>
            </label>
            <fieldset className="space-y-3">
              <legend className="mb-2 font-medium">{labels["report.export.include"]}</legend>
              {REPORT_OPTIONAL_SECTIONS.map((section) => (
                <label className="flex items-center gap-3" key={section}>
                  <input checked={sections.includes(section)} className="size-4 accent-[#1976ef]" disabled={busy} onChange={() => toggleSection(section)} type="checkbox" />
                  {labels[`report.export.section.${section}`]}
                </label>
              ))}
            </fieldset>
            {busy ? <p aria-live="polite" className="text-[#526889]">{labels[`report.export.stage.${stage}`]}</p> : null}
            {error ? <p role="alert" className="text-[#b42318]">{labels["report.export.error"]}</p> : null}
          </div>
          <ResponsiveDialogFooter className="px-6 py-4">
            <button className="rounded-[8px] border border-[#dbe3ef] px-4 py-2 text-sm font-medium" disabled={busy} onClick={() => setOpen(false)} type="button">
              {labels["report.export.cancel"]}
            </button>
            <button className="rounded-[8px] bg-[#101a35] px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={busy} onClick={generate} type="button">
              {error ? labels["report.export.retry"] : labels["report.export.generate"]}
            </button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      {report ? (
        <div aria-hidden="true" className="pointer-events-none fixed -left-[10000px] top-0" ref={renderHost}>
          <FinancialReportDocument pdf report={report} />
        </div>
      ) : null}
    </>
  );
}
