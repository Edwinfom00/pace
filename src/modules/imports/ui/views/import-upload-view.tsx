"use client";

import { useEffect, useId, useReducer, useRef, useState, useTransition, type DragEvent, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { ArrowLeft, ArrowRight, CircleCheck, FileSpreadsheet, FileText, LoaderCircle, ScanSearch, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { IMPORT_FILE_ACCEPT } from "../../import-file-policy";
import {
  analyzeImportFile,
  formatImportFileSize,
  formatImportSizeLimit,
  IMPORT_UPLOAD_FORMATS,
  importSessionHref,
  importUploadReducer,
  transactionsHref,
  INITIAL_IMPORT_UPLOAD_STATE,
  type ImportUploadState,
  type SelectedImportFile,
} from "../import-upload-flow";
import { formatImportLabel, type ImportUploadErrorCode, type ImportUploadLabels } from "../import-upload-labels";
import { ImportAnalysisPanel } from "../components/import-analysis-panel";

const SLOW_ANALYSIS_MS = 6000;
const COMPLETION_BEAT_MS = 500;

type ImportAnalysisView = Pick<ImportUploadState, "phase" | "uploaded" | "columnCount"> & { readonly slow: boolean };

function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes("Files"));
}

export function ImportUploadView({
  labels,
  locale,
  workspaceId,
  workspaceSlug,
}: {
  readonly labels: ImportUploadLabels;
  readonly locale: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, dispatch] = useReducer(importUploadReducer, INITIAL_IMPORT_UPLOAD_STATE);
  const [dragActive, setDragActive] = useState(false);
  const [removalAnnounced, setRemovalAnnounced] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [slow, setSlow] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const busy = state.analyzing || navigating;
  const announcement = state.phase === "uploading"
    ? labels.analysisStepUpload
    : state.phase === "reading"
      ? labels.analysisStepRead
      : state.phase === "detected"
        ? formatImportLabel(labels.analysisStepDetected, { count: String(state.columnCount ?? 0) })
        : cancelled
          ? labels.analysisCancelled
          : state.selected
            ? formatImportLabel(labels.fileSelected, { name: state.selected.file.name })
            : removalAnnounced ? labels.fileRemoved : "";

  useEffect(() => {
    const preventNavigation = (event: globalThis.DragEvent) => {
      if (hasDraggedFiles(event.dataTransfer)) event.preventDefault();
    };
    window.addEventListener("dragover", preventNavigation);
    window.addEventListener("drop", preventNavigation);
    return () => {
      window.removeEventListener("dragover", preventNavigation);
      window.removeEventListener("drop", preventNavigation);
      abortRef.current?.abort();
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  function openPicker() {
    if (!busy) inputRef.current?.click();
  }

  function stopSlowTimer() {
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = null;
    setSlow(false);
  }

  function cancelAnalysis() {
    abortRef.current?.abort();
  }

  function removeFile() {
    setCancelled(false);
    dispatch({ type: "removed" });
    setRemovalAnnounced(true);
    chooseRef.current?.focus();
  }

  function handleDrag(event: DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = busy ? "none" : "copy";
    if (!busy) setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (!busy) dispatch({ type: "filesChosen", files: event.dataTransfer.files });
  }

  async function analyze() {
    if (!state.selected || busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setCancelled(false);
    stopSlowTimer();
    slowTimerRef.current = setTimeout(() => setSlow(true), SLOW_ANALYSIS_MS);
    dispatch({ type: "analyzeStarted" });
    try {
      const result = await analyzeImportFile({
        workspaceId,
        file: state.selected.file,
        signal: controller.signal,
        onUploadProgress: (loaded, total) => dispatch({ type: "uploadProgressed", loaded, total }),
      });
      if (controller.signal.aborted) return;
      stopSlowTimer();
      if (result.ok) {
        dispatch({ type: "analyzeSucceeded", columnCount: result.columnCount });
        await new Promise((resolve) => setTimeout(resolve, COMPLETION_BEAT_MS));
        if (!controller.signal.aborted) {
          startNavigation(() => router.push(importSessionHref(workspaceSlug, result.importSessionId)));
        }
      } else {
        dispatch({ type: "analyzeFailed", code: result.code });
      }
    } catch {
      stopSlowTimer();
      if (controller.signal.aborted) {
        setCancelled(true);
        dispatch({ type: "analyzeAborted" });
      } else {
        dispatch({ type: "analyzeFailed", code: "NETWORK" });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  return (
    <ImportUploadScreen
      analysis={state.phase === "idle" ? null : { phase: state.phase, uploaded: state.uploaded, columnCount: state.columnCount, slow }}
      announcement={announcement}
      busy={busy}
      chooseRef={chooseRef}
      dragActive={dragActive}
      errorCode={state.errorCode}
      inputRef={inputRef}
      labels={labels}
      locale={locale}
      onAnalyze={analyze}
      onCancelAnalysis={cancelAnalysis}
      onChoose={openPicker}
      onDrag={handleDrag}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onFilesChosen={(files) => dispatch({ type: "filesChosen", files })}
      onRemove={removeFile}
      selected={state.selected}
      workspaceSlug={workspaceSlug}
    />
  );
}

export function ImportUploadScreen({
  labels,
  locale,
  selected,
  errorCode,
  busy,
  workspaceSlug,
  dragActive = false,
  announcement = "",
  analysis = null,
  onCancelAnalysis,
  inputRef,
  chooseRef,
  onChoose,
  onFilesChosen,
  onRemove,
  onAnalyze,
  onDrag,
  onDragLeave,
  onDrop,
}: {
  readonly labels: ImportUploadLabels;
  readonly locale: string;
  readonly selected: SelectedImportFile | null;
  readonly errorCode: ImportUploadErrorCode | null;
  readonly busy: boolean;
  readonly workspaceSlug: string;
  readonly dragActive?: boolean;
  readonly announcement?: string;
  readonly analysis?: ImportAnalysisView | null;
  readonly onCancelAnalysis?: () => void;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  readonly chooseRef?: RefObject<HTMLButtonElement | null>;
  readonly onChoose?: () => void;
  readonly onFilesChosen?: (files: FileList | null) => void;
  readonly onRemove?: () => void;
  readonly onAnalyze?: () => void;
  readonly onDrag?: (event: DragEvent<HTMLDivElement>) => void;
  readonly onDragLeave?: (event: DragEvent<HTMLDivElement>) => void;
  readonly onDrop?: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const ids = useId();
  const titleId = `${ids}-title`;
  const formatsId = `${ids}-formats`;
  const errorId = `${ids}-error`;
  const sizeLimit = formatImportSizeLimit(locale);
  const errorMessage = errorCode
    ? formatImportLabel(labels.errors[errorCode], { size: sizeLimit, formats: IMPORT_UPLOAD_FORMATS })
    : null;
  const describedBy = errorMessage ? `${formatsId} ${errorId}` : formatsId;
  const FileIcon = selected?.fileType === "CSV" ? FileText : FileSpreadsheet;

  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="pb-5">
        <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">{labels.title}</h1>
        <p className="mt-1 text-[13px] text-[#71809a]">{labels.description}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:gap-5">
        <div className="min-w-0 space-y-3">
          {analysis && analysis.phase !== "idle" && selected ? (
            <ImportAnalysisPanel
              columnCount={analysis.columnCount}
              file={selected}
              labels={labels}
              locale={locale}
              onCancel={onCancelAnalysis}
              phase={analysis.phase}
              slow={analysis.slow}
              uploaded={analysis.uploaded}
            />
          ) : (
          <>
          <div
            aria-busy={busy}
            aria-describedby={describedBy}
            aria-labelledby={titleId}
            className={cn(
              "flex flex-col items-center rounded-[14px] border border-dashed px-5 py-10 text-center transition-colors sm:py-12",
              dragActive ? "border-[#2563eb] bg-[#eaf1ff]" : "border-[#c9d8f5] bg-[#f6f9ff]",
              errorMessage && !dragActive && "border-[#f1b8ae]",
            )}
            data-drag-active={dragActive || undefined}
            onDragEnter={onDrag}
            onDragLeave={onDragLeave}
            onDragOver={onDrag}
            onDrop={onDrop}
            role="group"
          >
            <span aria-hidden className="flex size-12 items-center justify-center rounded-[12px] bg-[#e7eefe] text-[#2563eb]">
              <FileText className="size-6" />
            </span>
            <p className="mt-4 text-[15px] font-semibold text-[#14213c]" id={titleId}>
              {dragActive ? labels.dropActive : labels.dropTitle}
            </p>
            <p className="mt-1 text-[12px] text-[#71809a]" id={formatsId}>
              {formatImportLabel(labels.acceptedFormats, { formats: IMPORT_UPLOAD_FORMATS, size: sizeLimit })}
            </p>
            <Button
              aria-describedby={describedBy}
              aria-invalid={errorMessage ? true : undefined}
              className="mt-5 h-11 rounded-[8px] bg-[#2563eb] px-5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30 sm:h-10"
              disabled={busy}
              onClick={onChoose}
              ref={chooseRef}
              type="button"
            >
              {labels.chooseFile}
            </Button>
            <input
              accept={IMPORT_FILE_ACCEPT}
              aria-label={labels.fileField}
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                onFilesChosen?.(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
              ref={inputRef}
              tabIndex={-1}
              type="file"
            />
          </div>

          {errorMessage ? (
            <p className="text-[12px] font-medium text-[#c2412d]" id={errorId} role="alert">
              {errorMessage}
            </p>
          ) : null}

          {selected ? (
            <section
              aria-label={labels.selectedFile}
              className="flex items-center gap-3 rounded-[12px] border border-[#e5eaf1] bg-white px-3 py-3 sm:px-4"
            >
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#e8f6ee] text-[#16a34a]">
                <FileIcon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[#14213c]" title={selected.file.name}>
                  {selected.file.name}
                </p>
                <p className="mt-0.5 text-[12px] text-[#71809a]">
                  {formatImportLabel(labels.fileMeta, {
                    type: selected.fileType,
                    size: formatImportFileSize(selected.file.size, locale),
                  })}
                </p>
              </div>
              <Button
                className="h-11 rounded-[8px] bg-[#eef3ff] px-4 text-[13px] font-medium text-[#2563eb] shadow-none hover:bg-[#e2ebff] focus-visible:ring-[#2563eb]/30 sm:h-9"
                disabled={busy}
                onClick={onChoose}
                type="button"
                variant="secondary"
              >
                {labels.replace}
              </Button>
              <Button
                aria-label={formatImportLabel(labels.remove, { name: selected.file.name })}
                className="size-11 rounded-[8px] text-[#71809a] hover:text-[#14213c] sm:size-9"
                disabled={busy}
                onClick={onRemove}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden className="size-4" />
              </Button>
            </section>
          ) : null}
          </>
          )}
        </div>

        <aside className="rounded-[14px] border border-[#e5eaf1] bg-white">
          <section className="px-5 py-5">
            <h2 className="text-[14px] font-semibold text-[#1d3a8a]">{labels.beforeTitle}</h2>
            <p className="mt-1.5 text-[13px] leading-5 text-[#71809a]">{labels.beforeDescription}</p>
            <ul className="mt-4 space-y-2.5 text-[13px] text-[#43516a]">
              {[labels.requirementDate, labels.requirementAmount, labels.requirementDescription].map((requirement) => (
                <li className="flex items-center gap-2.5" key={requirement}>
                  <CircleCheck aria-hidden className="size-4.5 shrink-0 fill-[#16a34a] text-white" />
                  {requirement}
                </li>
              ))}
              <li className="flex items-start gap-2.5 pt-1 text-[#71809a]">
                <span aria-hidden className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-[5px] bg-[#eef2f7] text-[#53627b]">
                  <ScanSearch className="size-3" />
                </span>
                {labels.autoDetect}
              </li>
            </ul>
          </section>
          <section className="border-t border-[#e5eaf1] px-5 py-5">
            <h2 className="text-[14px] font-semibold text-[#14213c]">{labels.securityTitle}</h2>
            <p className="mt-1.5 text-[13px] leading-5 text-[#71809a]">{labels.securityDescription}</p>
          </section>
        </aside>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[#dfe5ee] bg-white px-4 text-[13px] font-medium text-[#43516a] transition-colors hover:border-[#c7d2e1] hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] sm:h-10"
          href={transactionsHref(workspaceSlug)}
        >
          <ArrowLeft aria-hidden className="size-4" />
          {labels.back}
        </Link>
        <Button
          aria-busy={busy}
          className="h-11 w-full rounded-[8px] bg-[#2563eb] px-5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30 sm:h-10 sm:w-auto"
          disabled={!selected || busy}
          onClick={onAnalyze}
          type="button"
        >
          {busy ? (
            <>
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              {labels.analyzing}
            </>
          ) : (
            <>
              {labels.analyze}
              <ArrowRight aria-hidden className="size-4" />
            </>
          )}
        </Button>
      </div>

      <p aria-live="polite" className="sr-only">{announcement}</p>
    </main>
  );
}
