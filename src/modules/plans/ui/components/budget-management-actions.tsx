"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiMoreHorizontal } from "react-icons/fi";

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
import type { BudgetRecord, BudgetSummary } from "@/modules/plans/domain";

import type { PlansUiLabels } from "../plans-ui-labels";
import { BudgetAmountField, parseBudgetAmount } from "./budget-amount-field";
import {
  BudgetCategoryScopeField,
  type BudgetCategoryLoadState,
  type BudgetCategoryOption,
  type BudgetCategoryScope,
} from "./budget-category-scope-field";
import {
  BudgetPeriodField,
  budgetPeriodStart,
  type BudgetPeriodKey,
} from "./budget-period-field";
import { BudgetAdvancedOptions } from "./budget-advanced-options";

type Mutation = "EDIT" | "ARCHIVE";
const emptyCategories: BudgetCategoryLoadState = {
  status: "ready",
  categories: [],
};

function decimalAmount(amount: bigint, currency: string) {
  const exponent = getCurrencyExponent(currency);
  if (!exponent) return amount.toString();
  const raw = amount.toString().padStart(exponent + 1, "0");
  return `${raw.slice(0, -exponent)}.${raw.slice(-exponent)}`;
}

function periodFor(date: Date, timeZone: string): BudgetPeriodKey {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const find = (type: "year" | "month") =>
    parts.find((part) => part.type === type)?.value ?? "01";
  return `${find("year")}-${find("month")}` as BudgetPeriodKey;
}

export function BudgetManagementActions({
  budget,
  capabilities,
  labels,
  locale,
  timeZone,
  workspaceId,
}: {
  readonly budget: BudgetRecord;
  readonly capabilities: BudgetSummary["capabilities"];
  readonly labels: PlansUiLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const t = labels.budgetManagement;
  const [dialog, setDialog] = useState<Mutation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [amount, setAmount] = useState(() =>
    decimalAmount(budget.amountMinor, budget.currency),
  );
  const [period, setPeriod] = useState<BudgetPeriodKey>(() =>
    periodFor(budget.startsOn, timeZone),
  );
  const [scope, setScope] = useState<BudgetCategoryScope | null>(() => {
    if (budget.scope !== "CATEGORY" || !budget.categoryId) return null;
    return budget.subcategoryIds.length
      ? {
          mode: "SUBCATEGORIES",
          categoryId: budget.categoryId,
          subcategoryIds: budget.subcategoryIds,
        }
      : { mode: "CATEGORY", categoryId: budget.categoryId, subcategoryIds: [] };
  });
  const [roots, setRoots] = useState<BudgetCategoryLoadState>(emptyCategories);
  const [children, setChildren] =
    useState<BudgetCategoryLoadState>(emptyCategories);
  const version = useRef(budget.updatedAt.toISOString());
  const parsed = useMemo(
    () => parseBudgetAmount(amount, budget.currency),
    [amount, budget.currency],
  );
  const changed =
    (parsed?.minor ?? -1n) !== budget.amountMinor ||
    period !== periodFor(budget.startsOn, timeZone) ||
    (budget.scope === "CATEGORY" &&
      (!scope ||
        scope.categoryId !== budget.categoryId ||
        scope.subcategoryIds.join(",") !== budget.subcategoryIds.join(","))) ||
    (budget.scope === "OVERALL" && scope !== null);

  useEffect(() => {
    if (dialog !== "EDIT" || budget.scope === "OVERALL") return;
    let cancelled = false;
    queueMicrotask(() => !cancelled && setRoots({ status: "loading", categories: [] }));
    void fetch(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/ledger/categories?parentCategoryId=root`,
    )
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { categories: BudgetCategoryOption[] })
              .categories
          : Promise.reject(),
      )
      .then(
        (categories) => !cancelled && setRoots({ status: "ready", categories }),
      )
      .catch(() => !cancelled && setRoots({ status: "error", categories: [] }));
    return () => {
      cancelled = true;
    };
  }, [budget.scope, dialog, workspaceId]);
  useEffect(() => {
    if (dialog !== "EDIT" || !scope) {
      queueMicrotask(() => setChildren(emptyCategories));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => !cancelled && setChildren({ status: "loading", categories: [] }));
    void fetch(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/ledger/categories?parentCategoryId=${encodeURIComponent(scope.categoryId)}`,
    )
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { categories: BudgetCategoryOption[] })
              .categories
          : Promise.reject(),
      )
      .then(
        (categories) =>
          !cancelled && setChildren({ status: "ready", categories }),
      )
      .catch(
        () => !cancelled && setChildren({ status: "error", categories: [] }),
      );
    return () => {
      cancelled = true;
    };
  }, [dialog, scope, workspaceId]);

  const close = () => {
    if (!pending) {
      setDialog(null);
      setError(null);
      setConflict(false);
    }
  };
  const request = async (action: Mutation) => {
    if (pending) return;
    setPending(true);
    setError(null);
    setConflict(false);
    try {
      const body =
        action === "EDIT"
          ? {
              action,
              amountMinor: parsed?.minor.toString(),
              startsOn: budgetPeriodStart(period, timeZone)?.toISOString(),
              ...(budget.scope === "CATEGORY" && scope
                ? {
                    scope: "CATEGORY",
                    categoryId: scope.categoryId,
                    subcategoryIds: scope.subcategoryIds,
                  }
                : {}),
            }
          : { action };
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/plans/budgets/${encodeURIComponent(budget.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...body,
            expectedUpdatedAt: version.current,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        if (response.status === 409 || payload?.code === "CONFLICT")
          setConflict(true);
        else setError(action === "EDIT" ? t.editError : t.archiveError);
        return;
      }
      setDialog(null);
      setError(null);
      setConflict(false);
      router.refresh();
    } catch {
      setError(action === "EDIT" ? t.editError : t.archiveError);
    } finally {
      setPending(false);
    }
  };
  if (!capabilities.canEdit && !capabilities.canArchive) return null;
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
              {t.edit}
            </DropdownMenuItem>
          ) : null}
          {capabilities.canArchive ? (
            <DropdownMenuItem
              onSelect={() => setDialog("ARCHIVE")}
              variant="destructive">
              {t.archive}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ResponsiveDialog
        mobilePresentation="dialog"
        onOpenChange={(open) => !open && close()}
        open={dialog === "EDIT"}>
        <ResponsiveDialogContent
          className="w-[calc(100%-1rem)]! max-w-180! rounded-[12px] border border-[#dfe6ef] bg-white p-0 text-[#101a35] sm:w-[calc(100%-3rem)]!"
          showCloseButton={!pending}>
          <ResponsiveDialogHeader className="border-b border-[#e8edf4] px-5 py-5">
            <ResponsiveDialogTitle>{t.editTitle}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t.editDescription}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="space-y-4 px-5 py-5">
            {budget.scope === "CATEGORY" ? (
              <BudgetCategoryScopeField
                childCategories={children.categories}
                childrenState={children}
                labels={{
                  category: labels.createBudget.mainCategory,
                  subcategories: labels.createBudget.subcategories,
                  optional: labels.createBudget.optional,
                  selectCategory: labels.createBudget.selectCategory,
                  selectSubcategories: labels.createBudget.selectSubcategories,
                  subcategoriesHint: labels.createBudget.subcategoriesHint,
                  noSubcategoriesAvailable:
                    labels.createBudget.noSubcategoriesAvailable,
                  loadingCategories: labels.createBudget.loadingCategories,
                  categoryLoadError: labels.createBudget.categoryLoadError,
                }}
                onScopeChange={setScope}
                roots={roots.categories}
                rootsState={roots}
                scope={scope}
              />
            ) : (
              <p className="text-[13px] text-[#526788]">{t.overall}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <BudgetAmountField
                currency={budget.currency}
                error={
                  parsed && parsed.minor > 0n
                    ? undefined
                    : labels.createBudget.invalidAmount
                }
                helperText={labels.createBudget.amountHint}
                label={labels.createBudget.budgetAmount}
                onChange={setAmount}
                value={amount}
              />
              <BudgetPeriodField
                label={labels.createBudget.period}
                locale={locale}
                onChange={setPeriod}
                period={period}
                selectPeriod={labels.createBudget.selectPeriod}
                timeZone={timeZone}
              />
            </div>
            <BudgetAdvancedOptions
              frequency={budget.frequency}
              labels={{
                monthlyResetTitle: labels.createBudget.monthlyResetTitle,
                monthlyResetHint: labels.createBudget.monthlyResetHint,
              }}
            />
            {conflict ? (
              <p className="text-[13px] text-[#c23445]" role="alert">
                {t.changed}{" "}
                <button
                  className="underline"
                  onClick={() => router.refresh()}
                  type="button">
                  {t.reload}
                </button>
              </p>
            ) : null}
            {error ? (
              <p className="text-[13px] text-[#c23445]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <footer className="flex justify-end gap-2 border-t border-[#e8edf4] px-5 py-4">
            <Button
              disabled={pending}
              onClick={close}
              type="button"
              variant="outline"
              className="min-w-20 rounded-md"
              >
              {labels.createBudget.cancel}
            </Button>
            <Button
              disabled={pending || !changed || !parsed || parsed.minor <= 0n}
              onClick={() => void request("EDIT")}
              type="button"
              className="min-w-20 rounded-md"
              >
              {pending ? t.saving : t.save}
            </Button>
          </footer>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      <ResponsiveDialog
        mobilePresentation="dialog"
        onOpenChange={(open) => !open && close()}
        open={dialog === "ARCHIVE"}>
        <ResponsiveDialogContent
          className="w-[calc(100%-2rem)] max-w-md rounded-[12px] border border-[#dfe6ef] bg-white p-5"
          showCloseButton={!pending}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t.archiveTitle}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t.archiveDescription}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          {conflict ? (
            <p className="mt-3 text-[13px] text-[#c23445]" role="alert">
              {t.changed}{" "}
              <button
                className="underline"
                onClick={() => router.refresh()}
                type="button">
                {t.reload}
              </button>
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-[13px] text-[#c23445]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              disabled={pending}
              onClick={close}
              type="button"
              variant="outline"
              className="min-w-20 rounded-md"
              >
              {labels.createBudget.cancel}
            </Button>
            <Button
              disabled={pending}
              onClick={() => void request("ARCHIVE")}
              type="button"
              variant="destructive"
              className="min-w-20 rounded-md"
              >
              {pending ? t.archiving : t.archive}
            </Button>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
