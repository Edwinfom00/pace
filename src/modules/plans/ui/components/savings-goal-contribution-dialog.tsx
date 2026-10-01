"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiPlus } from "react-icons/fi";

import { PaceMoneyInput } from "@/components/pace/forms/pace-money-input";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";

import type { SavingsGoalRecord } from "../../domain";
import type { PlansUiLabels } from "../plans-ui-labels";
import { parseBudgetAmount } from "./budget-amount-field";

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function SavingsGoalContributionDialog({
  goal,
  labels,
  workspaceId,
}: {
  readonly goal: SavingsGoalRecord;
  readonly labels: PlansUiLabels["goalDetail"];
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const version = useRef(goal.updatedAt.toISOString());
  const idempotencyKey = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const parsed = useMemo(
    () => parseBudgetAmount(amount, goal.currency),
    [amount, goal.currency],
  );
  const valid = !!parsed && parsed.minor > 0n && validDate(effectiveDate);

  const reload = () => {
    setConflict(false);
    router.refresh();
  };
  const close = () => {
    if (!pending) {
      setOpen(false);
      setError(null);
      setConflict(false);
      setSubmitted(false);
    }
  };
  const submit = async () => {
    setSubmitted(true);
    if (pending || !valid) return;
    setPending(true);
    setError(null);
    setConflict(false);
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/plans/goals/${encodeURIComponent(goal.id)}/contributions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            amountMinor: parsed!.minor.toString(),
            currency: goal.currency,
            effectiveAt: new Date(
              `${effectiveDate}T00:00:00.000Z`,
            ).toISOString(),
            note: note.trim() || null,
            expectedUpdatedAt: version.current,
            idempotencyKey: key,
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        else if (response.status === 400) setError(labels.contributionInvalid);
        else if (response.status === 404)
          setError(labels.contributionUnavailable);
        else setError(labels.contributionError);
        return;
      }
      idempotencyKey.current = null;
      setOpen(false);
      setError(null);
      setConflict(false);
      setSubmitted(false);
      router.refresh();
    } catch {
      setError(labels.contributionError);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        className="h-10 rounded-[8px] bg-[#2867e8] hover:bg-[#1e55d1]"
        onClick={() => setOpen(true)}
        type="button">
        <FiPlus aria-hidden />
        {labels.addContribution}
      </Button>
      <ResponsiveDialog
        mobilePresentation="dialog"
        onOpenChange={(next) => next || close()}
        open={open}>
        <ResponsiveDialogContent
          className="w-[calc(100%-1rem)]! max-w-md! rounded-[12px] border border-[#dfe6ef] bg-white p-0 text-[#101a35] sm:w-[calc(100%-3rem)]!"
          showCloseButton={!pending}>
          <ResponsiveDialogHeader className="border-b border-[#e8edf4] px-5 py-5">
            <ResponsiveDialogTitle>
              {labels.addContribution}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {labels.contributionHelper}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="grid gap-4 px-5 py-5">
            <PaceMoneyInput
              currency={goal.currency}
              error={
                submitted && (!parsed || parsed.minor <= 0n)
                  ? labels.contributionInvalid
                  : undefined
              }
              label={labels.amount}
              onValueChange={setAmount}
              size="compact"
              value={amount}
            />
            <div className="grid gap-2">
              <label
                className="text-[13px] font-medium text-[#384862]"
                htmlFor="contribution-currency">
                {labels.currency}
              </label>
              <input
                className="h-10 rounded-[8px] border border-[#d9e1ec] bg-[#f7f9fc] px-3 text-[13px] text-[#526788]"
                id="contribution-currency"
                readOnly
                value={goal.currency}
              />
            </div>
            <div className="grid gap-2">
              <label
                className="text-[13px] font-medium text-[#384862]"
                htmlFor="contribution-effective-date">
                {labels.effectiveDate}
              </label>
              <input
                aria-invalid={
                  (submitted && !validDate(effectiveDate)) || undefined
                }
                className="h-10 rounded-[8px] border border-[#d9e1ec] px-3 text-[13px] outline-none focus:border-[#4e7fe3] focus:ring-2 focus:ring-[#5e8fe8]/15"
                id="contribution-effective-date"
                onChange={(event) => setEffectiveDate(event.target.value)}
                type="date"
                value={effectiveDate}
              />
              {submitted && !validDate(effectiveDate) ? (
                <p className="text-[12px] text-[#c23445]" role="alert">
                  {labels.invalidEffectiveDate}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <label
                className="text-[13px] font-medium text-[#384862]"
                htmlFor="contribution-note">
                {labels.noteOptional}
              </label>
              <textarea
                className="min-h-20 rounded-[8px] border border-[#d9e1ec] px-3 py-2 text-[13px] outline-none focus:border-[#4e7fe3] focus:ring-2 focus:ring-[#5e8fe8]/15"
                id="contribution-note"
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                value={note}
              />
            </div>
            {conflict ? (
              <p className="text-[13px] text-[#c23445]" role="alert">
                {labels.changed}{" "}
                <button className="underline" onClick={reload} type="button">
                  {labels.reload}
                </button>
              </p>
            ) : error ? (
              <p className="text-[13px] text-[#c23445]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <footer
            aria-live="polite"
            className="flex justify-end gap-2 border-t border-[#e8edf4] px-5 py-4">
            <Button
              disabled={pending}
              onClick={close}
              type="button"
              variant="outline">
              {labels.cancel}
            </Button>
            <Button
              className="bg-[#2867e8] hover:bg-[#1e55d1]"
              disabled={pending}
              onClick={() => void submit()}
              type="button">
              {pending ? labels.addingContribution : labels.addContribution}
            </Button>
          </footer>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
