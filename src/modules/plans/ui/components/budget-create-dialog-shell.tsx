"use client";

import { useEffect, useState } from "react";

import { FiInfo, FiShoppingBag, FiX } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import type { PlansUiLabels } from "../plans-ui-labels";
import {
  BudgetIconPicker,
  DEFAULT_BUDGET_VISUAL_IDENTITY,
  type BudgetVisualIdentity,
} from "./budget-icon-picker";
import {
  BudgetCategoryScopeField,
  type BudgetCategoryLoadState,
  type BudgetCategoryOption,
  type BudgetCategoryScope,
} from "./budget-category-scope-field";
import { BudgetAmountField, parseBudgetAmount } from "./budget-amount-field";
import {
  BudgetPeriodField,
  budgetPeriodKey,
  type BudgetPeriodKey,
} from "./budget-period-field";

const loadingCategories: BudgetCategoryLoadState = {
  status: "loading",
  categories: [],
};
const emptyCategories: BudgetCategoryLoadState = {
  status: "ready",
  categories: [],
};

async function loadBudgetCategories(
  workspaceId: string,
  parentCategoryId: string | "root",
  signal: AbortSignal,
) {
  const response = await fetch(
    `/api/workspaces/${workspaceId}/ledger/categories?parentCategoryId=${encodeURIComponent(parentCategoryId)}`,
    { signal },
  );
  if (!response.ok) throw new Error("Unable to load categories.");
  return ((await response.json()) as { categories: BudgetCategoryOption[] })
    .categories;
}

function SectionHeading({
  number,
  title,
}: {
  readonly number: string;
  readonly title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-6 place-items-center rounded-full bg-[#e7f0ff] text-[13px] font-semibold text-[#2867e8]">
        {number}
      </span>
      <h3 className="text-[15px] font-semibold tracking-tight text-[#14213c]">
        {title}
      </h3>
    </div>
  );
}

function FieldPlaceholder({
  children,
  className = "",
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={`flex h-10 items-center rounded-[8px] border border-[#dce4ef] bg-white px-3 text-[13px] text-[#526987] ${className}`}>
      {children}
    </div>
  );
}

function FormSection({
  children,
  className = "",
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      className={`border-b border-[#e8edf4] px-5 py-5 sm:px-7 ${className}`}>
      {children}
    </section>
  );
}

export function BudgetCreateDialogShell({
  labels,
  onOpenChange,
  open,
  currency,
  locale,
  timeZone,
  workspaceId,
}: {
  readonly labels: PlansUiLabels["createBudget"];
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly currency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  const [visualIdentity, setVisualIdentity] = useState<BudgetVisualIdentity>(
    DEFAULT_BUDGET_VISUAL_IDENTITY,
  );
  const [categoryScope, setCategoryScope] =
    useState<BudgetCategoryScope | null>(null);
  const [rootsState, setRootsState] =
    useState<BudgetCategoryLoadState>(emptyCategories);
  const [childrenState, setChildrenState] =
    useState<BudgetCategoryLoadState>(emptyCategories);
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<BudgetPeriodKey>(() =>
    budgetPeriodKey(new Date(), timeZone),
  );
  const [amountTouched, setAmountTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setRootsState(loadingCategories);
    void loadBudgetCategories(workspaceId, "root", controller.signal)
      .then(
        (categories) =>
          !controller.signal.aborted &&
          setRootsState({ status: "ready", categories }),
      )
      .catch(
        () =>
          !controller.signal.aborted &&
          setRootsState({ status: "error", categories: [] }),
      );
    return () => controller.abort();
  }, [open, workspaceId]);
  useEffect(() => {
    if (!categoryScope) {
      setChildrenState(emptyCategories);
      return;
    }
    const controller = new AbortController();
    setChildrenState(loadingCategories);
    void loadBudgetCategories(
      workspaceId,
      categoryScope.categoryId,
      controller.signal,
    )
      .then(
        (categories) =>
          !controller.signal.aborted &&
          setChildrenState({ status: "ready", categories }),
      )
      .catch(
        () =>
          !controller.signal.aborted &&
          setChildrenState({ status: "error", categories: [] }),
      );
    return () => controller.abort();
  }, [categoryScope?.categoryId, workspaceId]);
  const t = (key: string) => labels[key] ?? "";
  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent
        className="flex! max-h-[calc(100dvh-1rem)]! min-h-0 w-[calc(100%-1rem)]! max-w-265! flex-col gap-0 overflow-hidden rounded-[12px] border border-[#dfe6ef] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] lg:max-h-[calc(100dvh-3rem)] lg:w-[calc(100%-3rem)]"
        drawerClassName="w-full max-w-none rounded-none rounded-t-[14px] border-x-0 border-b-0 shadow-[0_-12px_32px_rgb(15_23_42/12%)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)]">
        <ResponsiveDialogClose>
          <Button
            aria-label={t("close")}
            className="absolute top-4 right-4 z-10 size-8 rounded-[7px] text-[#61708a] hover:bg-[#f3f6fa]"
            size="icon"
            type="button"
            variant="ghost">
            <FiX className="size-4" />
          </Button>
        </ResponsiveDialogClose>
        <ResponsiveDialogHeader className="gap-1 border-b border-[#e8edf4] px-5 pt-5 pb-4 pr-14 sm:px-7 sm:pt-6">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-[10px] bg-[#fff0eb] text-[#ff6b35]">
              <FiShoppingBag className="size-5" />
            </span>
            <div>
              <ResponsiveDialogTitle className="text-[21px] leading-6 font-semibold tracking-tight text-[#101a35]">
                {t("title")}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className="mt-1 text-[13px] leading-5 text-[#71809a]">
                {t("subtitle")}
              </ResponsiveDialogDescription>
            </div>
          </div>
        </ResponsiveDialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:grid lg:grid-cols-[minmax(0,1.8fr)_minmax(330px,1fr)]">
          <div className="min-w-0">
            <FormSection>
              <SectionHeading number="1" title={t("basicInfo")} />
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]">
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-[#263550]">
                    {t("budgetName")}
                  </p>
                  <FieldPlaceholder>{t("budgetNameValue")}</FieldPlaceholder>
                  <p className="mt-1 text-[12px] text-[#71809a]">
                    {t("budgetNameHint")}
                  </p>
                </div>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-[#263550]">
                    {t("iconAndColour")}
                  </p>
                  <BudgetIconPicker
                    onChange={setVisualIdentity}
                    value={visualIdentity}
                  />
                </div>
              </div>
              <div className="mt-3">
                <p className="mb-1.5 text-[13px] font-medium text-[#263550]">
                  {t("description")}{" "}
                  <span className="font-normal text-[#71809a]">
                    {t("optional")}
                  </span>
                </p>
                <FieldPlaceholder>{t("descriptionValue")}</FieldPlaceholder>
              </div>
            </FormSection>
            <FormSection>
              <SectionHeading number="2" title={t("categoryScope")} />
              <BudgetCategoryScopeField
                children={childrenState.categories}
                childrenState={childrenState}
                labels={{
                  category: t("category"),
                  scope: t("scope"),
                  entireCategory: t("entireCategory"),
                  selectedSubcategories: t("selectedSubcategories"),
                  subcategories: t("subcategories"),
                  selectCategory: t("selectCategory"),
                  selectSubcategories: t("selectSubcategories"),
                  noSubcategoriesAvailable: t("noSubcategoriesAvailable"),
                  loadingCategories: t("loadingCategories"),
                  removeSubcategory: t("removeSubcategory"),
                }}
                onScopeChange={setCategoryScope}
                roots={rootsState.categories}
                rootsState={rootsState}
                scope={categoryScope}
              />
            </FormSection>
            <FormSection>
              <SectionHeading number="3" title={t("amountPeriod")} />
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div onBlur={() => setAmountTouched(true)}>
                  <BudgetAmountField
                    currency={currency}
                    error={
                      amountTouched &&
                      (!parseBudgetAmount(amount, currency) ||
                        parseBudgetAmount(amount, currency)!.minor <= 0n)
                        ? t("invalidAmount")
                        : undefined
                    }
                    helperText={t("amountHint")}
                    label={t("budgetAmount")}
                    onChange={setAmount}
                    value={amount}
                  />
                </div>
                <BudgetPeriodField
                  error={period ? undefined : t("invalidPeriod")}
                  label={t("period")}
                  locale={locale}
                  onChange={setPeriod}
                  period={period}
                  selectPeriod={t("selectPeriod")}
                  timeZone={timeZone}
                />
              </div>
            </FormSection>
            <FormSection className="border-b-0">
              <SectionHeading number="4" title={t("advancedOptions")} />
              <div className="mt-3 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 h-5 w-10 rounded-full bg-[#2867e8] p-0.5">
                    <span className="block ml-auto size-4 rounded-full bg-white" />
                  </span>
                  <p className="text-[13px] font-medium text-[#263550]">
                    {t("notifyTitle")}
                    <br />
                    <span className="font-normal text-[#71809a]">
                      {t("notifyHint")}
                    </span>
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 h-5 w-10 rounded-full bg-[#cbd5e3] p-0.5">
                    <span className="block size-4 rounded-full bg-white" />
                  </span>
                  <p className="text-[13px] font-medium text-[#263550]">
                    {t("resetTitle")}
                    <br />
                    <span className="font-normal text-[#71809a]">
                      {t("resetHint")}
                    </span>
                  </p>
                </div>
              </div>
            </FormSection>
          </div>
          <aside className="border-t border-[#e8edf4] bg-[#fbfcfe] p-4 sm:p-5 lg:border-t-0 lg:border-l">
            <h3 className="text-[15px] font-semibold tracking-tight text-[#14213c]">
              {t("preview")}
            </h3>
            <div className="mt-4 rounded-[10px] border border-[#e3e9f2] bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-[9px] bg-[#fff0eb] text-[#ff6b35]">
                  <FiShoppingBag className="size-5" />
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-[#14213c]">
                    {t("budgetNameValue")}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#71809a]">
                    {t("previewDescription")}
                  </p>
                </div>
              </div>
              <dl className="mt-5 space-y-2 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#71809a]">{t("category")}</dt>
                  <dd className="font-medium text-[#263550]">
                    {t("budgetNameValue")}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#71809a]">{t("amount")}</dt>
                  <dd className="font-medium text-[#263550]">
                    {t("amountValue")} {t("currency")}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#71809a]">{t("period")}</dt>
                  <dd className="font-medium text-[#263550]">{t("monthly")}</dd>
                </div>
              </dl>
              <div className="mt-5 border-t border-[#e8edf4] pt-4">
                <p className="text-[13px] font-semibold text-[#263550]">
                  {t("progressExample")}
                </p>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#edf0f4]">
                  <span className="block h-full w-[72%] rounded-full bg-[#ff969d]" />
                </div>
                <div className="mt-2 flex justify-between text-[12px] text-[#71809a]">
                  <span>{t("progressValue")}</span>
                  <span>72%</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2 rounded-[8px] bg-[#edf4ff] p-3 text-[12px] leading-5 text-[#526987]">
              <FiInfo className="mt-0.5 size-4 shrink-0 text-[#2867e8]" />
              {t("notice")}
            </div>
          </aside>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[#e7ecf3] bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-7 sm:py-4">
          <ResponsiveDialogClose>
            <Button
              className="h-9 rounded-[8px] border-[#dce4ef] px-3.5 text-[13px] text-[#263550]"
              type="button"
              variant="outline">
              {t("cancel")}
            </Button>
          </ResponsiveDialogClose>
          <Button
            className="h-9 rounded-[8px] bg-[#2867e8] px-3.5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1]"
            type="button">
            {t("create")}
          </Button>
        </footer>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
