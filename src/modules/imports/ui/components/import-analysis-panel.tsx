import { useId } from "react";
import { cn } from "cn";
import { Check, Clock, FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  formatImportFileSize,
  importUploadPercent,
  type ImportAnalysisPhase,
  type ImportUploadState,
  type SelectedImportFile,
} from "../import-upload-flow";
import { formatImportLabel, type ImportUploadLabels } from "../import-upload-labels";

export type ImportAnalysisStepStatus = "done" | "active" | "pending";
export type ImportAnalysisStep = "upload" | "read" | "detect";

export function importAnalysisSteps(phase: ImportAnalysisPhase): Readonly<Record<ImportAnalysisStep, ImportAnalysisStepStatus>> {
  switch (phase) {
    case "uploading":
      return { upload: "active", read: "pending", detect: "pending" };
    case "reading":
      return { upload: "done", read: "active", detect: "pending" };
    case "detected":
      return { upload: "done", read: "done", detect: "done" };
    case "idle":
      return { upload: "pending", read: "pending", detect: "pending" };
  }
}

export function ImportAnalysisPanel({
  labels,
  locale,
  file,
  phase,
  uploaded,
  columnCount,
  slow,
  onCancel,
}: {
  readonly labels: ImportUploadLabels;
  readonly locale: string;
  readonly file: SelectedImportFile;
  readonly phase: Exclude<ImportAnalysisPhase, "idle">;
  readonly uploaded: ImportUploadState["uploaded"];
  readonly columnCount: number | null;
  readonly slow: boolean;
  readonly onCancel?: () => void;
}) {
  const titleId = `${useId()}-analysis`;
  const steps = importAnalysisSteps(phase);
  const percent = phase === "uploading" ? importUploadPercent(uploaded) : 100;
  const totalSize = formatImportFileSize(file.file.size, locale);
  const done = phase === "detected";
  const statusLabel: Record<ImportAnalysisStepStatus, string> = {
    done: labels.analysisStepDone,
    active: labels.analysisStepActive,
    pending: labels.analysisStepPending,
  };
  const items: readonly { id: ImportAnalysisStep; label: string; detail: string | null }[] = [
    {
      id: "upload",
      label: labels.analysisStepUpload,
      detail: steps.upload === "active"
        ? formatImportLabel(labels.analysisStepUploadDetail, {
          loaded: formatImportFileSize(Math.min(uploaded.loaded, file.file.size), locale),
          total: totalSize,
          percent: String(percent),
        })
        : steps.upload === "done" ? totalSize : null,
    },
    {
      id: "read",
      label: labels.analysisStepRead,
      detail: steps.read === "active" ? labels.analysisStepReadDetail : null,
    },
    {
      id: "detect",
      label: labels.analysisStepDetect,
      detail: done && columnCount !== null
        ? formatImportLabel(labels.analysisStepDetected, { count: new Intl.NumberFormat(locale).format(columnCount) })
        : null,
    },
  ];
  const FileIcon = file.fileType === "CSV" ? FileText : FileSpreadsheet;

  return (
    <section
      aria-busy={!done}
      aria-labelledby={titleId}
      className="overflow-hidden rounded-[14px] border border-[#dbe6fb] bg-white animate-in fade-in-0 duration-300 motion-reduce:animate-none"
      data-phase={phase}
    >
      <div
        aria-label={labels.analysisProgress}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={phase === "reading" ? undefined : percent}
        aria-valuetext={phase === "reading" ? labels.analysisStepRead : `${percent}%`}
        className="relative h-1 overflow-hidden bg-[#eef3ff]"
        role="progressbar"
      >
        {phase === "reading" ? (
          <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[#2563eb] animate-import-indeterminate motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-50" />
        ) : (
          <span
            className={cn("block h-full transition-[width] duration-300 ease-out", done ? "bg-[#16a34a]" : "bg-[#2563eb]")}
            style={{ width: `${percent}%` }}
          />
        )}
      </div>

      <div className="px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className={cn(
              "relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border transition-colors duration-300",
              done ? "border-[#bfe5cd] bg-[#e8f6ee] text-[#16a34a]" : "border-[#dbe6fb] bg-[#f6f9ff] text-[#2563eb]",
            )}
          >
            {done ? (
              <Check className="size-6 animate-in zoom-in-50 duration-300 motion-reduce:animate-none" strokeWidth={2.5} />
            ) : (
              <>
                <FileIcon className="size-6" />
                <span className="absolute inset-x-2 top-2.5 h-0.5 rounded-full bg-linear-to-r from-transparent via-[#2563eb] to-transparent shadow-[0_0_8px_rgba(37,99,235,0.55)] animate-import-scan motion-reduce:hidden" />
              </>
            )}
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[#14213c]" id={titleId}>
              {done ? labels.analysisDoneTitle : labels.analysisTitle}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-[#71809a]" title={file.file.name}>
              {file.file.name} · {totalSize}
            </p>
          </div>
        </div>

        <ol className="mt-6">
          {items.map((item, index) => {
            const status = steps[item.id];
            return (
              <li className="relative flex gap-3 pb-5 last:pb-0" data-status={status} data-step={item.id} key={item.id}>
                {index < items.length - 1 ? (
                  <span
                    aria-hidden
                    className={cn("absolute top-7 bottom-1 left-2.75 w-px transition-colors duration-300", status === "done" ? "bg-[#9fd8b5]" : "bg-[#e5eaf1]")}
                  />
                ) : null}
                <StepIcon status={status} />
                <div className="min-w-0 pt-0.5">
                  <p className={cn("text-[13px] font-medium", status === "pending" ? "text-[#9aa6b8]" : "text-[#14213c]")}>
                    {item.label}
                    <span className="sr-only"> ({statusLabel[status]})</span>
                  </p>
                  {item.detail ? <p className="mt-0.5 text-[12px] text-[#71809a] tabular-nums">{item.detail}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>

        {slow && !done ? (
          <p className="mt-5 flex items-start gap-2 rounded-[10px] bg-[#f6f9ff] px-3 py-2.5 text-[12px] leading-5 text-[#53627b] animate-in fade-in-0 duration-300 motion-reduce:animate-none">
            <Clock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[#2563eb]" />
            {labels.analysisSlow}
          </p>
        ) : null}

        {!done && onCancel ? (
          <div className="mt-5 flex justify-end">
            <Button
              className="h-11 rounded-[8px] px-4 text-[13px] font-medium text-[#53627b] hover:text-[#14213c] sm:h-9"
              onClick={onCancel}
              type="button"
              variant="ghost"
            >
              {labels.analysisCancel}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StepIcon({ status }: { readonly status: ImportAnalysisStepStatus }) {
  if (status === "done") {
    return (
      <span aria-hidden className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-[#16a34a] text-white animate-in zoom-in-75 duration-200 motion-reduce:animate-none">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span aria-hidden className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-[#eef3ff] text-[#2563eb] ring-1 ring-[#c9d8f5]">
        <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
      </span>
    );
  }
  return (
    <span aria-hidden className="relative flex size-6 shrink-0 items-center justify-center rounded-full border border-[#dfe5ee] bg-white">
      <span className="size-1.5 rounded-full bg-[#c3ccd9]" />
    </span>
  );
}
