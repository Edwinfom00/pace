"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiInfo, FiTarget, FiX } from "react-icons/fi";

import { PaceMoneyInput } from "@/components/pace/forms/pace-money-input";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";

import type { PlansUiLabels } from "../plans-ui-labels";
import { parseBudgetAmount } from "./budget-amount-field";
import {
  BudgetIconPicker,
  BudgetVisualIcon,
  DEFAULT_BUDGET_VISUAL_IDENTITY,
  type BudgetIconKey,
  type BudgetVisualIdentity,
} from "./budget-icon-picker";

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

export function SavingsGoalCreateDialog({
  currency,
  iconLabels,
  labels,
  locale,
  onOpenChange,
  open,
  workspaceId,
  workspaceSlug,
}: {
  readonly currency: string;
  readonly iconLabels: Readonly<Record<BudgetIconKey, string>>;
  readonly labels: PlansUiLabels["createSavingsGoal"];
  readonly locale: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [includeProgress, setIncludeProgress] = useState(false);
  const [currentSaved, setCurrentSaved] = useState("");
  const [visual, setVisual] = useState<BudgetVisualIdentity>(
    DEFAULT_BUDGET_VISUAL_IDENTITY,
  );
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const target = useMemo(
    () => parseBudgetAmount(targetAmount, currency),
    [currency, targetAmount],
  );
  const saved = useMemo(
    () => parseBudgetAmount(currentSaved, currency),
    [currency, currentSaved],
  );
  const targetValid = !!target && target.minor > 0n;
  const progressValid = !includeProgress || (!!saved && saved.minor >= 0n);
  const dateValid = !targetDate || validDate(targetDate);
  const previewTarget = targetValid
    ? formatOverviewMoney(target.minor, currency, locale)
    : labels.previewAmountFallback;
  const previewSaved =
    includeProgress && saved && saved.minor >= 0n ? saved.minor : 0n;
  const progressBps = targetValid
    ? (previewSaved * 10_000n) / target.minor
    : 0n;
  const percentage = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(Number(progressBps) / 10_000);
  const formattedDate =
    targetDate && dateValid
      ? new Intl.DateTimeFormat(locale, {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${targetDate}T00:00:00.000Z`))
      : labels.noTargetDate;
  const submit = async () => {
    if (isSubmitting) return;
    setSubmitted(true);
    if (!name.trim() || !targetValid || !progressValid || !dateValid) return;
    setFormError(null);
    setIsSubmitting(true);
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/plans/goals`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            targetAmountMinor: target.minor.toString(),
            currentSavedMinor: includeProgress
              ? saved!.minor.toString()
              : undefined,
            currency,
            targetDate: targetDate || null,
            idempotencyKey: key,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        code?: string;
        goal?: { id: string };
      } | null;
      if (!response.ok || !payload?.goal) {
        setFormError(
          payload?.code === "CURRENCY_MISMATCH"
            ? labels.invalidCurrency
            : labels.createError,
        );
        return;
      }
      idempotencyKey.current = null;
      onOpenChange(false);
      router.refresh();
      router.push(`/w/${workspaceSlug}/plans/goals/${payload.goal.id}`);
    } catch {
      setFormError(labels.createError);
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <ResponsiveDialogContent
        className="flex! max-h-[calc(100dvh-1rem)]! min-h-0 w-[calc(100%-1rem)]! max-w-265! flex-col gap-0 overflow-hidden rounded-[12px] border border-[#dfe6ef] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] lg:max-h-[calc(100dvh-3rem)] lg:w-[calc(100%-3rem)]"
        drawerClassName="w-full max-w-none rounded-none rounded-t-[14px] border-x-0 border-b-0">
        <ResponsiveDialogClose>
          <Button
            aria-label={labels.close}
            className="absolute top-4 right-4 z-10 size-8 rounded-[7px] text-[#61708a] hover:bg-[#f3f6fa]"
            disabled={isSubmitting}
            size="icon"
            type="button"
            variant="ghost">
            <FiX />
          </Button>
        </ResponsiveDialogClose>
        <ResponsiveDialogHeader className="shrink-0 border-b border-[#e7ecf3] px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-[9px] bg-[#f1efff] text-[#7057d9]">
              <FiTarget className="size-4" />
            </span>
            <div>
              <ResponsiveDialogTitle className="text-[18px] font-semibold tracking-tight">
                {labels.title}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className="mt-0.5 text-[12px] text-[#71809a]">
                {labels.subtitle}
              </ResponsiveDialogDescription>
            </div>
          </div>
        </ResponsiveDialogHeader>
        <div className="min-h-0 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="px-5 py-5 sm:px-7">
            <fieldset className="grid gap-4">
              <legend className="text-[15px] font-semibold text-[#14213c]">
                {labels.details}
              </legend>
              <div className="grid gap-2">
                <label
                  className="text-[13px] font-medium text-[#384862]"
                  htmlFor="goal-name">
                  {labels.name}
                </label>
                <input
                  id="goal-name"
                  className="h-10 rounded-[8px] border border-[#d9e1ec] px-3 text-[13px] outline-none focus:border-[#4e7fe3] focus:ring-2 focus:ring-[#5e8fe8]/15"
                  placeholder={labels.namePlaceholder}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-invalid={(submitted && !name.trim()) || undefined}
                />
                <p className="text-[12px] text-[#71809a]">
                  {submitted && !name.trim()
                    ? labels.invalidName
                    : labels.nameHint}
                </p>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-[#384862]">
                  {labels.iconAndColour}
                </p>
                <BudgetIconPicker
                  labels={{ groupLabel: labels.iconPicker, icons: iconLabels }}
                  onChange={setVisual}
                  value={visual}
                />
              </div>
              <PaceMoneyInput
                currency={currency}
                error={
                  submitted && !targetValid ? labels.invalidAmount : undefined
                }
                helperText={labels.targetHint}
                label={labels.targetAmount}
                onValueChange={setTargetAmount}
                size="compact"
                value={targetAmount}
              />
              <div className="grid gap-2">
                <label
                  className="text-[13px] font-medium text-[#384862]"
                  htmlFor="goal-target-date">
                  {labels.targetDate}
                </label>
                <input
                  id="goal-target-date"
                  className="h-10 rounded-[8px] border border-[#d9e1ec] px-3 text-[13px] outline-none focus:border-[#4e7fe3] focus:ring-2 focus:ring-[#5e8fe8]/15"
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                  aria-invalid={(submitted && !dateValid) || undefined}
                />
                <p
                  className={
                    submitted && !dateValid
                      ? "text-[12px] text-[#c23445]"
                      : "text-[12px] text-[#71809a]"
                  }>
                  {submitted && !dateValid
                    ? labels.invalidDate
                    : labels.targetDateHint}
                </p>
              </div>
            </fieldset>
            <fieldset className="mt-6 border-t border-[#e8edf4] pt-5">
              <legend className="text-[15px] font-semibold text-[#14213c]">
                {labels.initialProgress}
              </legend>
              <label className="mt-3 flex items-center gap-2 text-[13px] text-[#384862]">
                <input
                  checked={includeProgress}
                  className="size-4 accent-[#2867e8]"
                  type="checkbox"
                  onChange={(event) => setIncludeProgress(event.target.checked)}
                />
                {labels.addInitialProgress}
              </label>
              {includeProgress ? (
                <div className="mt-3">
                  <PaceMoneyInput
                    currency={currency}
                    error={
                      submitted && !progressValid
                        ? labels.invalidProgress
                        : undefined
                    }
                    helperText={labels.currentSavedHint}
                    label={labels.currentSaved}
                    onValueChange={setCurrentSaved}
                    size="compact"
                    value={currentSaved}
                  />
                </div>
              ) : null}
            </fieldset>
          </div>
          <aside className="border-t border-[#e8edf4] bg-[#fbfcfe] p-5 lg:border-t-0 lg:border-l">
            <h3 className="text-[15px] font-semibold text-[#14213c]">
              {labels.preview}
            </h3>
            <div className="mt-4 rounded-[10px] border border-[#e3e9f2] bg-white p-4">
              <div className="flex gap-3">
                <BudgetVisualIcon
                  ariaLabel={labels.iconPicker}
                  value={visual}
                />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#14213c]">
                    {name || labels.previewName}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#71809a]">
                    {previewTarget}
                  </p>
                </div>
              </div>
              <dl className="mt-5 space-y-2 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#71809a]">{labels.targetDate}</dt>
                  <dd className="font-medium text-[#263550]">
                    {formattedDate}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#71809a]">{labels.remaining}</dt>
                  <dd className="font-medium text-[#263550]">
                    {targetValid
                      ? formatOverviewMoney(
                          target.minor - previewSaved,
                          currency,
                          locale,
                        )
                      : "—"}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 border-t border-[#e8edf4] pt-4">
                <div className="flex justify-between text-[12px]">
                  <span className="text-[#71809a]">{labels.progress}</span>
                  <span className="font-medium text-[#263550]">
                    {percentage}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf0f4]">
                  <div
                    className="h-full rounded-full bg-[#2867e8]"
                    style={{
                      width: `${Math.min(100, Math.max(0, Number(progressBps > 10_000n ? 10_000n : progressBps) / 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-[12px] text-[#71809a]">
                  {formatOverviewMoney(previewSaved, currency, locale)}{" "}
                  {labels.saved}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2 rounded-[8px] bg-[#edf4ff] p-3 text-[12px] leading-5 text-[#526987]">
              <FiInfo className="mt-0.5 size-4 shrink-0 text-[#2867e8]" />
              {labels.noMoneyNotice}
            </div>
          </aside>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[#e7ecf3] px-5 py-3 sm:px-7">
          <p className="mr-auto text-[12px] text-[#c23445]" role="alert">
            {formError}
          </p>
          <Button
            className="h-9 rounded-[8px]"
            disabled={isSubmitting}
            variant="outline"
            onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button
            className="h-9 rounded-[8px] bg-[#2867e8] hover:bg-[#1e55d1]"
            disabled={isSubmitting}
            onClick={() => void submit()}>
            {isSubmitting ? labels.creating : labels.create}
          </Button>
        </footer>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
