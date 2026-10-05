"use client";

import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  CircleCheck,
  Download,
  FileText,
  Landmark,
  Lightbulb,
  LoaderCircle,
  Repeat,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  formatReportLabel,
  getReportLabels,
  type ReportLabels,
} from "@/i18n/report-messages";

import {
  REPORT_LANGUAGES,
  REPORT_OPTIONAL_SECTIONS,
  reportPages,
  type FinancialReportDTO,
  type ReportLanguage,
  type ReportOptionalSection,
} from "../domain/financial-report.types";
import {
  giveSvgImagesIntrinsicSize,
  makeColorsCanvasSafe,
  waitForImages,
  withAccurateTextBaselines,
} from "./html2canvas-compat";
import { FinancialReportDocument } from "./financial-report-document";

type Props = {
  readonly workspaceSlug: string;
  readonly periodKey: string;
  readonly inProgress: boolean;
  readonly currency: string;
  readonly language: ReportLanguage;
};

type Stage = "idle" | "preparing" | "rendering" | "exporting";
type ExportError = "request" | "render";

const STAGES = ["preparing", "rendering", "exporting"] as const;

const LANGUAGE_NAMES: Record<ReportLanguage, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
};

const SECTION_ICONS: Record<ReportOptionalSection, LucideIcon> = {
  transactions: ArrowLeftRight,
  accounts: Landmark,
  recurring: Repeat,
  insights: Lightbulb,
};

class ReportRequestError extends Error {}

export function FinancialReportExport({
  workspaceSlug,
  periodKey,
  inProgress,
  currency,
  language: initialLanguage,
}: Props) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState(initialLanguage);
  const [sections, setSections] = useState<ReportOptionalSection[]>([
    ...REPORT_OPTIONAL_SECTIONS,
  ]);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<ExportError | null>(null);
  const [savedFile, setSavedFile] = useState<string | null>(null);
  const [report, setReport] = useState<FinancialReportDTO | null>(null);
  const renderHost = useRef<HTMLDivElement>(null);
  const labels = getReportLabels(initialLanguage);
  const busy = stage !== "idle";
  const pageCount = reportPages(sections).length;

  function openDialog() {
    setError(null);
    setSavedFile(null);
    setOpen(true);
  }

  function closeDialog() {
    if (!busy) setOpen(false);
  }

  function toggleSection(section: ReportOptionalSection) {
    setError(null);
    setSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : REPORT_OPTIONAL_SECTIONS.filter(
            (item) => current.includes(item) || item === section,
          ),
    );
  }

  async function generate() {
    setError(null);
    setSavedFile(null);
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
      }).catch((cause: unknown) => {
        throw new ReportRequestError("Report request failed", { cause });
      });
      if (!response.ok) {
        throw new ReportRequestError(
          `Report request failed with ${response.status}`,
        );
      }
      const document = (await response.json()) as FinancialReportDTO;
      setReport(document);
      setStage("rendering");
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      await window.document.fonts.ready;
      const element = renderHost.current?.firstElementChild;
      if (!(element instanceof HTMLElement))
        throw new Error("Report was not rendered");
      await waitForImages(element);
      await giveSvgImagesIntrinsicSize(element);
      setStage("exporting");
      const { default: html2pdf } = await import("html2pdf.js");
      await withAccurateTextBaselines(() =>
        html2pdf()
          .set({
            margin: 0,
            filename: document.meta.fileName,
            image: { type: "jpeg", quality: 0.95 },
            html2canvas: {
              scale: 2,
              useCORS: true,
              backgroundColor: "#fff",
              onclone: (_clone: Document, reference: HTMLElement) =>
                makeColorsCanvasSafe(reference),
            },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          })
          .from(element)
          .save(),
      );
      setSavedFile(document.meta.fileName);
    } catch (cause) {
      console.error("[reports] Financial report export failed", cause);
      setError(cause instanceof ReportRequestError ? "request" : "render");
    } finally {
      setReport(null);
      setStage("idle");
    }
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#dbe3ef] bg-white px-3.5 text-[13px] font-medium text-[#243551] transition-colors hover:border-[#c7d3e4] hover:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976ef]"
        onClick={openDialog}
        type="button">
        <Download aria-hidden="true" size={15} />
        {labels["report.export.trigger"]}
      </button>

      <ResponsiveDialog
        onOpenChange={(next) => (next ? openDialog() : closeDialog())}
        open={open}>
        <ResponsiveDialogContent
          className="flex! max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100%-1rem)] max-w-115 flex-col gap-0 overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-115"
          drawerClassName="w-full max-w-none rounded-none rounded-t-[14px] border-x-0 border-b-0 border-[#e1e7f0] shadow-[0_-12px_32px_rgb(15_23_42/12%)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)] data-[vaul-drawer-direction=bottom]:rounded-t-[14px]"
          showCloseButton={false}>
          <Button
            aria-label={labels["report.export.close"]}
            className="absolute top-3 right-3 z-10 size-8 rounded-[7px] text-[#61708a] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30"
            disabled={busy}
            onClick={closeDialog}
            size="icon"
            type="button"
            variant="ghost">
            <X aria-hidden="true" className="size-4" />
          </Button>

          <ResponsiveDialogHeader className="gap-1 px-5 pt-5 pr-12 pb-4 sm:px-6 sm:pt-6 sm:pr-14">
            <ResponsiveDialogTitle className="text-[20px] leading-6 font-semibold tracking-tight text-[#101a35]">
              {labels["report.export.dialogTitle"]}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#64748b]">
              {labels["report.export.dialogDescription"]}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <ReportSummary
            inProgress={inProgress}
            labels={labels}
            language={initialLanguage}
            pageCount={pageCount}
            periodKey={periodKey}
          />

          <div className="min-h-0 flex-1 overflow-y-auto">
            {savedFile ? (
              <ExportSuccess fileName={savedFile} labels={labels} />
            ) : busy ? (
              <ExportProgress labels={labels} stage={stage} />
            ) : (
              <div className="grid gap-6 px-5 py-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 sm:px-6">
                <LanguagePicker
                  labels={labels}
                  onChange={(next) => {
                    setError(null);
                    setLanguage(next);
                  }}
                  value={language}
                />
                <fieldset className="grid gap-2.5">
                  <legend className="mb-2.5 text-[13px] font-medium text-[#384862]">
                    {labels["report.export.contents"]}
                  </legend>
                  <div className="grid gap-2">
                    {REPORT_OPTIONAL_SECTIONS.map((section) => (
                      <SectionOption
                        checked={sections.includes(section)}
                        key={section}
                        labels={labels}
                        onToggle={() => toggleSection(section)}
                        section={section}
                      />
                    ))}
                  </div>
                  <p className="text-[12px] leading-5 text-[#64748b]">
                    {labels["report.export.alwaysIncluded"]}
                  </p>
                </fieldset>
                {error ? (
                  <div
                    className="flex gap-2.5 rounded-[10px] border border-[#f3d0d4] bg-[#fdf3f4] px-3.5 py-3 text-[13px] leading-5 text-[#9f1f30]"
                    role="alert">
                    <AlertCircle
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <p>{labels[`report.export.error.${error}`]}</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <footer className="flex flex-col-reverse gap-2 border-t border-[#e8edf4] bg-[#fcfdff] px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            {savedFile ? (
              <>
                <Button
                  className="h-10 rounded-[8px] px-4 text-[13px] font-medium text-[#43516a]"
                  onClick={generate}
                  type="button"
                  variant="ghost">
                  <Download aria-hidden="true" className="size-3.5" />
                  {labels["report.export.downloadAgain"]}
                </Button>
                <Button
                  className="h-10 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1e55d1]"
                  onClick={closeDialog}
                  type="button">
                  {labels["report.export.done"]}
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="h-10 rounded-[8px] px-4 text-[13px] font-medium text-[#43516a]"
                  disabled={busy}
                  onClick={closeDialog}
                  type="button"
                  variant="ghost">
                  {labels["report.export.cancel"]}
                </Button>
                <Button
                  aria-busy={busy || undefined}
                  className="h-10 min-w-36 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1e55d1] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy}
                  onClick={generate}
                  type="button">
                  {busy ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-3.5 motion-safe:animate-spin"
                    />
                  ) : (
                    <Download aria-hidden="true" className="size-3.5" />
                  )}
                  {error
                    ? labels["report.export.retry"]
                    : labels["report.export.generate"]}
                </Button>
              </>
            )}
          </footer>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {report ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-[-10000px]"
          ref={renderHost}>
          <FinancialReportDocument pdf report={report} />
        </div>
      ) : null}
    </>
  );
}

function ReportSummary({
  inProgress,
  labels,
  language,
  pageCount,
  periodKey,
}: {
  readonly inProgress: boolean;
  readonly labels: ReportLabels;
  readonly language: ReportLanguage;
  readonly pageCount: number;
  readonly periodKey: string;
}) {
  return (
    <div className="mx-5 flex items-center gap-3.5 rounded-[10px] border border-[#e5eaf1] bg-[#f8fafc] px-4 py-3.5 sm:mx-6">
      <span
        aria-hidden="true"
        className="grid h-11 w-9 shrink-0 place-items-center rounded-[5px] border border-[#d9e1ec] bg-white text-[#2563eb] shadow-[0_1px_2px_rgb(15_23_42/6%)]">
        <FileText className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="sr-only">{labels["report.export.period"]}: </span>
          <span className="text-[15px] leading-5 font-semibold text-[#101a35]">
            {formatPeriod(periodKey, language)}
          </span>
          {inProgress ? (
            <span className="rounded-full bg-[#fff4e0] px-2 py-0.5 text-[11px] leading-4 font-medium text-[#8a4b00]">
              {labels["report.export.inProgress"]}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-[12px] leading-5 text-[#64748b] tabular-nums">
          {formatReportLabel(labels, "report.export.pageCount", {
            count: pageCount,
          })}
        </p>
      </div>
    </div>
  );
}

function LanguagePicker({
  labels,
  onChange,
  value,
}: {
  readonly labels: ReportLabels;
  readonly onChange: (language: ReportLanguage) => void;
  readonly value: ReportLanguage;
}) {
  return (
    <fieldset>
      <legend className="mb-2.5 text-[13px] font-medium text-[#384862]">
        {labels["report.export.language"]}
      </legend>
      <div className="grid grid-cols-3 gap-1 rounded-[9px] bg-[#f1f4f9] p-1">
        {REPORT_LANGUAGES.map((option) => (
          <label className="relative" key={option}>
            <input
              checked={value === option}
              className="peer sr-only"
              name="report-language"
              onChange={() => onChange(option)}
              type="radio"
              value={option}
            />
            <span className="flex h-8 cursor-pointer items-center justify-center rounded-[6px] text-[13px] font-medium text-[#5b6b85] transition-[background-color,color,box-shadow] duration-150 hover:text-[#1b2b48] peer-checked:bg-white peer-checked:text-[#101a35] peer-checked:shadow-[0_1px_2px_rgb(15_23_42/10%),0_0_0_1px_rgb(15_23_42/4%)] peer-focus-visible:ring-2 peer-focus-visible:ring-[#5e8fe8]/50">
              <span lang={option}>{LANGUAGE_NAMES[option]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SectionOption({
  checked,
  labels,
  onToggle,
  section,
}: {
  readonly checked: boolean;
  readonly labels: ReportLabels;
  readonly onToggle: () => void;
  readonly section: ReportOptionalSection;
}) {
  const Icon = SECTION_ICONS[section];
  return (
    <label className="group flex cursor-pointer items-center gap-3 rounded-[10px] border border-[#e5eaf1] bg-white px-3.5 py-3 transition-colors duration-150 hover:border-[#cfd9e7] has-checked:border-[#c5d6f6] has-checked:bg-[#f6f9ff] has-focus-visible:ring-2 has-focus-visible:ring-[#5e8fe8]/40">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[#f1f4f9] text-[#5b6b85] transition-colors duration-150 group-has-checked:bg-[#e3ecfd] group-has-checked:text-[#2563eb]">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-5 font-medium text-[#1b2b48]">
          {labels[`report.export.section.${section}`]}
        </span>
        <span className="block text-[12px] leading-5 text-[#64748b]">
          {labels[`report.export.sectionHint.${section}`]}
        </span>
      </span>
      <input
        checked={checked}
        className="peer sr-only"
        onChange={onToggle}
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className="grid size-4.5 shrink-0 place-items-center rounded-[5px] border border-[#c3cedd] bg-white text-white transition-colors duration-150 peer-checked:border-[#2563eb] peer-checked:bg-[#2563eb]">
        <Check
          className="size-3 opacity-0 group-has-checked:opacity-100"
          strokeWidth={3}
        />
      </span>
    </label>
  );
}

function ExportProgress({
  labels,
  stage,
}: {
  readonly labels: ReportLabels;
  readonly stage: Stage;
}) {
  const current = STAGES.indexOf(stage as (typeof STAGES)[number]);
  return (
    <div className="px-5 py-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 sm:px-6">
      <div
        aria-label={labels[`report.export.stage.${STAGES[current]}`]}
        aria-valuemax={STAGES.length}
        aria-valuemin={0}
        aria-valuenow={current + 1}
        className="h-1 overflow-hidden rounded-full bg-[#e8edf4]"
        role="progressbar">
        <div
          className="h-full rounded-full bg-[#2563eb] transition-[width] duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none"
          style={{ width: `${((current + 1) / STAGES.length) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-[12px] leading-5 text-[#64748b] tabular-nums">
        {formatReportLabel(labels, "report.export.stageProgress", {
          step: current + 1,
          total: STAGES.length,
        })}
      </p>
      <ol aria-live="polite" className="mt-4 grid gap-3">
        {STAGES.map((item, index) => {
          const state =
            index < current ? "done" : index === current ? "active" : "pending";
          return (
            <li
              aria-current={state === "active" ? "step" : undefined}
              className="flex items-center gap-3 text-[13px] leading-5"
              key={item}>
              <span
                aria-hidden="true"
                className={`grid size-5 shrink-0 place-items-center rounded-full ${
                  state === "done"
                    ? "bg-[#2563eb] text-white"
                    : state === "active"
                      ? "text-[#2563eb]"
                      : "border border-[#d5deea]"
                }`}>
                {state === "done" ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : state === "active" ? (
                  <LoaderCircle className="size-4.5 motion-safe:animate-spin" />
                ) : null}
              </span>
              <span
                className={
                  state === "pending"
                    ? "text-[#8592a8]"
                    : state === "active"
                      ? "font-medium text-[#101a35]"
                      : "text-[#43516a]"
                }>
                {labels[`report.export.stage.${item}`]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ExportSuccess({
  fileName,
  labels,
}: {
  readonly fileName: string;
  readonly labels: ReportLabels;
}) {
  return (
    <div
      className="flex items-start gap-3 px-5 py-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 sm:px-6"
      role="status">
      <CircleCheck
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-[#16794a]"
      />
      <div className="min-w-0">
        <p className="text-[14px] leading-5 font-semibold text-[#101a35]">
          {labels["report.export.successTitle"]}
        </p>
        <p className="mt-1 text-[13px] leading-5 break-all text-[#53627b]">
          {formatReportLabel(labels, "report.export.successFile", {
            file: fileName,
          })}
        </p>
      </div>
    </div>
  );
}

function formatPeriod(periodKey: string, language: ReportLanguage) {
  const [year, month] = periodKey.split("-").map(Number);
  if (!year || !month) return periodKey;
  const label = new Intl.DateTimeFormat(language, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 15));
  return label.charAt(0).toLocaleUpperCase(language) + label.slice(1);
}
