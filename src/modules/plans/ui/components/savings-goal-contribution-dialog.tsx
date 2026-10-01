"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiPlus } from "react-icons/fi";
import { LuPiggyBank } from "react-icons/lu";

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
import {
  getTransactionFormToday,
  TransactionDateField,
} from "@/modules/transactions/ui/components/transaction-date-field";

const contributionActionClass =
  "h-10 rounded-md bg-[#2867e8] px-4 text-white hover:bg-[#1e55d1]";

export function SavingsGoalContributionDialog({
  goal,
  labels,
  locale,
  timeZone,
  workspaceId,
}: {
  readonly goal: SavingsGoalRecord;
  readonly labels: PlansUiLabels["goalDetail"];
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const version = useRef(goal.updatedAt.toISOString());
  const idempotencyKey = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() =>
    getTransactionFormToday(timeZone),
  );
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const parsed = useMemo(
    () => parseBudgetAmount(amount, goal.currency),
    [amount, goal.currency],
  );
  const valid = !!parsed && parsed.minor > 0n;

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
            effectiveAt: effectiveDate.toISOString(),
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
        className={contributionActionClass}
        onClick={() => setOpen(true)}
        type="button">
        <FiPlus aria-hidden />
        {labels.addContribution}
      </Button>
      <ResponsiveDialog onOpenChange={(next) => next || close()} open={open}>
        <ResponsiveDialogContent
          className="w-[calc(100%-1rem)]! max-w-xl! rounded-[12px] border border-[#dfe6ef] bg-white p-0 text-[#101a35] sm:w-[calc(100%-3rem)]!"
          drawerClassName="max-h-[calc(100dvh-1rem)]! w-full! max-w-none! rounded-t-[16px] border-x-0 border-b-0"
          showCloseButton={!pending}>
          <ResponsiveDialogHeader className="border-b border-[#e8edf4] px-6 py-6 sm:px-7">
            <div className="flex items-center gap-3 pr-8">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[#edf4ff] text-[#2867e8]">
                <LuPiggyBank aria-hidden className="size-5" />
              </span>
              <div>
                <ResponsiveDialogTitle className="text-xl">
                  {labels.addContribution}
                </ResponsiveDialogTitle>
                <ResponsiveDialogDescription className="mt-1 leading-5">
                  {labels.contributionHelper}
                </ResponsiveDialogDescription>
              </div>
            </div>
          </ResponsiveDialogHeader>
          <div className="grid gap-5 px-6 py-6 sm:px-7">
            <PaceMoneyInput
              currency={goal.currency}
              error={
                submitted && (!parsed || parsed.minor <= 0n)
                  ? labels.contributionInvalid
                  : undefined
              }
              label={labels.amount}
              onValueChange={setAmount}
              required
              size="prominent"
              value={amount}
            />
            <TransactionDateField
              label={labels.effectiveDate}
              onValueChange={setEffectiveDate}
              locale={locale}
              required
              timeZone={timeZone}
              value={effectiveDate}
            />
            <div className="grid gap-2">
              <label
                className="text-[13px] font-medium text-[#384862]"
                htmlFor="contribution-note">
                {labels.noteOptional}
              </label>
              <textarea
                className="min-h-24 rounded-[10px] border border-[#d9e1ec] px-4 py-3 text-[15px] outline-none focus:border-[#4e7fe3] focus:ring-2 focus:ring-[#5e8fe8]/15"
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
            className="flex justify-end gap-2 border-t border-[#e8edf4] px-6 py-5 sm:px-7">
            <Button
              disabled={pending}
              onClick={close}
              size="lg"
              type="button"
              variant="outline">
              {labels.cancel}
            </Button>
            <Button
              className={contributionActionClass}
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
