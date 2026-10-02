"use client";

import { useEffect, useId, useMemo, useReducer, useRef, useState, useTransition, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Coins,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Info,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import type { ImportField, ImportFileType } from "../../domain";
import {
  columnForFields,
  columnsFromAssignments,
  evaluateImportColumns,
  IMPORT_COLUMN_IGNORED,
  IMPORT_REQUIRED_GROUPS,
  type ImportColumnAssignments,
  type ImportColumnMappingEvaluation,
  type ImportDetectedColumn,
  type ImportRequiredGroupId,
} from "../../mapping/column-mapping";
import {
  blockedContinueCode,
  confirmImportColumns,
  importMappingReducer,
  importPreviewHref,
  initialImportMappingState,
  missingRequiredGroups,
  spreadsheetColumnLetter,
} from "../import-mapping-flow";
import type { ImportMappingErrorCode, ImportMappingLabels } from "../import-mapping-labels";
import { formatImportLabel } from "../import-upload-labels";
import { transactionImportHref } from "../import-upload-flow";

export type ImportMappingSession = {
  readonly id: string;
  readonly fileName: string;
  readonly fileType: ImportFileType;
  readonly fileChecksum: string;
  readonly rowCount: number;
};

type IconComponent = ComponentType<{ className?: string }>;

const FIELD_VISUALS: Readonly<Record<ImportField, { icon: IconComponent; tone: string; text: string }>> = {
  transactionDate: { icon: CalendarDays, tone: "bg-[#eef3ff] text-[#2563eb]", text: "text-[#2563eb]" },
  bookingDate: { icon: CalendarClock, tone: "bg-[#eef3ff] text-[#2563eb]", text: "text-[#2563eb]" },
  amount: { icon: Banknote, tone: "bg-[#e8f6ee] text-[#16a34a]", text: "text-[#15803d]" },
  debit: { icon: Banknote, tone: "bg-[#fdecec] text-[#dc2626]", text: "text-[#dc2626]" },
  credit: { icon: Banknote, tone: "bg-[#e8f6ee] text-[#16a34a]", text: "text-[#15803d]" },
  description: { icon: Store, tone: "bg-[#f3efff] text-[#7c3aed]", text: "text-[#7c3aed]" },
  merchant: { icon: Store, tone: "bg-[#f3efff] text-[#7c3aed]", text: "text-[#7c3aed]" },
  transactionType: { icon: ArrowLeftRight, tone: "bg-[#fff1e6] text-[#ea6c0a]", text: "text-[#ea6c0a]" },
  accountReference: { icon: Wallet, tone: "bg-[#e7f6fb] text-[#0e8fb5]", text: "text-[#0e8fb5]" },
  currency: { icon: Coins, tone: "bg-[#fdf4dd] text-[#b7860b]", text: "text-[#b7860b]" },
};

const REQUIRED_SLOTS: readonly { group: ImportRequiredGroupId; field: ImportField }[] = [
  { group: "date", field: "transactionDate" },
  { group: "amount", field: "amount" },
  { group: "description", field: "description" },
];

const OPTIONAL_SLOTS: readonly ImportField[] = ["transactionType", "accountReference", "merchant", "currency", "bookingDate"];

export function ImportMappingView({
  labels,
  locale,
  workspaceId,
  workspaceSlug,
  session,
  columns,
  previewRows,
  initialAssignments,
  editable,
}: {
  readonly labels: ImportMappingLabels;
  readonly locale: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly session: ImportMappingSession;
  readonly columns: readonly ImportDetectedColumn[];
  readonly previewRows: readonly Readonly<Record<string, string>>[];
  readonly initialAssignments: ImportColumnAssignments;
  readonly editable: boolean;
}) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const [state, dispatch] = useReducer(importMappingReducer, initialAssignments, initialImportMappingState);
  const [amountSplit, setAmountSplit] = useState(() => Object.values(initialAssignments).some((target) => target === "debit" || target === "credit"));
  const [bulkIgnored, setBulkIgnored] = useState(false);
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

  const announcement = state.moved
    ? formatImportLabel(labels.fieldMoved, { field: labels.fields[state.moved.field], column: state.moved.column })
    : bulkIgnored ? labels.remainingIgnored : "";

  return (
    <ImportMappingScreen
      amountSplit={amountSplit}
      announcement={announcement}
      assignments={state.assignments}
      busy={busy}
      columns={columns}
      errorCode={state.errorCode}
      evaluation={evaluation}
      labels={labels}
      locale={locale}
      onAmountSplitChange={(split) => {
        setAmountSplit(split);
        dispatch({ type: "amountModeChanged", split });
      }}
      onColumnIgnoredChange={(header, ignored) => {
        setBulkIgnored(false);
        dispatch({ type: "assigned", header, target: ignored ? IMPORT_COLUMN_IGNORED : null });
      }}
      onContinue={submit}
      onFieldAssign={(field, header) => {
        setBulkIgnored(false);
        dispatch({ type: "fieldAssigned", field, header });
      }}
      onIgnoreRemaining={() => {
        setBulkIgnored(true);
        dispatch({ type: "unmappedIgnored" });
      }}
      previewRows={previewRows}
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
  previewRows,
  assignments,
  evaluation,
  errorCode,
  busy,
  workspaceSlug,
  amountSplit = false,
  announcement = "",
  onFieldAssign,
  onAmountSplitChange,
  onColumnIgnoredChange,
  onIgnoreRemaining,
  onContinue,
}: {
  readonly labels: ImportMappingLabels;
  readonly locale: string;
  readonly session: ImportMappingSession;
  readonly columns: readonly ImportDetectedColumn[];
  readonly previewRows: readonly Readonly<Record<string, string>>[];
  readonly assignments: ImportColumnAssignments;
  readonly evaluation: ImportColumnMappingEvaluation;
  readonly errorCode: ImportMappingErrorCode | null;
  readonly busy: boolean;
  readonly workspaceSlug: string;
  readonly amountSplit?: boolean;
  readonly announcement?: string;
  readonly onFieldAssign?: (field: ImportField, header: string | null) => void;
  readonly onAmountSplitChange?: (split: boolean) => void;
  readonly onColumnIgnoredChange?: (header: string, ignored: boolean) => void;
  readonly onIgnoreRemaining?: () => void;
  readonly onContinue?: () => void;
}) {
  const ids = useId();
  const errorId = `${ids}-error`;
  const number = new Intl.NumberFormat(locale);
  const rows = formatImportLabel(
    new Intl.PluralRules(locale).select(session.rowCount) === "one" ? labels.rowsOne : labels.rowsOther,
    { count: number.format(session.rowCount) },
  );
  const missing = missingRequiredGroups(evaluation).map((group) => labels.requiredGroups[group]);
  const errorMessage = errorCode
    ? formatImportLabel(labels.errors[errorCode], { fields: new Intl.ListFormat(locale, { type: "conjunction" }).format(missing) })
    : null;
  const FileIcon = session.fileType === "CSV" ? FileText : FileSpreadsheet;
  const satisfied = new Map(evaluation.groups.map((group) => [group.id, group.satisfied]));
  const slotProps = { assignments, busy, columns, labels, onFieldAssign };

  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">{labels.title}</h1>
            <span
              aria-label={formatImportLabel(labels.columnCount, { count: number.format(columns.length) })}
              className="rounded-md bg-[#eef2f7] px-2 py-0.5 text-[12px] font-medium text-[#53627b]"
            >
              {number.format(columns.length)}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-[#71809a]">{labels.description}</p>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 self-start rounded-md border border-[#e5eaf1] bg-white px-3 py-2 sm:max-w-80">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#e8f6ee] text-[#16a34a]">
            <FileIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[#14213c]" title={session.fileName}>{session.fileName}</p>
            <p className="text-[12px] text-[#71809a]">{rows}</p>
          </div>
        </div>
      </header>

      <LivePreview amountSplit={amountSplit} assignments={assignments} labels={labels} rows={previewRows} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby={`${ids}-required`}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-semibold text-[#14213c]" id={`${ids}-required`}>{labels.slotsTitle}</h2>
                <p className="mt-0.5 text-[12px] text-[#71809a]">{labels.slotsDescription}</p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors",
                  evaluation.ready ? "bg-[#e8f6ee] text-[#15803d]" : "bg-[#fff4e5] text-[#b45309]",
                )}
              >
                {evaluation.ready ? <Check aria-hidden className="size-3" strokeWidth={3} /> : <CircleAlert aria-hidden className="size-3" />}
                {formatImportLabel(labels.requiredCount, { count: String(evaluation.satisfiedCount), total: String(evaluation.groups.length) })}
              </span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {REQUIRED_SLOTS.map(({ group, field }) => (
                <SlotCard
                  {...slotProps}
                  amountSplit={field === "amount" ? amountSplit : undefined}
                  field={field}
                  groupFields={IMPORT_REQUIRED_GROUPS.find((candidate) => candidate.id === group)?.fields ?? [field]}
                  groupSatisfied={satisfied.get(group) ?? false}
                  key={field}
                  onAmountSplitChange={field === "amount" ? onAmountSplitChange : undefined}
                  required
                />
              ))}
            </div>
            {errorMessage ? (
              <p className="mt-3 flex items-start gap-2 text-[12px] font-medium text-[#c2412d]" id={errorId} role="alert">
                <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {errorMessage}
              </p>
            ) : null}
          </section>

          <section aria-labelledby={`${ids}-optional`}>
            <h2 className="text-[15px] font-semibold text-[#14213c]" id={`${ids}-optional`}>{labels.optionalTitle}</h2>
            <ul className="mt-3 divide-y divide-[#eef1f5] rounded-md border border-[#e5eaf1] bg-white">
              {OPTIONAL_SLOTS.map((field) => (
                <OptionalSlotRow {...slotProps} field={field} key={field} />
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-3">
          <ColumnInventory
            assignments={assignments}
            busy={busy}
            columns={columns}
            labels={labels}
            locale={locale}
            onColumnIgnoredChange={onColumnIgnoredChange}
            onIgnoreRemaining={onIgnoreRemaining}
          />
          <div className="flex items-start gap-2.5 rounded-md border border-[#dbe6fb] bg-[#f5f8ff] px-4 py-3.5">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-[#2563eb]" />
            <div>
              <p className="text-[12px] font-semibold text-[#1d3a8a]">{labels.safeTitle}</p>
              <p className="mt-0.5 text-[12px] leading-5 text-[#53627b]">{labels.safeDescription}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[#e5eaf1] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#dfe5ee] bg-white px-4 text-[13px] font-medium text-[#43516a] transition-colors hover:border-[#c7d2e1] hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] sm:h-10"
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
            "h-11 w-full rounded-md bg-[#2563eb] px-5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30 sm:h-10 sm:w-auto",
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

function LivePreview({
  labels,
  rows,
  assignments,
  amountSplit,
}: {
  readonly labels: ImportMappingLabels;
  readonly rows: readonly Readonly<Record<string, string>>[];
  readonly assignments: ImportColumnAssignments;
  readonly amountSplit: boolean;
}) {
  const titleId = `${useId()}-preview`;
  const amountFields: readonly ImportField[] = amountSplit ? ["debit", "credit"] : ["amount"];
  const amountMapped = amountFields.some((field) => columnForFields(assignments, [field]));

  return (
    <section
      aria-labelledby={titleId}
      className="relative overflow-hidden rounded-md border border-[#dbe6fb] bg-white p-4 sm:p-5"
    >
      <div className="relative flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 className="text-[13px] font-semibold text-[#14213c]" id={titleId}>{labels.previewTitle}</h2>
        <span className="text-[12px] text-[#71809a]">{labels.previewHint}</span>
      </div>

      <ol className="relative mt-4 divide-y divide-[#eef1f5] overflow-hidden rounded-md border border-[#e5eaf1] bg-white">
        {rows.map((row, index) => {
          const read = (fields: readonly ImportField[]) => {
            for (const field of fields) {
              const header = columnForFields(assignments, [field]);
              if (header && row[header]) return { field, value: row[header] };
            }
            return null;
          };
          const description = read(["description", "merchant"]);
          const merchant = description?.field === "description" ? read(["merchant"]) : null;
          const date = read(["transactionDate", "bookingDate"]);
          const amount = read(amountFields);
          const account = read(["accountReference"]);
          const type = read(["transactionType"]);
          const currency = read(["currency"]);
          return (
            <li className="flex items-center gap-3.5 px-4 py-3" data-preview-row={index + 1} key={index}>
              <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[#f3efff] text-[#7c3aed]">
                <Store className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-[#14213c]">
                  {description ? <PreviewValue value={description.value} /> : <Placeholder label={formatImportLabel(labels.previewMissing, { field: labels.requiredGroups.description })} />}
                </p>
                <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-[#71809a]">
                  {date ? <PreviewValue value={date.value} /> : <Placeholder label={formatImportLabel(labels.previewMissing, { field: labels.requiredGroups.date })} />}
                  {account ? <><span aria-hidden>·</span><PreviewValue value={account.value} /></> : null}
                  {merchant ? <><span aria-hidden>·</span><PreviewValue value={merchant.value} /></> : null}
                </p>
              </div>
              {type ? (
                <span className="hidden shrink-0 rounded-md bg-[#fff1e6] px-2.5 py-0.5 text-[11px] font-medium text-[#c2560a] sm:inline">
                  <PreviewValue value={type.value} />
                </span>
              ) : null}
              <div className="flex min-w-24 shrink-0 flex-col items-end gap-1 text-right">
                <p className="text-[14px] font-semibold text-[#14213c] tabular-nums">
                  {amount ? (
                    <>
                      {amountSplit ? <span className="mr-1.5 text-[11px] font-medium text-[#8a97ab]">{labels.fields[amount.field]}</span> : null}
                      <PreviewValue value={amount.value} />
                      {currency ? <span className="ml-1 text-[11px] font-medium text-[#71809a]">{currency.value}</span> : null}
                    </>
                  ) : amountMapped ? (
                    <span className="text-[#9aa6b8]">—</span>
                  ) : (
                    <Placeholder label={formatImportLabel(labels.previewMissing, { field: labels.requiredGroups.amount })} />
                  )}
                </p>
                {type ? (
                  <span className="rounded-md bg-[#fff1e6] px-2 py-0.5 text-[11px] font-medium text-[#c2560a] sm:hidden">
                    <PreviewValue value={type.value} />
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="relative mt-3 flex items-start gap-1.5 text-[11px] leading-4 text-[#8a97ab]">
        <Info aria-hidden className="mt-px size-3 shrink-0" />
        {labels.previewRaw}
      </p>
    </section>
  );
}

function PreviewValue({ value }: { readonly value: string }) {
  return (
    <span className="animate-in fade-in-0 duration-300 motion-reduce:animate-none" key={value}>
      {value}
    </span>
  );
}

function Placeholder({ label }: { readonly label: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-dashed border-[#f2c98a] bg-[#fffaf0] px-1.5 py-px text-[11px] font-medium text-[#b45309]">
      {label}
    </span>
  );
}

function SlotCard({
  field,
  groupFields,
  groupSatisfied,
  required = false,
  amountSplit,
  labels,
  columns,
  assignments,
  busy,
  onFieldAssign,
  onAmountSplitChange,
}: {
  readonly field: ImportField;
  readonly groupFields: readonly ImportField[];
  readonly groupSatisfied: boolean;
  readonly required?: boolean;
  readonly amountSplit?: boolean;
  readonly labels: ImportMappingLabels;
  readonly columns: readonly ImportDetectedColumn[];
  readonly assignments: ImportColumnAssignments;
  readonly busy: boolean;
  readonly onFieldAssign?: (field: ImportField, header: string | null) => void;
  readonly onAmountSplitChange?: (split: boolean) => void;
}) {
  const split = field === "amount" && amountSplit;
  const ownFields: readonly ImportField[] = split ? ["debit", "credit"] : [field];
  const ownColumns = ownFields.map((own) => columnForFields(assignments, [own]));
  const hasOwn = ownColumns.some(Boolean);
  const detected = ownFields.every((own, index) => {
    const header = ownColumns[index];
    return !header || columns.find((column) => column.header === header)?.detectedField === own;
  }) && hasOwn;
  const coveringField = !hasOwn && groupSatisfied
    ? groupFields.find((candidate) => !ownFields.includes(candidate) && columnForFields(assignments, [candidate]))
    : undefined;
  const state: "detected" | "manual" | "covered" | "missing" | "empty" = hasOwn
    ? (detected ? "detected" : "manual")
    : coveringField ? "covered" : required ? "missing" : "empty";
  const { icon: Icon, tone } = FIELD_VISUALS[field];

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border bg-white p-4 transition-colors",
        state === "missing" ? "border-dashed border-[#f2c98a] bg-[#fffcf6]" : "border-[#e5eaf1]",
        state === "detected" && required && "border-[#cfe9da]",
      )}
      data-field={field}
      data-state={state}
    >
      <div className="flex items-start justify-between gap-2">
        <span aria-hidden className={cn("flex size-10 items-center justify-center rounded-md", tone)}>
          <Icon className="size-4.5" />
        </span>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.02em] uppercase",
            required ? "bg-[#eef3ff] text-[#2563eb]" : "bg-[#f1f4f8] text-[#71809a]",
          )}
        >
          {required ? labels.requiredBadge : labels.optionalBadge}
        </span>
      </div>
      <p className="mt-3 text-[14px] font-semibold text-[#14213c]">{labels.fields[field]}</p>
      <p className="mt-0.5 text-[12px] leading-4 text-[#71809a]">{labels.fieldHints[field]}</p>

      <div className="mt-3 space-y-2">
        {ownFields.map((own, index) => (
          <ColumnSelect
            assignments={assignments}
            busy={busy}
            columns={columns}
            field={own}
            key={own}
            label={split ? labels.fields[own] : null}
            labels={labels}
            onFieldAssign={onFieldAssign}
            value={ownColumns[index] ?? null}
          />
        ))}
      </div>

      <div className="mt-auto pt-2.5">
        <SlotState covering={coveringField} labels={labels} state={state} />
        {onAmountSplitChange ? (
          <button
            aria-pressed={split}
            className="mt-2 inline-flex items-center gap-1.5 text-left text-[12px] font-medium text-[#2563eb] hover:text-[#1e55d1] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            disabled={busy}
            onClick={() => onAmountSplitChange(!split)}
            type="button"
          >
            <ArrowLeftRight aria-hidden className="size-3.5 shrink-0" />
            {split ? labels.amountSingle : labels.amountSplit}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function OptionalSlotRow({
  field,
  labels,
  columns,
  assignments,
  busy,
  onFieldAssign,
}: {
  readonly field: ImportField;
  readonly labels: ImportMappingLabels;
  readonly columns: readonly ImportDetectedColumn[];
  readonly assignments: ImportColumnAssignments;
  readonly busy: boolean;
  readonly onFieldAssign?: (field: ImportField, header: string | null) => void;
}) {
  const header = columnForFields(assignments, [field]);
  const detected = Boolean(header) && columns.find((column) => column.header === header)?.detectedField === field;
  const { icon: Icon, tone } = FIELD_VISUALS[field];
  return (
    <li
      className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:items-center"
      data-field={field}
      data-state={header ? (detected ? "detected" : "manual") : "empty"}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", tone)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#14213c]">
            {labels.fields[field]}
            {detected ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#e8f6ee] px-1.5 py-px text-[10px] font-medium text-[#15803d]">
                <Sparkles aria-hidden className="size-2.5" />
                {labels.slotDetected}
              </span>
            ) : null}
          </p>
          <p className="truncate text-[12px] text-[#71809a]">{labels.fieldHints[field]}</p>
        </div>
      </div>
      <ColumnSelect
        assignments={assignments}
        busy={busy}
        columns={columns}
        field={field}
        label={null}
        labels={labels}
        onFieldAssign={onFieldAssign}
        value={header}
      />
    </li>
  );
}

function ColumnSelect({
  field,
  value,
  label,
  labels,
  columns,
  assignments,
  busy,
  onFieldAssign,
}: {
  readonly field: ImportField;
  readonly value: string | null;
  readonly label: string | null;
  readonly labels: ImportMappingLabels;
  readonly columns: readonly ImportDetectedColumn[];
  readonly assignments: ImportColumnAssignments;
  readonly busy: boolean;
  readonly onFieldAssign?: (field: ImportField, header: string | null) => void;
}) {
  return (
    <div>
      {label ? <span className="mb-1 block text-[11px] font-medium text-[#71809a]">{label}</span> : null}
      <div className="relative">
        <select
          aria-label={formatImportLabel(labels.slotColumnLabel, { field: labels.fields[field] })}
          className={cn(
            "h-11 w-full appearance-none truncate rounded-md border bg-white pr-8 pl-3 text-[13px] transition-colors hover:border-[#c7d2e1] focus-visible:border-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb]/30 disabled:opacity-60 md:h-10",
            value ? "border-[#dfe5ee] font-medium text-[#14213c]" : "border-[#dfe5ee] text-[#8a97ab]",
          )}
          disabled={busy}
          onChange={(event) => onFieldAssign?.(field, event.currentTarget.value || null)}
          value={value ?? ""}
        >
          <option value="">{labels.slotNone}</option>
          {columns.map((column) => {
            const target = assignments[column.header];
            const usedBy = target && target !== IMPORT_COLUMN_IGNORED && target !== field ? labels.fields[target] : null;
            const sample = column.samples[0] ?? labels.optionEmptySample;
            return (
              <option key={column.header} value={column.header}>
                {`${column.header} · ${sample}${usedBy ? `  ${formatImportLabel(labels.optionUsedBy, { field: usedBy })}` : ""}`}
              </option>
            );
          })}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-[#71809a]" />
      </div>
    </div>
  );
}

function SlotState({
  state,
  covering,
  labels,
}: {
  readonly state: "detected" | "manual" | "covered" | "missing" | "empty";
  readonly covering: ImportField | undefined;
  readonly labels: ImportMappingLabels;
}) {
  if (state === "detected") {
    return (
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#15803d]">
        <Sparkles aria-hidden className="size-3.5" />
        {labels.slotDetected}
      </p>
    );
  }
  if (state === "manual") {
    return (
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#2563eb]">
        <Check aria-hidden className="size-3.5" strokeWidth={3} />
        {labels.slotManual}
      </p>
    );
  }
  if (state === "covered" && covering) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#53627b]">
        <Check aria-hidden className="size-3.5" strokeWidth={3} />
        {formatImportLabel(labels.slotCovered, { field: labels.fields[covering] })}
      </p>
    );
  }
  if (state === "missing") {
    return (
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#b45309]">
        <CircleAlert aria-hidden className="size-3.5" />
        {labels.slotMissing}
      </p>
    );
  }
  return null;
}

function ColumnInventory({
  labels,
  locale,
  columns,
  assignments,
  busy,
  onColumnIgnoredChange,
  onIgnoreRemaining,
}: {
  readonly labels: ImportMappingLabels;
  readonly locale: string;
  readonly columns: readonly ImportDetectedColumn[];
  readonly assignments: ImportColumnAssignments;
  readonly busy: boolean;
  readonly onColumnIgnoredChange?: (header: string, ignored: boolean) => void;
  readonly onIgnoreRemaining?: () => void;
}) {
  const titleId = `${useId()}-columns`;
  const number = new Intl.NumberFormat(locale);
  const used = columns.filter((column) => {
    const target = assignments[column.header];
    return target && target !== IMPORT_COLUMN_IGNORED;
  }).length;
  const hasUnused = columns.some((column) => !assignments[column.header]);

  return (
    <aside aria-labelledby={titleId} className="rounded-md border border-[#e5eaf1] bg-white">
      <div className="px-5 pt-5">
        <h2 className="text-[14px] font-semibold text-[#14213c]" id={titleId}>{labels.columnsTitle}</h2>
        <p className="mt-0.5 text-[12px] text-[#71809a]">
          {formatImportLabel(labels.columnsSummary, { used: number.format(used), unused: number.format(columns.length - used) })}
        </p>
      </div>
      <ul className="mt-3 px-2 pb-2">
        {columns.map((column, index) => {
          const target = assignments[column.header] ?? null;
          const ignored = target === IMPORT_COLUMN_IGNORED;
          const field = target && !ignored ? target : null;
          return (
            <li
              className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-[#f8fafc]"
              data-column-state={field ? "used" : ignored ? "ignored" : "unused"}
              key={column.header}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold",
                  field ? FIELD_VISUALS[field].tone : "bg-[#f1f4f8] text-[#8a97ab]",
                )}
              >
                {spreadsheetColumnLetter(index)}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[13px] font-medium", ignored ? "text-[#9aa6b8] line-through decoration-[#c3ccd9]" : "text-[#14213c]")} title={column.header}>
                  {column.header}
                </p>
                <p className={cn("truncate text-[11px]", field ? cn("font-medium", FIELD_VISUALS[field].text) : "text-[#9aa6b8]")}>
                  {field
                    ? formatImportLabel(labels.columnUsedAs, { field: labels.fields[field] })
                    : ignored ? labels.columnIgnored : labels.columnNotUsed}
                </p>
              </div>
              {!field ? (
                <button
                  aria-label={formatImportLabel(ignored ? labels.restoreColumn : labels.ignoreColumn, { column: column.header })}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#8a97ab] transition-colors hover:bg-white hover:text-[#14213c] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                  disabled={busy}
                  onClick={() => onColumnIgnoredChange?.(column.header, !ignored)}
                  type="button"
                >
                  {ignored ? <RotateCcw aria-hidden className="size-3.5" /> : <EyeOff aria-hidden className="size-3.5" />}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {hasUnused ? (
        <div className="border-t border-[#eef1f5] px-3 py-2">
          <Button
            className="h-10 w-full justify-center rounded-md text-[12px] font-medium text-[#53627b] hover:text-[#14213c]"
            disabled={busy}
            onClick={onIgnoreRemaining}
            type="button"
            variant="ghost"
          >
            <EyeOff aria-hidden className="size-3.5" />
            {labels.ignoreRemaining}
          </Button>
        </div>
      ) : null}
    </aside>
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
      <section className="mt-6 rounded-md border border-[#e5eaf1] bg-white px-5 py-12 text-center" role="alert">
        <h2 className="text-[15px] font-semibold text-[#18243b]">{labels.staleTitle}</h2>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-5 text-[#71809a]">
          {message ? labels.errors[message] : labels.staleDescription}
        </p>
        <Link
          className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-[#2563eb] px-5 text-[13px] font-medium text-white hover:bg-[#1e55d1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] sm:h-10"
          href={transactionImportHref(workspaceSlug)}
        >
          {labels.staleAction}
        </Link>
      </section>
    </main>
  );
}
