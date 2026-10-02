"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
} from "react";
import Link from "next/link";
import { cn } from "cn";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Copy,
  FileSpreadsheet,
  FileText,
  Inbox,
  Info,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import type { ImportReviewView as ImportReviewData } from "../../import-service";
import {
  approveImport,
  canStartImport,
  executeImport,
  fetchImportProgress,
  IMPORT_EXECUTION_STEPS,
  IMPORT_PROGRESS_POLL_MS,
  importExecutionSteps,
  importMappingHref,
  importProgressPercent,
  importResultHrefs,
  isImportProgressStalled,
  isTerminalImportStatus,
  updateImportReview,
  type ImportExecutionSnapshot,
  type ImportStepStatus,
} from "../import-execution-flow";
import type {
  ImportExecutionErrorCode,
  ImportExecutionLabels,
} from "../import-execution-labels";
import { formatImportLabel } from "../import-upload-labels";
import { transactionImportHref } from "../import-upload-flow";

type IconComponent = ComponentType<{
  className?: string;
  strokeWidth?: number;
}>;
type ImportScreenMode = "review" | "executing" | "result";

const linkButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] sm:h-10";
const primaryLink = cn(
  linkButton,
  "bg-[#2563eb] text-white hover:bg-[#1e55d1]",
);
const secondaryLink = cn(
  linkButton,
  "border border-[#dfe5ee] bg-white text-[#43516a] hover:border-[#c7d2e1] hover:bg-[#f8fafc]",
);

export function ImportReviewView({
  labels,
  locale,
  workspaceId,
  workspaceSlug,
  initialReview,
}: {
  readonly labels: ImportExecutionLabels;
  readonly locale: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly initialReview: ImportReviewData;
}) {
  const [review, setReview] = useState(initialReview);
  const [mode, setMode] = useState<ImportScreenMode>(() =>
    initialReview.state === "EXECUTING"
      ? "executing"
      : initialReview.state === "RESULT"
        ? "result"
        : "review",
  );
  const [snapshot, setSnapshot] = useState<ImportExecutionSnapshot>({
    status: initialReview.session.status,
    progress: initialReview.progress,
    result: initialReview.result,
  });
  const [errorCode, setErrorCode] = useState<ImportExecutionErrorCode | null>(
    null,
  );
  const [updating, setUpdating] = useState(false);
  const [starting, setStarting] = useState(false);
  const inFlightRef = useRef(false);
  const reviewAbortRef = useRef<AbortController | null>(null);
  const request = { workspaceId, importSessionId: review.session.id };

  const settle = useCallback((next: ImportExecutionSnapshot) => {
    setSnapshot(next);
    if (isTerminalImportStatus(next.status)) setMode("result");
  }, []);

  useEffect(() => () => reviewAbortRef.current?.abort(), []);

  useEffect(() => {
    if (mode !== "executing") return;
    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      try {
        const polled = await fetchImportProgress({
          workspaceId,
          importSessionId: review.session.id,
          signal: controller.signal,
        });
        if (controller.signal.aborted || !polled.ok) return;
        settle(polled.value);
        if (inFlightRef.current) return;
        if (isImportProgressStalled(polled.value))
          setErrorCode("IMPORT_STALLED");
        else if (
          polled.value.status !== "IMPORTING" &&
          !isTerminalImportStatus(polled.value.status)
        )
          setErrorCode("NETWORK");
      } catch {
        return;
      }
    }, IMPORT_PROGRESS_POLL_MS);
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", guard);
    };
  }, [mode, review.session.id, settle, workspaceId]);

  async function start() {
    if (inFlightRef.current || updating) return;
    inFlightRef.current = true;
    const origin: ImportScreenMode =
      snapshot.status === "PARTIALLY_COMPLETED" ? "result" : "review";
    setStarting(true);
    setErrorCode(null);
    setMode("executing");
    try {
      if (snapshot.status === "READY_FOR_PREVIEW") {
        const approved = await approveImport(request);
        if (!approved.ok) {
          setErrorCode(approved.code);
          setMode(origin);
          return;
        }
        setSnapshot(approved.value);
      }
      const executed = await executeImport(request);
      if (executed.ok) {
        settle(executed.value);
        return;
      }
      if (executed.code === "NETWORK") return;
      setErrorCode(executed.code);
      setMode(origin);
    } finally {
      inFlightRef.current = false;
      setStarting(false);
    }
  }

  async function changeDestination(
    accountId: string,
    transferAccountId: string | null,
  ) {
    reviewAbortRef.current?.abort();
    const controller = new AbortController();
    reviewAbortRef.current = controller;
    setUpdating(true);
    setErrorCode(null);
    try {
      const updated = await updateImportReview({
        ...request,
        accountId,
        transferAccountId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (updated.ok) {
        setReview(updated.value);
        setSnapshot((current) => ({
          ...current,
          status: updated.value.session.status,
        }));
      } else {
        setErrorCode(updated.code);
      }
    } catch {
      return;
    } finally {
      if (reviewAbortRef.current === controller) {
        reviewAbortRef.current = null;
        setUpdating(false);
      }
    }
  }

  if (
    review.state === "STALE" ||
    review.state === "MAPPING_REQUIRED" ||
    errorCode === "IMPORT_SESSION_STALE"
  ) {
    return <ImportReviewStale labels={labels} workspaceSlug={workspaceSlug} />;
  }

  if (mode === "executing") {
    return (
      <ImportExecutionScreen
        errorCode={errorCode}
        fileName={review.session.fileName}
        labels={labels}
        locale={locale}
        onRetry={start}
        retrying={starting}
        snapshot={snapshot}
      />
    );
  }

  if (mode === "result" && snapshot.result) {
    return (
      <ImportResultScreen
        errorCode={errorCode}
        labels={labels}
        locale={locale}
        onRetry={start}
        partial={snapshot.status === "PARTIALLY_COMPLETED"}
        result={snapshot.result}
        retrying={starting}
        workspaceSlug={workspaceSlug}
      />
    );
  }

  return (
    <ImportReviewScreen
      busy={starting}
      errorCode={errorCode}
      labels={labels}
      locale={locale}
      onAccountChange={(accountId) =>
        changeDestination(
          accountId,
          review.transferAccountId === accountId
            ? null
            : review.transferAccountId,
        )
      }
      onStart={start}
      onTransferAccountChange={(transferAccountId) =>
        review.accountId &&
        changeDestination(review.accountId, transferAccountId)
      }
      review={review}
      updating={updating}
      workspaceSlug={workspaceSlug}
    />
  );
}

export function ImportReviewScreen({
  labels,
  locale,
  review,
  workspaceSlug,
  errorCode,
  busy,
  updating,
  onAccountChange,
  onTransferAccountChange,
  onStart,
}: {
  readonly labels: ImportExecutionLabels;
  readonly locale: string;
  readonly review: ImportReviewData;
  readonly workspaceSlug: string;
  readonly errorCode: ImportExecutionErrorCode | null;
  readonly busy: boolean;
  readonly updating: boolean;
  readonly onAccountChange?: (accountId: string) => void;
  readonly onTransferAccountChange?: (accountId: string | null) => void;
  readonly onStart?: () => void;
}) {
  const ids = useId();
  const number = new Intl.NumberFormat(locale);
  const plural = new Intl.PluralRules(locale);
  const summary = review.summary;
  const ready = canStartImport(review) && !updating;
  const disabled = !ready || busy;
  const errorId = `${ids}-error`;
  const toImport = summary?.toImportRowCount ?? 0;
  const FileIcon =
    review.session.fileType === "CSV" ? FileText : FileSpreadsheet;
  const rows = summary
    ? formatImportLabel(
        plural.select(summary.parsedRowCount) === "one"
          ? labels.rowsOne
          : labels.rowsOther,
        {
          count: number.format(summary.parsedRowCount),
        },
      )
    : null;
  const stats: readonly {
    id: string;
    label: string;
    hint: string;
    value: number;
    icon: IconComponent;
    tone: string;
    emphasis?: boolean;
  }[] = summary
    ? [
        {
          id: "import",
          label: labels.toImport,
          hint: labels.toImportHint,
          value: summary.toImportRowCount,
          icon: ArrowDownToLine,
          tone: "bg-[#eef3ff] text-[#2563eb]",
          emphasis: true,
        },
        {
          id: "inbox",
          label: labels.toInbox,
          hint: labels.toInboxHint,
          value: summary.inboxRowCount,
          icon: Inbox,
          tone: "bg-[#f3efff] text-[#7c3aed]",
        },
        {
          id: "duplicates",
          label: labels.duplicates,
          hint: labels.duplicatesHint,
          value: summary.exactDuplicateRowCount,
          icon: Copy,
          tone: "bg-[#f1f4f8] text-[#53627b]",
        },
        {
          id: "blocking",
          label: labels.blocking,
          hint: labels.blockingHint,
          value: summary.blockingErrorRowCount,
          icon: summary.blockingErrorRowCount ? CircleAlert : CircleCheck,
          tone: summary.blockingErrorRowCount
            ? "bg-[#fdecec] text-[#dc2626]"
            : "bg-[#e8f6ee] text-[#16a34a]",
        },
      ]
    : [];

  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">
            {labels.title}
          </h1>
          <p className="mt-1 text-[13px] text-[#71809a]">
            {labels.description}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 self-start rounded-md border border-[#e5eaf1] bg-white px-3 py-2 sm:max-w-80">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#e8f6ee] text-[#16a34a]">
            <FileIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p
              className="truncate text-[13px] font-semibold text-[#14213c]"
              title={review.session.fileName}>
              {review.session.fileName}
            </p>
            {rows ? <p className="text-[12px] text-[#71809a]">{rows}</p> : null}
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
        <div className="min-w-0 space-y-5">
          <section aria-busy={updating} aria-labelledby={`${ids}-summary`}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2
                className="text-[15px] font-semibold text-[#14213c]"
                id={`${ids}-summary`}>
                {labels.summaryTitle}
              </h2>
              {summary?.dateRange ? (
                <p className="text-[12px] text-[#71809a] tabular-nums">
                  {formatImportLabel(labels.dateRange, {
                    start: formatReviewDate(summary.dateRange.start, locale),
                    end: formatReviewDate(summary.dateRange.end, locale),
                  })}
                </p>
              ) : null}
            </div>
            <ul
              className={cn(
                "mt-3 grid grid-cols-2 gap-3 transition-opacity xl:grid-cols-4",
                updating && "opacity-60",
              )}>
              {stats.map((stat) => (
                <li
                  className={cn(
                    "flex min-w-0 flex-col rounded-md border bg-white p-4",
                    stat.emphasis ? "border-[#cfdcf7]" : "border-[#e5eaf1]",
                    stat.id === "blocking" &&
                      stat.value > 0 &&
                      "border-[#f5c2c2]",
                  )}
                  data-stat={stat.id}
                  key={stat.id}>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md",
                      stat.tone,
                    )}>
                    <stat.icon className="size-4" />
                  </span>
                  <p className="mt-3 text-[24px] font-semibold tracking-[-0.03em] text-[#101a35] tabular-nums">
                    {number.format(stat.value)}
                  </p>
                  <p className="text-[13px] font-medium text-[#14213c]">
                    {stat.label}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-4 text-[#71809a]">
                    {stat.hint}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {summary && summary.blockingErrorRowCount > 0 ? (
            <section
              aria-labelledby={`${ids}-blocking`}
              className="rounded-md border border-[#f5c2c2] bg-[#fffafa] p-4 sm:p-5">
              <div className="flex items-start gap-2.5">
                <TriangleAlert
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-[#dc2626]"
                />
                <div className="min-w-0">
                  <h2
                    className="text-[14px] font-semibold text-[#14213c]"
                    id={`${ids}-blocking`}>
                    {labels.blockingTitle}
                  </h2>
                  <p className="mt-0.5 text-[12px] leading-5 text-[#71809a]">
                    {labels.blockingDescription}
                  </p>
                </div>
              </div>
              <ul className="mt-3 divide-y divide-[#f6e1e1] rounded-md border border-[#f6e1e1] bg-white">
                {review.blockingIssues.map((issue) => (
                  <li
                    className="flex flex-col gap-0.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                    key={issue.sourceRowNumber}>
                    <span className="shrink-0 text-[12px] font-semibold text-[#14213c] tabular-nums sm:w-20">
                      {formatImportLabel(labels.blockingRow, {
                        row: number.format(issue.sourceRowNumber),
                      })}
                    </span>
                    <span className="text-[12px] text-[#b42318]">
                      {labels.issues[issue.code]}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {summary.blockingErrorRowCount >
                review.blockingIssues.length ? (
                  <span className="text-[12px] text-[#71809a]">
                    {formatImportLabel(labels.blockingMore, {
                      count: number.format(
                        summary.blockingErrorRowCount -
                          review.blockingIssues.length,
                      ),
                    })}
                  </span>
                ) : (
                  <span />
                )}
                <Link
                  className={secondaryLink}
                  href={importMappingHref(workspaceSlug, review.session.id)}>
                  {labels.fixMapping}
                </Link>
              </div>
            </section>
          ) : null}

          {summary && toImport === 0 && summary.blockingErrorRowCount === 0 ? (
            <section
              className="rounded-md border border-[#e5eaf1] bg-white px-5 py-8 text-center"
              role="status">
              <h2 className="text-[15px] font-semibold text-[#14213c]">
                {labels.nothingTitle}
              </h2>
              <p className="mx-auto mt-1 max-w-md text-[13px] leading-5 text-[#71809a]">
                {labels.nothingDescription}
              </p>
            </section>
          ) : null}
        </div>

        <div className="space-y-3">
          <section
            aria-labelledby={`${ids}-destination`}
            className="rounded-md border border-[#e5eaf1] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2
                className="flex items-center gap-2 text-[14px] font-semibold text-[#14213c]"
                id={`${ids}-destination`}>
                <Wallet aria-hidden className="size-4 text-[#0e8fb5]" />
                {labels.accountTitle}
              </h2>
              {updating ? (
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#2563eb]"
                  role="status">
                  <LoaderCircle
                    aria-hidden
                    className="size-3.5 animate-spin motion-reduce:animate-none"
                  />
                  {labels.updatingReview}
                </span>
              ) : null}
            </div>
            <AccountSelect
              accounts={review.accounts}
              disabled={busy || updating}
              hint={labels.accountHint}
              id={`${ids}-account`}
              label={labels.accountLabel}
              onChange={(value) => value && onAccountChange?.(value)}
              value={review.accountId}
            />
            {review.transferAccountRequired ? (
              <AccountSelect
                accounts={review.accounts.filter(
                  (account) => account.id !== review.accountId,
                )}
                disabled={busy || updating}
                hint={labels.transferAccountHint}
                id={`${ids}-transfer`}
                label={labels.transferAccountLabel}
                onChange={(value) => onTransferAccountChange?.(value)}
                placeholder={labels.transferAccountNone}
                value={review.transferAccountId}
              />
            ) : null}
          </section>
          <div className="flex items-start gap-2.5 rounded-md border border-[#dbe6fb] bg-[#f5f8ff] px-4 py-3.5">
            <ShieldCheck
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-[#2563eb]"
            />
            <div>
              <p className="text-[12px] font-semibold text-[#1d3a8a]">
                {labels.safeTitle}
              </p>
              <p className="mt-0.5 text-[12px] leading-5 text-[#53627b]">
                {labels.safeDescription}
              </p>
            </div>
          </div>
        </div>
      </div>

      {errorCode ? (
        <p
          className="mt-5 flex items-start gap-2 text-[12px] font-medium text-[#c2412d]"
          id={errorId}
          role="alert">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {labels.errors[errorCode]}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[#e5eaf1] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className={secondaryLink}
          href={importMappingHref(workspaceSlug, review.session.id)}>
          <ArrowLeft aria-hidden className="size-4" />
          {labels.back}
        </Link>
        <Button
          aria-busy={busy}
          aria-describedby={errorCode ? errorId : undefined}
          aria-disabled={disabled}
          className={cn(
            "h-11 w-full rounded-md bg-[#2563eb] px-5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30 sm:h-10 sm:w-auto",
            disabled && "opacity-60 hover:bg-[#2563eb]",
          )}
          onClick={disabled ? undefined : onStart}
          type="button">
          {formatImportLabel(
            plural.select(toImport) === "one"
              ? labels.importActionOne
              : labels.importActionOther,
            {
              count: number.format(toImport),
            },
          )}
          <ArrowRight aria-hidden className="size-4" />
        </Button>
      </div>
    </main>
  );
}

function AccountSelect({
  id,
  label,
  hint,
  accounts,
  value,
  disabled,
  placeholder,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly accounts: ImportReviewData["accounts"];
  readonly value: string | null;
  readonly disabled: boolean;
  readonly placeholder?: string;
  readonly onChange: (value: string | null) => void;
}) {
  return (
    <div className="mt-4">
      <label
        className="block text-[12px] font-medium text-[#43516a]"
        htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-1.5">
        <select
          aria-describedby={`${id}-hint`}
          className="h-11 w-full appearance-none truncate rounded-md border border-[#dfe5ee] bg-white pr-8 pl-3 text-[13px] font-medium text-[#14213c] transition-colors hover:border-[#c7d2e1] focus-visible:border-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb]/30 disabled:opacity-60 md:h-10"
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.currentTarget.value || null)}
          value={value ?? ""}>
          {placeholder ? <option value="">{placeholder}</option> : null}
          {accounts.map((account) => (
            <option
              key={account.id}
              value={
                account.id
              }>{`${account.name} · ${account.currency}`}</option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-[#71809a]"
        />
      </div>
      <p
        className="mt-1.5 text-[11px] leading-4 text-[#8a97ab]"
        id={`${id}-hint`}>
        {hint}
      </p>
    </div>
  );
}

export function ImportExecutionScreen({
  labels,
  locale,
  fileName,
  snapshot,
  errorCode,
  retrying,
  onRetry,
}: {
  readonly labels: ImportExecutionLabels;
  readonly locale: string;
  readonly fileName: string;
  readonly snapshot: ImportExecutionSnapshot;
  readonly errorCode: ImportExecutionErrorCode | null;
  readonly retrying: boolean;
  readonly onRetry?: () => void;
}) {
  const titleId = `${useId()}-progress`;
  const number = new Intl.NumberFormat(locale);
  const steps = importExecutionSteps(snapshot);
  const percent = importProgressPercent(snapshot.progress);
  const progress = snapshot.progress;
  const stalled = errorCode !== null;
  const statusLabel: Record<ImportStepStatus, string> = {
    done: labels.stepDone,
    active: labels.stepActive,
    pending: labels.stepPending,
  };
  const rowsText =
    progress && progress.totalRowCount > 0
      ? formatImportLabel(labels.progressRows, {
          processed: number.format(progress.processedRowCount),
          total: number.format(progress.totalRowCount),
        })
      : labels.progressWaiting;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <section
        aria-busy={!stalled}
        aria-labelledby={titleId}
        className="overflow-hidden rounded-md border border-[#dbe6fb] bg-white animate-in fade-in-0 duration-300 motion-reduce:animate-none"
        data-active-step={
          IMPORT_EXECUTION_STEPS.find((step) => steps[step] === "active") ??
          "done"
        }>
        <div
          aria-label={labels.progressLabel}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent ?? undefined}
          aria-valuetext={rowsText}
          className="relative h-1 overflow-hidden bg-[#eef3ff]"
          role="progressbar">
          {percent === null ? (
            <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[#2563eb] animate-import-indeterminate motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-50" />
          ) : (
            <span
              className="block h-full bg-[#2563eb] transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          )}
        </div>

        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-md border border-[#dbe6fb] bg-[#f6f9ff] text-[#2563eb]">
              <ArrowDownToLine className="size-5" />
            </span>
            <div className="min-w-0">
              <h1
                className="text-[17px] font-semibold text-[#14213c]"
                id={titleId}>
                {labels.progressTitle}
              </h1>
              <p
                className="mt-0.5 truncate text-[12px] text-[#71809a]"
                title={fileName}>
                {fileName}
              </p>
            </div>
          </div>
          <p className="mt-4 text-[13px] leading-5 text-[#53627b]">
            {labels.progressDescription}
          </p>

          <ol className="mt-6">
            {IMPORT_EXECUTION_STEPS.map((step, index) => {
              const status = steps[step];
              return (
                <li
                  className="relative flex gap-3 pb-5 last:pb-0"
                  data-status={status}
                  data-step={step}
                  key={step}>
                  {index < IMPORT_EXECUTION_STEPS.length - 1 ? (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-7 bottom-1 left-2.75 w-px transition-colors duration-300",
                        status === "done" ? "bg-[#9fd8b5]" : "bg-[#e5eaf1]",
                      )}
                    />
                  ) : null}
                  <StepIcon
                    status={stalled && status === "active" ? "pending" : status}
                  />
                  <div className="min-w-0 pt-0.5">
                    <p
                      className={cn(
                        "text-[13px] font-medium",
                        status === "pending"
                          ? "text-[#9aa6b8]"
                          : "text-[#14213c]",
                      )}>
                      {labels.steps[step]}
                      <span className="sr-only"> ({statusLabel[status]})</span>
                    </p>
                    {step === "import" && status !== "pending" ? (
                      <p className="mt-0.5 text-[12px] text-[#71809a] tabular-nums">
                        {rowsText}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          {stalled ? (
            <div
              className="mt-5 flex flex-col gap-3 rounded-md border border-[#f2c98a] bg-[#fffaf0] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
              role="alert">
              <p className="flex items-start gap-2 text-[12px] leading-5 text-[#8a4b08]">
                <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {labels.errors[errorCode]}
              </p>
              <Button
                className="h-11 shrink-0 rounded-md bg-[#2563eb] px-4 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] sm:h-9"
                disabled={retrying}
                onClick={onRetry}
                type="button">
                <RotateCcw aria-hidden className="size-3.5" />
                {labels.retry}
              </Button>
            </div>
          ) : (
            <p className="mt-5 flex items-start gap-2 rounded-md bg-[#f6f9ff] px-3 py-2.5 text-[12px] leading-5 text-[#53627b]">
              <Info
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-[#2563eb]"
              />
              {labels.progressKeepOpen}
            </p>
          )}
        </div>
      </section>
      <p aria-live="polite" className="sr-only">
        {rowsText}
      </p>
    </main>
  );
}

function StepIcon({ status }: { readonly status: ImportStepStatus }) {
  if (status === "done") {
    return (
      <span
        aria-hidden
        className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-[#16a34a] text-white animate-in zoom-in-75 duration-200 motion-reduce:animate-none">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span
        aria-hidden
        className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-[#eef3ff] text-[#2563eb] ring-1 ring-[#c9d8f5]">
        <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="relative flex size-6 shrink-0 items-center justify-center rounded-full border border-[#dfe5ee] bg-white">
      <span className="size-1.5 rounded-full bg-[#c3ccd9]" />
    </span>
  );
}

export function ImportResultScreen({
  labels,
  locale,
  workspaceSlug,
  result,
  partial,
  errorCode,
  retrying,
  onRetry,
}: {
  readonly labels: ImportExecutionLabels;
  readonly locale: string;
  readonly workspaceSlug: string;
  readonly result: NonNullable<ImportExecutionSnapshot["result"]>;
  readonly partial: boolean;
  readonly errorCode: ImportExecutionErrorCode | null;
  readonly retrying: boolean;
  readonly onRetry?: () => void;
}) {
  const titleId = `${useId()}-result`;
  const number = new Intl.NumberFormat(locale);
  const hrefs = importResultHrefs(workspaceSlug);
  const inboxCount = result.inboxRowCount ?? 0;
  const failedRows = result.failedRowNumbers ?? [];
  const stats: readonly {
    id: string;
    label: string;
    value: number;
    icon: IconComponent;
    tone: string;
  }[] = [
    {
      id: "imported",
      label: labels.resultImported,
      value: result.importedRowCount,
      icon: Check,
      tone: "bg-[#e8f6ee] text-[#16a34a]",
    },
    {
      id: "inbox",
      label: labels.resultInbox,
      value: inboxCount,
      icon: Inbox,
      tone: "bg-[#f3efff] text-[#7c3aed]",
    },
    {
      id: "duplicates",
      label: labels.resultDuplicates,
      value: result.skippedExactDuplicateRowCount,
      icon: Copy,
      tone: "bg-[#f1f4f8] text-[#53627b]",
    },
    {
      id: "failed",
      label: labels.resultFailed,
      value: result.failedRowCount,
      icon: CircleAlert,
      tone: result.failedRowCount
        ? "bg-[#fdecec] text-[#dc2626]"
        : "bg-[#f1f4f8] text-[#8a97ab]",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <section
        aria-labelledby={titleId}
        className="rounded-md border border-[#e5eaf1] bg-white px-5 py-6 animate-in fade-in-0 duration-300 motion-reduce:animate-none sm:px-7 sm:py-7"
        data-result={partial ? "partial" : "complete"}>
        <span
          aria-hidden
          className={cn(
            "flex size-12 items-center justify-center rounded-md border",
            partial
              ? "border-[#f2c98a] bg-[#fffaf0] text-[#b45309]"
              : "border-[#bfe5cd] bg-[#e8f6ee] text-[#16a34a]",
          )}>
          {partial ? (
            <TriangleAlert className="size-5" />
          ) : (
            <Check
              className="size-6 animate-in zoom-in-50 duration-300 motion-reduce:animate-none"
              strokeWidth={2.5}
            />
          )}
        </span>
        <h1
          className="mt-4 text-[22px] font-semibold tracking-[-0.03em] text-[#101a35]"
          id={titleId}>
          {partial ? labels.resultPartialTitle : labels.resultTitle}
        </h1>
        <p className="mt-1 text-[13px] leading-5 text-[#71809a]">
          {partial ? labels.resultPartialDescription : labels.resultDescription}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div
              className="rounded-md border border-[#e5eaf1] px-3.5 py-3"
              data-stat={stat.id}
              key={stat.id}>
              <dt className="flex items-center gap-2 text-[12px] font-medium text-[#53627b]">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md",
                    stat.tone,
                  )}>
                  <stat.icon className="size-3.5" />
                </span>
                {stat.label}
              </dt>
              <dd className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#101a35] tabular-nums">
                {number.format(stat.value)}
              </dd>
            </div>
          ))}
        </dl>

        {failedRows.length ? (
          <p className="mt-4 text-[12px] leading-5 text-[#b42318]">
            {formatImportLabel(labels.resultFailedRows, {
              rows: new Intl.ListFormat(locale, { type: "conjunction" }).format(
                failedRows.map((row) => number.format(row)),
              ),
            })}
          </p>
        ) : null}
        {result.deferredPipelineCount > 0 ? (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-[#f6f9ff] px-3 py-2.5 text-[12px] leading-5 text-[#53627b]">
            <Info
              aria-hidden
              className="mt-0.5 size-3.5 shrink-0 text-[#2563eb]"
            />
            {labels.resultDeferred}
          </p>
        ) : null}
        {errorCode ? (
          <p
            className="mt-4 flex items-start gap-2 text-[12px] font-medium text-[#c2412d]"
            role="alert">
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {labels.errors[errorCode]}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
          {partial ? (
            <Button
              aria-busy={retrying}
              className="h-11 w-full rounded-md bg-[#2563eb] px-4 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] sm:h-10 sm:w-auto"
              disabled={retrying}
              onClick={onRetry}
              type="button">
              {retrying ? (
                <LoaderCircle
                  aria-hidden
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <RotateCcw aria-hidden className="size-4" />
              )}
              {labels.retryFailed}
            </Button>
          ) : null}
          <Link
            className={partial ? secondaryLink : primaryLink}
            data-action="transactions"
            href={hrefs.transactions}>
            {labels.viewTransactions}
          </Link>
          <Link
            className={secondaryLink}
            data-action="inbox"
            href={hrefs.inbox}>
            <Inbox aria-hidden className="size-4" />
            {labels.openInbox}
            {inboxCount ? (
              <span className="rounded-md bg-[#f3efff] px-1.5 py-px text-[11px] font-semibold text-[#7c3aed] tabular-nums">
                {number.format(inboxCount)}
              </span>
            ) : null}
          </Link>
          <Link
            className={cn(
              linkButton,
              "text-[#53627b] hover:bg-[#f8fafc] hover:text-[#14213c]",
            )}
            data-action="another"
            href={hrefs.another}>
            {labels.importAnother}
          </Link>
        </div>
      </section>
    </main>
  );
}

export function ImportReviewStale({
  labels,
  workspaceSlug,
}: {
  readonly labels: ImportExecutionLabels;
  readonly workspaceSlug: string;
}) {
  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <h1 className="text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">
        {labels.title}
      </h1>
      <section
        className="mt-6 rounded-md border border-[#e5eaf1] bg-white px-5 py-12 text-center"
        role="alert">
        <h2 className="text-[15px] font-semibold text-[#18243b]">
          {labels.staleTitle}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-5 text-[#71809a]">
          {labels.staleDescription}
        </p>
        <Link
          className={cn(primaryLink, "mt-4")}
          href={transactionImportHref(workspaceSlug)}>
          {labels.staleAction}
        </Link>
      </section>
    </main>
  );
}

function formatReviewDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
