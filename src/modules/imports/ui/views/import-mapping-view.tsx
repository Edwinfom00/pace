"use client";

import { useEffect, useId, useMemo, useReducer, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { ArrowLeft, ArrowRight, ChevronDown, Circle, CircleCheck, FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { ImportField, ImportFileType } from "../../domain";
import {
  columnsFromAssignments,
  evaluateImportColumns,
  IMPORT_COLUMN_IGNORED,
  IMPORT_OPTIONAL_FIELDS,
  type ImportColumnAssignments,
  type ImportColumnMappingEvaluation,
  type ImportColumnTarget,
  type ImportDetectedColumn,
} from "../../mapping/column-mapping";
import {
  blockedContinueCode,
  confirmImportColumns,
  importColumnStatus,
  importMappingReducer,
  importPreviewHref,
  initialImportMappingState,
  missingRequiredGroups,
  OPTIONAL_FIELD_OPTIONS,
  parseColumnTarget,
  REQUIRED_FIELD_OPTIONS,
} from "../import-mapping-flow";
import type { ImportColumnStatus, ImportMappingErrorCode, ImportMappingLabels } from "../import-mapping-labels";
import { formatImportLabel } from "../import-upload-labels";
import { transactionImportHref } from "../import-upload-flow";

export type ImportMappingSession = {
  readonly id: string;
  readonly fileName: string;
  readonly fileType: ImportFileType;
  readonly fileChecksum: string;
  readonly rowCount: number;
};

const STATUS_STYLES: Readonly<Record<ImportColumnStatus, string>> = {
  DETECTED: "bg-[#e8f6ee] text-[#15803d]",
  MAPPED: "bg-[#eef3ff] text-[#2563eb]",
  OPTIONAL: "bg-[#f1f4f8] text-[#53627b]",
  IGNORED: "bg-[#f1f4f8] text-[#71809a]",
  UNMAPPED: "border border-[#e5eaf1] bg-white text-[#71809a]",
};

export function ImportMappingView({
  labels,
  locale,
  workspaceId,
  workspaceSlug,
  session,
  columns,
  initialAssignments,
  editable,
}: {
  readonly labels: ImportMappingLabels;
  readonly locale: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly session: ImportMappingSession;
  readonly columns: readonly ImportDetectedColumn[];
  readonly initialAssignments: ImportColumnAssignments;
  readonly editable: boolean;
}) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const [state, dispatch] = useReducer(importMappingReducer, initialAssignments, initialImportMappingState);
  const [navigating, startNavigation] = useTransition();
  const evaluation = useMemo(
    () => evaluateImportColumns(columnsFromAssignments(state.assignments).columns),
    [state.assignments],
  );
  const busy = state.saving || navigating;

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!editable || state.stale) {
    return <ImportMappingStale labels={labels} message={state.stale ? state.errorCode : null} workspaceSlug={workspaceSlug} />;
  }

  async function submit() {
    if (busy) return;
    const blocked = blockedContinueCode(evaluation);
    if (blocked) {
      dispatch({ type: "continueBlocked", code: blocked });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "saveStarted" });
    try {
      const result = await confirmImportColumns({
        workspaceId,
        importSessionId: session.id,
        fileChecksum: session.fileChecksum,
        assignments: state.assignments,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.ok) {
        startNavigation(() => router.push(importPreviewHref(workspaceSlug, session.id)));
        dispatch({ type: "saveSettled" });
      } else {
        dispatch({ type: "saveFailed", code: result.code });
      }
    } catch {
      dispatch(controller.signal.aborted ? { type: "saveSettled" } : { type: "saveFailed", code: "NETWORK" });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  return (
    <ImportMappingScreen
      announcement={state.moved ? formatImportLabel(labels.fieldMoved, { field: labels.fields[state.moved.field], column: state.moved.column }) : ""}
      assignments={state.assignments}
      busy={busy}
      columns={columns}
      errorCode={state.errorCode}
      evaluation={evaluation}
      labels={labels}
      locale={locale}
      onAssign={(header, target) => dispatch({ type: "assigned", header, target })}
      onContinue={submit}
      session={session}
      workspaceSlug={workspaceSlug}
    />
  );
}

export function ImportMappingScreen({
  labels,
  locale,
  session,
  columns,
  assignments,
  evaluation,
  errorCode,
  busy,
  workspaceSlug,
  announcement = "",
  onAssign,
  onContinue,
}: {
  readonly labels: ImportMappingLabels;
  readonly locale: string;
  readonly session: ImportMappingSession;
  readonly columns: readonly ImportDetectedColumn[];
  readonly assignments: ImportColumnAssignments;
  readonly evaluation: ImportColumnMappingEvaluation;
  readonly errorCode: ImportMappingErrorCode | null;
  readonly busy: boolean;
  readonly workspaceSlug: string;
  readonly announcement?: string;
  readonly onAssign?: (header: string, target: ImportColumnTarget) => void;
  readonly onContinue?: () => void;
}) {
  const ids = useId();
  const errorId = `${ids}-error`;
  const rows = formatImportLabel(
    new Intl.PluralRules(locale).select(session.rowCount) === "one" ? labels.rowsOne : labels.rowsOther,
    { count: new Intl.NumberFormat(locale).format(session.rowCount) },
  );
  const missing = missingRequiredGroups(evaluation).map((group) => labels.requiredGroups[group]);
  const errorMessage = errorCode
    ? formatImportLabel(labels.errors[errorCode], { fields: new Intl.ListFormat(locale, { type: "conjunction" }).format(missing) })
    : null;
  const mappedFields = new Set(Object.values(assignments));
  const FileIcon = session.fileType === "CSV" ? FileText : FileSpreadsheet;

  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">{labels.title}</h1>
          <p className="mt-1 text-[13px] text-[#71809a]">{labels.description}</p>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 self-start rounded-[10px] border border-[#e5eaf1] bg-white px-3 py-2 sm:max-w-80">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#e8f6ee] text-[#16a34a]">
            <FileIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[#14213c]" title={session.fileName}>{session.fileName}</p>
            <p className="text-[12px] text-[#71809a]">{rows}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,300px)] lg:gap-5">
        <div className="min-w-0 space-y-3">
          <section aria-label={labels.columnsLabel} className="overflow-hidden rounded-[12px] border border-[#e5eaf1] bg-white">
            <div
              aria-hidden
              className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)] gap-4 border-b border-[#e5eaf1] bg-[#f8fafc] px-4 py-2.5 text-[12px] font-medium text-[#53627b] md:grid"
            >
              <span>{labels.colFileColumn}</span>
              <span>{labels.colSample}</span>
              <span>{labels.colMapTo}</span>
            </div>
            <ul className="divide-y divide-[#eef1f5]">
              {columns.map((column, index) => {
                const target = assignments[column.header] ?? null;
                const status = importColumnStatus(column, target);
                const selectId = `${ids}-field-${index}`;
                const statusId = `${ids}-status-${index}`;
                return (
                  <li
                    className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)] md:items-center md:gap-4"
                    data-status={status}
                    key={column.header}
                  >
                    <p className="truncate text-[13px] font-medium text-[#14213c]" title={column.header}>{column.header}</p>
                    <div className="min-w-0 text-[13px]" title={column.samples.join(" · ") || undefined}>
                      <span className="block text-[11px] font-medium text-[#71809a] md:sr-only">{labels.colSample}</span>
                      {column.samples.length === 0 ? (
                        <span className="text-[#9aa6b8] italic">{labels.sampleEmpty}</span>
                      ) : (
                        column.samples.map((sample, sampleIndex) => (
                          <span
                            className={cn("block truncate", sampleIndex === 0 ? "text-[#53627b]" : "text-[12px] text-[#9aa6b8]")}
                            key={sample}
                          >
                            {sample}
                          </span>
                        ))
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <select
                          aria-describedby={statusId}
                          aria-label={formatImportLabel(labels.fieldFor, { column: column.header })}
                          className={cn(
                            "h-11 w-full appearance-none truncate rounded-[8px] border bg-white pr-8 pl-3 text-[13px] transition-colors focus-visible:border-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb]/30 disabled:opacity-60 md:h-9",
                            target ? "border-[#dfe5ee] text-[#14213c]" : "border-[#dfe5ee] text-[#71809a]",
                          )}
                          disabled={busy}
                          id={selectId}
                          onChange={(event) => onAssign?.(column.header, parseColumnTarget(event.currentTarget.value))}
                          value={target ?? ""}
                        >
                          <option value="">{labels.chooseField}</option>
                          <optgroup label={labels.requiredOptions}>
                            {REQUIRED_FIELD_OPTIONS.map((field) => (
                              <option key={field} value={field}>{labels.fields[field]}</option>
                            ))}
                          </optgroup>
                          <optgroup label={labels.optionalOptions}>
                            {OPTIONAL_FIELD_OPTIONS.map((field) => (
                              <option key={field} value={field}>{labels.fields[field]}</option>
                            ))}
                          </optgroup>
                          <option value={IMPORT_COLUMN_IGNORED}>{labels.ignoreColumn}</option>
                        </select>
                        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-[#71809a]" />
                      </div>
                      <span
                        className={cn("inline-flex h-6 shrink-0 items-center justify-center rounded-[6px] px-2 text-[11px] font-medium md:min-w-21", STATUS_STYLES[status])}
                        id={statusId}
                      >
                        {labels.statuses[status]}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {errorMessage ? (
            <p className="text-[12px] font-medium text-[#c2412d]" id={errorId} role="alert">{errorMessage}</p>
          ) : null}
        </div>

        <aside className="h-fit rounded-[14px] border border-[#e5eaf1] bg-white">
          <section className="px-5 py-5">
            <h2 className="text-[14px] font-semibold text-[#14213c]">{labels.requiredTitle}</h2>
            <ul className="mt-3 space-y-2.5 text-[13px] text-[#43516a]">
              {evaluation.groups.map((group) => {
                const field = labels.requiredGroups[group.id];
                return (
                  <li className="flex items-center gap-2.5" data-satisfied={group.satisfied} key={group.id}>
                    {group.satisfied
                      ? <CircleCheck aria-hidden className="size-4.5 shrink-0 fill-[#16a34a] text-white" />
                      : <Circle aria-hidden className="size-4.5 shrink-0 text-[#c3ccd9]" />}
                    <span aria-hidden>{field}</span>
                    <span className="sr-only">{formatImportLabel(group.satisfied ? labels.requiredMet : labels.requiredMissing, { field })}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[12px] text-[#71809a]">
              {formatImportLabel(labels.requiredCount, { count: String(evaluation.satisfiedCount), total: String(evaluation.groups.length) })}
            </p>
          </section>
          <section className="border-t border-[#e5eaf1] px-5 py-5">
            <h2 className="text-[14px] font-semibold text-[#14213c]">{labels.optionalTitle}</h2>
            <ul className="mt-3 space-y-2.5 text-[13px] text-[#53627b]">
              {IMPORT_OPTIONAL_FIELDS.map((field: ImportField) => {
                const mapped = mappedFields.has(field);
                return (
                  <li className="flex items-center gap-2.5" data-mapped={mapped} key={field}>
                    <span aria-hidden className={cn("flex size-4.5 items-center justify-center rounded-full border", mapped ? "border-[#9dbcf7] bg-[#eef3ff]" : "border-[#dfe5ee]")}>
                      <span className={cn("size-1.5 rounded-full", mapped ? "bg-[#2563eb]" : "bg-[#c3ccd9]")} />
                    </span>
                    <span aria-hidden>{labels.fields[field]}</span>
                    <span className="sr-only">{formatImportLabel(mapped ? labels.optionalMapped : labels.optionalUnmapped, { field: labels.fields[field] })}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[#dfe5ee] bg-white px-4 text-[13px] font-medium text-[#43516a] transition-colors hover:border-[#c7d2e1] hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] sm:h-10"
          href={transactionImportHref(workspaceSlug)}
        >
          <ArrowLeft aria-hidden className="size-4" />
          {labels.back}
        </Link>
        <Button
          aria-busy={busy}
          aria-describedby={errorMessage ? errorId : undefined}
          aria-disabled={!evaluation.ready || busy}
          className={cn(
            "h-11 w-full rounded-[8px] bg-[#2563eb] px-5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30 sm:h-10 sm:w-auto",
            (!evaluation.ready || busy) && "opacity-60 hover:bg-[#2563eb]",
          )}
          onClick={onContinue}
          type="button"
        >
          {busy ? (
            <>
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              {labels.saving}
            </>
          ) : (
            <>
              {labels.continue}
              <ArrowRight aria-hidden className="size-4" />
            </>
          )}
        </Button>
      </div>

      <p aria-live="polite" className="sr-only">{announcement}</p>
    </main>
  );
}

export function ImportMappingStale({
  labels,
  message,
  workspaceSlug,
}: {
  readonly labels: ImportMappingLabels;
  readonly message: ImportMappingErrorCode | null;
  readonly workspaceSlug: string;
}) {
  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">{labels.title}</h1>
      <section className="mt-6 rounded-[14px] border border-[#e5eaf1] bg-white px-5 py-12 text-center" role="alert">
        <h2 className="text-[15px] font-semibold text-[#18243b]">{labels.staleTitle}</h2>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-5 text-[#71809a]">
          {message ? labels.errors[message] : labels.staleDescription}
        </p>
        <Link
          className="mt-4 inline-flex h-11 items-center justify-center rounded-[8px] bg-[#2563eb] px-5 text-[13px] font-medium text-white hover:bg-[#1e55d1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] sm:h-10"
          href={transactionImportHref(workspaceSlug)}
        >
          {labels.staleAction}
        </Link>
      </section>
    </main>
  );
}
