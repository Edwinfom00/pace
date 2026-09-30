"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import {
  BudgetIconPicker,
  BudgetVisualIcon,
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
  budgetPeriodStart,
  formatBudgetPeriod,
  type BudgetPeriodKey,
} from "./budget-period-field";
import { BudgetAdvancedOptions } from "./budget-advanced-options";
import { BudgetCategoryRequestCache } from "./budget-category-request-cache";

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
) {
  const response = await fetch(
    `/api/workspaces/${workspaceId}/ledger/categories?parentCategoryId=${encodeURIComponent(parentCategoryId)}`,
  );
  if (!response.ok) throw new Error("Unable to load categories.");
  return ((await response.json()) as { categories: BudgetCategoryOption[] })
    .categories;
}

function categoryCacheKey(
  workspaceId: string,
  parentCategoryId: string | "root",
) {
  return `${workspaceId}:${parentCategoryId}`;
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
  const [budgetName, setBudgetName] = useState("");
  const [description, setDescription] = useState("");
  const [period, setPeriod] = useState<BudgetPeriodKey>(() =>
    budgetPeriodKey(new Date(), timeZone),
  );
  const [amountTouched, setAmountTouched] = useState(false);
  const categoryCache = useRef(
    new BudgetCategoryRequestCache<BudgetCategoryOption>(),
  );
  const selectedCategoryId = categoryScope?.categoryId;
  useEffect(() => {
    if (!open) return;
    const cached = categoryCache.current.get(
      categoryCacheKey(workspaceId, "root"),
    );
    if (cached) {
      queueMicrotask(() =>
        setRootsState({ status: "ready", categories: cached }),
      );
      return;
    }
    let cancelled = false;
    queueMicrotask(() => !cancelled && setRootsState(loadingCategories));
    void categoryCache.current
      .load(categoryCacheKey(workspaceId, "root"), () =>
        loadBudgetCategories(workspaceId, "root"),
      )
      .then(
        (categories) =>
          !cancelled && setRootsState({ status: "ready", categories }),
      )
      .catch(
        () => !cancelled && setRootsState({ status: "error", categories: [] }),
      );
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);
  useEffect(() => {
    if (!selectedCategoryId) {
      queueMicrotask(() => setChildrenState(emptyCategories));
      return;
    }
    const cached = categoryCache.current.get(
      categoryCacheKey(workspaceId, selectedCategoryId),
    );
    if (cached) {
      queueMicrotask(() =>
        setChildrenState({ status: "ready", categories: cached }),
      );
      return;
    }
    let cancelled = false;
    queueMicrotask(() => !cancelled && setChildrenState(loadingCategories));
    void categoryCache.current
      .load(categoryCacheKey(workspaceId, selectedCategoryId), () =>
        loadBudgetCategories(workspaceId, selectedCategoryId),
      )
      .then(
        (categories) =>
          !cancelled && setChildrenState({ status: "ready", categories }),
      )
      .catch(
        () =>
          !cancelled && setChildrenState({ status: "error", categories: [] }),
      );
    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId, workspaceId]);
  const t = (key: string) => labels[key] ?? "";
  const parsedAmount = useMemo(
    () => parseBudgetAmount(amount, currency),
    [amount, currency],
  );
  const selectedCategory = rootsState.categories.find(
    (category) => category.id === categoryScope?.categoryId,
  );
  const previewAmount =
    parsedAmount && parsedAmount.minor > 0n
      ? formatOverviewMoney(parsedAmount.minor, currency, locale)
      : t("previewAmountFallback");
  const previewPeriod = period
    ? formatBudgetPeriod(period, locale)
    : t("previewPeriodFallback");
  const periodStart = budgetPeriodStart(period, timeZone);
  const periodMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  const resetPeriod = periodMatch
    ? `${Number(periodMatch[1]) + (periodMatch[2] === "12" ? 1 : 0)}-${String((Number(periodMatch[2]) % 12) + 1).padStart(2, "0")}`
    : "";
  const formatDate = (value: Date | null) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone,
        }).format(value)
      : t("previewPeriodFallback");
  const previewNotice = t("notice")
    .replace("{startsOn}", formatDate(periodStart))
    .replace(
      "{resetsOn}",
      formatDate(resetPeriod ? budgetPeriodStart(resetPeriod, timeZone) : null),
    );
  const progress = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(0);
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
                  <input
                    aria-label={t("budgetName")}
                    className="h-10 w-full rounded-[8px] border border-[#dce4ef] bg-white px-3 text-[13px] text-[#263550] outline-none placeholder:text-[#71809a] focus-visible:border-[#2867e8] focus-visible:ring-2 focus-visible:ring-[#2867e8]/15"
                    onChange={(event) => setBudgetName(event.target.value)}
                    placeholder={t("budgetNameValue")}
                    value={budgetName}
                  />
                  <p className="mt-1 text-[12px] text-[#71809a]">
                    {t("budgetNameHint")}
                  </p>
                </div>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-[#263550]">
                    {t("iconAndColour")}
                  </p>
                  <BudgetIconPicker
                    labels={{
                      groupLabel: t("iconPicker"),
                      icons: {
                        food: t("iconFood"),
                        transport: t("iconTransport"),
                        shopping: t("iconShopping"),
                        home: t("iconHome"),
                        health: t("iconHealth"),
                        entertainment: t("iconEntertainment"),
                        subscriptions: t("iconSubscriptions"),
                        bills: t("iconBills"),
                        education: t("iconEducation"),
                        travel: t("iconTravel"),
                        other: t("iconOther"),
                      },
                    }}
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
                <input
                  aria-label={t("description")}
                  className="h-10 w-full rounded-[8px] border border-[#dce4ef] bg-white px-3 text-[13px] text-[#263550] outline-none placeholder:text-[#71809a] focus-visible:border-[#2867e8] focus-visible:ring-2 focus-visible:ring-[#2867e8]/15"
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("descriptionValue")}
                  value={description}
                />
              </div>
            </FormSection>
            <FormSection>
              <SectionHeading number="2" title={t("categoryScope")} />
              <BudgetCategoryScopeField
                childCategories={childrenState.categories}
                childrenState={childrenState}
                labels={{
                  category: t("mainCategory"),
                  subcategories: t("subcategories"),
                  optional: t("optional"),
                  selectCategory: t("selectCategory"),
                  selectSubcategories: t("selectSubcategories"),
                  subcategoriesHint: t("subcategoriesHint"),
                  noSubcategoriesAvailable: t("noSubcategoriesAvailable"),
                  loadingCategories: t("loadingCategories"),
                  categoryLoadError: t("categoryLoadError"),
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
                      (!parsedAmount || parsedAmount.minor <= 0n)
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
              <BudgetAdvancedOptions
                frequency="MONTHLY"
                labels={{
                  monthlyResetTitle: t("monthlyResetTitle"),
                  monthlyResetHint: t("monthlyResetHint"),
                }}
              />
            </FormSection>
          </div>
          <aside className="border-t border-[#e8edf4] bg-[#fbfcfe] p-4 sm:p-5 lg:border-t-0 lg:border-l">
            <h3 className="text-[15px] font-semibold tracking-tight text-[#14213c]">
              {t("preview")}
            </h3>
            <div className="mt-4 rounded-[10px] border border-[#e3e9f2] bg-white p-4">
              <div className="flex items-center gap-3">
                <BudgetVisualIcon
                  ariaLabel={t(
                    `icon${visualIdentity.iconKey[0].toUpperCase()}${visualIdentity.iconKey.slice(1)}`,
                  )}
                  value={visualIdentity}
                />
                <div>
                  <p className="text-[14px] font-semibold text-[#14213c]">
                    {budgetName || t("budgetNameValue")}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#71809a]">
                    {description || t("previewDescription")}
                  </p>
                </div>
              </div>
              <dl className="mt-5 space-y-2 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#71809a]">{t("category")}</dt>
                  <dd className="font-medium text-[#263550]">
                    {selectedCategory?.name ?? t("previewCategoryFallback")}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#71809a]">{t("amount")}</dt>
                  <dd className="font-medium text-[#263550]">
                    {previewAmount}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#71809a]">{t("period")}</dt>
                  <dd className="font-medium text-[#263550]">
                    {previewPeriod}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 border-t border-[#e8edf4] pt-4">
                <p className="text-[13px] font-semibold text-[#263550]">
                  {t("progressExample")}
                </p>
                <p className="mt-0.5 text-[12px] text-[#71809a]">
                  {t("notStarted")}
                </p>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#edf0f4]">
                  <span className="block h-full w-0 rounded-full bg-[#2867e8]" />
                </div>
                <div className="mt-2 flex justify-between text-[12px] text-[#71809a]">
                  <span>
                    {formatOverviewMoney(0n, currency, locale)} /{" "}
                    {previewAmount}
                  </span>
                  <span>{progress}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2 rounded-[8px] bg-[#edf4ff] p-3 text-[12px] leading-5 text-[#526987]">
              <FiInfo className="mt-0.5 size-4 shrink-0 text-[#2867e8]" />
              {previewNotice}
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
