"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiMoreHorizontal } from "react-icons/fi";

import { PaceMoneyInput } from "@/components/pace/forms/pace-money-input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { getCurrencyExponent } from "@/money/currency";

import type { SavingsGoalSummary } from "../../domain";
import type { PlansUiLabels } from "../plans-ui-labels";
import { parseBudgetAmount } from "./budget-amount-field";

type Dialog = "EDIT" | "ARCHIVE" | "COMPLETE" | null;

function dateValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function moneyValue(minor: bigint, currency: string) {
  const exponent = getCurrencyExponent(currency);
  if (!exponent) return minor.toString();
  const sign = minor < 0n ? "-" : "";
  const digits = (minor < 0n ? -minor : minor)
    .toString()
    .padStart(exponent + 1, "0");
  return `${sign}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

function validDate(value: string) {
  if (!value) return true;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function SavingsGoalManagementActions({
  goal,
  capabilities,
  labels,
  workspaceId,
}: {
  readonly goal: SavingsGoalSummary["goal"];
  readonly capabilities: SavingsGoalSummary["capabilities"];
  readonly labels: PlansUiLabels["goalDetail"];
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const version = useRef(goal.updatedAt.toISOString());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState(goal.name);
  const [amount, setAmount] = useState(() =>
    moneyValue(goal.targetAmountMinor, goal.currency),
  );
  const [targetDate, setTargetDate] = useState(() =>
    dateValue(goal.targetDate),
  );
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const parsed = useMemo(
    () => parseBudgetAmount(amount, goal.currency),
    [amount, goal.currency],
  );
  const changed =
    name.trim() !== goal.name ||
    parsed?.minor !== goal.targetAmountMinor ||
    targetDate !== dateValue(goal.targetDate);
  const valid =
    !!name.trim() && !!parsed && parsed.minor > 0n && validDate(targetDate);
  const close = () => {
    if (!pending) {
      setDialog(null);
      setError(null);
      setConflict(false);
      setSubmitted(false);
    }
  };
  const reload = () => {
    setConflict(false);
    router.refresh();
  };
  const request = async (action: Exclude<Dialog, null>) => {
    if (pending || (action === "EDIT" && (!valid || !changed))) return;
    if (action === "EDIT") setSubmitted(true);
    setPending(true);
    setError(null);
    setConflict(false);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/plans/goals/${encodeURIComponent(goal.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            expectedUpdatedAt: version.current,
            idempotencyKey: crypto.randomUUID(),
            ...(action === "EDIT"
              ? {
                  name: name.trim(),
                  targetAmountMinor: parsed!.minor.toString(),
                  targetDate: targetDate
                    ? new Date(`${targetDate}T00:00:00.000Z`).toISOString()
                    : null,
                }
              : {}),
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        code?: string;
      } | null;
      if (!response.ok) {
        if (response.status === 409 || payload?.code === "CONFLICT")
          setConflict(true);
        else
          setError(
            action === "EDIT"
              ? labels.editError
              : action === "ARCHIVE"
                ? labels.archiveError
                : labels.completeError,
          );
        return;
      }
      setDialog(null);
      setError(null);
      setConflict(false);
      setSubmitted(false);
      router.refresh();
    } catch {
      setError(
        action === "EDIT"
          ? labels.editError
          : action === "ARCHIVE"
            ? labels.archiveError
            : labels.completeError,
      );
    } finally {
      setPending(false);
    }
  };
  if (
    !capabilities.canEdit &&
    !capabilities.canArchive &&
    !capabilities.canComplete &&
    !capabilities.canReopen
  )
    return null;
  const feedback = conflict ? (
    <p className="mt-3 text-[13px] text-[#c23445]" role="alert">
      {labels.changed}{" "}
      <button className="underline" onClick={reload} type="button">
        {labels.reload}
      </button>
    </p>
  ) : error ? (
    <p className="mt-3 text-[13px] text-[#c23445]" role="alert">
      {error}
    </p>
  ) : null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={labels.more}
            className="grid size-10 place-items-center rounded-[9px] border border-[#e5e9f0] text-[#53627b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2867e8]"
            type="button">
            <FiMoreHorizontal />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          {capabilities.canEdit ? (
            <DropdownMenuItem onSelect={() => setDialog("EDIT")}>
              {labels.edit}
            </DropdownMenuItem>
          ) : null}
          {capabilities.canComplete ? (
            <DropdownMenuItem onSelect={() => setDialog("COMPLETE")}>
              {labels.complete}
            </DropdownMenuItem>
          ) : null}
          {capabilities.canArchive ? (
            <DropdownMenuItem
              onSelect={() => setDialog("ARCHIVE")}
              variant="destructive">
              {labels.archive}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ResponsiveDialog
        mobilePresentation="dialog"
        onOpenChange={(open) => !open && close()}
        open={dialog === "EDIT"}>
        <ResponsiveDialogContent
          className="w-[calc(100%-1rem)]! max-w-xl! rounded-[12px] border border-[#dfe6ef] bg-white p-0 text-[#101a35] sm:w-[calc(100%-3rem)]!"
          showCloseButton={!pending}>
          <ResponsiveDialogHeader className="border-b border-[#e8edf4] px-5 py-5">
            <ResponsiveDialogTitle>{labels.editTitle}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {labels.editDescription}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="grid gap-4 px-5 py-5">
            <div className="grid gap-2">
              <label
                className="text-[13px] font-medium text-[#384862]"
                htmlFor="edit-goal-name">
                {labels.name}
              </label>
              <input
                aria-invalid={(submitted && !name.trim()) || undefined}
                className="h-10 rounded-[8px] border border-[#d9e1ec] px-3 text-[13px] outline-none focus:border-[#4e7fe3] focus:ring-2 focus:ring-[#5e8fe8]/15"
                id="edit-goal-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
              <p className="text-[12px] text-[#71809a]">
                {submitted && !name.trim()
                  ? labels.invalidName
                  : labels.nameHint}
              </p>
            </div>
            <PaceMoneyInput
              currency={goal.currency}
              error={
                submitted && (!parsed || parsed.minor <= 0n)
                  ? labels.invalidAmount
                  : undefined
              }
              helperText={labels.targetHint}
              label={labels.targetAmount}
              onValueChange={setAmount}
              size="compact"
              value={amount}
            />
            <div className="grid gap-2">
              <label
                className="text-[13px] font-medium text-[#384862]"
                htmlFor="edit-goal-date">
                {labels.targetDate}
              </label>
              <input
                aria-invalid={
                  (submitted && !validDate(targetDate)) || undefined
                }
                className="h-10 rounded-[8px] border border-[#d9e1ec] px-3 text-[13px] outline-none focus:border-[#4e7fe3] focus:ring-2 focus:ring-[#5e8fe8]/15"
                id="edit-goal-date"
                onChange={(event) => setTargetDate(event.target.value)}
                type="date"
                value={targetDate}
              />
              <p className="text-[12px] text-[#71809a]">
                {submitted && !validDate(targetDate)
                  ? labels.invalidDate
                  : labels.targetDateHint}
              </p>
            </div>
            {feedback}
          </div>
          <footer className="flex justify-end gap-2 border-t border-[#e8edf4] px-5 py-4">
            <Button
              disabled={pending}
              onClick={close}
              type="button"
              variant="outline">
              {labels.cancel}
            </Button>
            <Button
              disabled={pending || !changed || !valid}
              onClick={() => void request("EDIT")}
              type="button">
              {pending ? labels.saving : labels.save}
            </Button>
          </footer>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      <ConfirmDialog
        close={close}
        error={feedback}
        labels={labels}
        onConfirm={() => void request("ARCHIVE")}
        open={dialog === "ARCHIVE"}
        pending={pending}
        title={labels.archiveTitle}
        description={labels.archiveDescription}
        action={pending ? labels.archiving : labels.archive}
      />
      <ConfirmDialog
        close={close}
        error={feedback}
        labels={labels}
        onConfirm={() => void request("COMPLETE")}
        open={dialog === "COMPLETE"}
        pending={pending}
        title={labels.completeTitle}
        description={labels.completeDescription}
        action={pending ? labels.completing : labels.complete}
      />
    </>
  );
}

function ConfirmDialog({
  action,
  close,
  description,
  error,
  labels,
  onConfirm,
  open,
  pending,
  title,
}: {
  readonly action: string;
  readonly close: () => void;
  readonly description: string;
  readonly error: React.ReactNode;
  readonly labels: PlansUiLabels["goalDetail"];
  readonly onConfirm: () => void;
  readonly open: boolean;
  readonly pending: boolean;
  readonly title: string;
}) {
  return (
    <ResponsiveDialog
      mobilePresentation="dialog"
      onOpenChange={(next) => !next && close()}
      open={open}>
      <ResponsiveDialogContent
        className="w-[calc(100%-2rem)] max-w-md rounded-[12px] border border-[#dfe6ef] bg-white p-5"
        showCloseButton={!pending}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {description}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {error}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            disabled={pending}
            onClick={close}
            type="button"
            variant="outline">
            {labels.cancel}
          </Button>
          <Button
            disabled={pending}
            onClick={onConfirm}
            type="button"
            variant="destructive">
            {action}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
