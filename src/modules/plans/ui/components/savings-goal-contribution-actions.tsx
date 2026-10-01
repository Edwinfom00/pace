"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { getCurrencyExponent } from "@/money/currency";
import {
  getTransactionFormToday,
  TransactionDateField,
} from "@/modules/transactions/ui/components/transaction-date-field";

import type { SavingsGoalContribution, SavingsGoalRecord } from "../../domain";
import type { PlansUiLabels } from "../plans-ui-labels";
import { parseBudgetAmount } from "./budget-amount-field";

type Action = "CORRECT" | "REVERSE" | null;

const contributionActionClass =
  "h-10 rounded-md bg-[#2867e8] px-4 text-white hover:bg-[#1e55d1]";

function moneyValue(minor: bigint, currency: string) {
  const exponent = getCurrencyExponent(currency);
  if (!exponent) return minor.toString();
  const digits = minor.toString().padStart(exponent + 1, "0");
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

export function SavingsGoalContributionActions({
  contribution,
  goal,
  labels,
  locale,
  timeZone,
  workspaceId,
}: {
  readonly contribution: SavingsGoalContribution & {
    readonly capabilities: {
      readonly canCorrect: boolean;
      readonly canReverse: boolean;
    };
  };
  readonly goal: SavingsGoalRecord;
  readonly labels: PlansUiLabels["goalDetail"];
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const version = useRef(goal.updatedAt.toISOString());
  const idempotencyKey = useRef<string | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [amount, setAmount] = useState(() =>
    moneyValue(contribution.amountMinor, goal.currency),
  );
  const [effectiveDate, setEffectiveDate] = useState(() =>
    getTransactionFormToday(timeZone),
  );
  const [note, setNote] = useState(contribution.note ?? "");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const parsed = useMemo(
    () => parseBudgetAmount(amount, goal.currency),
    [amount, goal.currency],
  );
  const valid = action === "REVERSE" || (!!parsed && parsed.minor > 0n);

  const close = () => {
    if (pending) return;
    setAction(null);
    setError(null);
    setConflict(false);
    setSubmitted(false);
  };
  const reload = () => {
    setConflict(false);
    router.refresh();
  };
  const open = (next: Exclude<Action, null>) => {
    version.current = goal.updatedAt.toISOString();
    idempotencyKey.current = null;
    setEffectiveDate(getTransactionFormToday(timeZone));
    setNote(contribution.note ?? "");
    setAmount(moneyValue(contribution.amountMinor, goal.currency));
    setError(null);
    setConflict(false);
    setSubmitted(false);
    setAction(next);
  };
  const submit = async () => {
    setSubmitted(true);
    if (!action || pending || !valid) return;
    setPending(true);
    setError(null);
    setConflict(false);
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/plans/goals/${encodeURIComponent(goal.id)}/contributions/${encodeURIComponent(contribution.id)}/${action === "CORRECT" ? "correct" : "reverse"}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(action === "CORRECT"
              ? {
                  amountMinor: parsed!.minor.toString(),
                  currency: goal.currency,
                }
              : {}),
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
        else
          setError(
            action === "CORRECT"
              ? labels.correctionError
              : labels.reversalError,
          );
        return;
      }
      idempotencyKey.current = null;
      setAction(null);
      setError(null);
      setConflict(false);
      setSubmitted(false);
      router.refresh();
    } catch {
      setError(
        action === "CORRECT" ? labels.correctionError : labels.reversalError,
      );
    } finally {
      setPending(false);
    }
  };
  if (
    !contribution.capabilities.canCorrect &&
    !contribution.capabilities.canReverse
  )
    return null;
  const correcting = action === "CORRECT";
  const title = correcting
    ? labels.correctContribution
    : labels.reverseContribution;
  const description = correcting
    ? labels.correctionHelper
    : labels.reversalHelper;
  return (
    <>
      <div className="flex shrink-0 gap-2">
        {contribution.capabilities.canCorrect ? (
          <button
            className="text-[12px] font-medium text-[#2867e8] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            onClick={() => open("CORRECT")}
            type="button">
            {labels.correctContribution}
          </button>
        ) : null}
        {contribution.capabilities.canReverse ? (
          <button
            className="text-[12px] font-medium text-[#b5473f] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5473f]"
            onClick={() => open("REVERSE")}
            type="button">
            {labels.reverseContribution}
          </button>
        ) : null}
      </div>
      <ResponsiveDialog
        mobilePresentation="dialog"
        onOpenChange={(next) => !next && close()}
        open={action !== null}>
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
                  {title}
                </ResponsiveDialogTitle>
                <ResponsiveDialogDescription className="mt-1 leading-5">
                  {description}
                </ResponsiveDialogDescription>
              </div>
            </div>
          </ResponsiveDialogHeader>
          <div className="grid gap-5 px-6 py-6 sm:px-7">
            {correcting ? (
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
            ) : null}
            <TransactionDateField
              label={labels.effectiveDate}
              locale={locale}
              onValueChange={setEffectiveDate}
              required
              timeZone={timeZone}
              value={effectiveDate}
            />
            <div className="grid gap-2">
              <label
                className="text-[13px] font-medium text-[#384862]"
                htmlFor={`contribution-action-note-${contribution.id}`}>
                {labels.noteOptional}
              </label>
              <textarea
                className="min-h-24 rounded-[10px] border border-[#d9e1ec] px-4 py-3 text-[15px] outline-none focus:border-[#4e7fe3] focus:ring-2 focus:ring-[#5e8fe8]/15"
                id={`contribution-action-note-${contribution.id}`}
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
              disabled={pending || !valid || conflict}
              onClick={() => void submit()}
              type="button"
              variant="default">
              {pending
                ? correcting
                  ? labels.correctingContribution
                  : labels.reversingContribution
                : title}
            </Button>
          </footer>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
