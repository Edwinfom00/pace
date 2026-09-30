"use client";

import { useEffect } from "react";

import {
  PaceSearchSelect,
  type SelectOption,
} from "@/components/pace/forms/pace-search-select";
import {
  PaceMultiSelect,
  type MultiSelectOption,
} from "@/components/pace/forms/pace-multi-select";
import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import type { LedgerCategoryKind } from "@/modules/ledger/domain";

export type BudgetCategoryOption = {
  readonly id: string;
  readonly name: string;
  readonly kind: LedgerCategoryKind;
  readonly systemKey: string | null;
  readonly parentCategoryId: string | null;
};

export type BudgetCategoryScope =
  | {
      readonly mode: "CATEGORY";
      readonly categoryId: string;
      readonly subcategoryIds: readonly [];
    }
  | {
      readonly mode: "SUBCATEGORIES";
      readonly categoryId: string;
      readonly subcategoryIds: readonly string[];
    };

export type BudgetCategoryLoadState =
  | { readonly status: "loading"; readonly categories: readonly [] }
  | {
      readonly status: "ready";
      readonly categories: readonly BudgetCategoryOption[];
    }
  | { readonly status: "error"; readonly categories: readonly [] };

export type BudgetCategoryScopeLabels = Readonly<
  Record<
    | "category"
    | "subcategories"
    | "optional"
    | "selectCategory"
    | "selectSubcategories"
    | "subcategoriesHint"
    | "noSubcategoriesAvailable"
    | "loadingCategories"
    | "categoryLoadError",
    string
  >
>;

export function sanitizeBudgetCategoryScope(
  scope: BudgetCategoryScope | null,
  roots: readonly BudgetCategoryOption[],
  children: readonly BudgetCategoryOption[],
): BudgetCategoryScope | null {
  if (!scope || !roots.some((category) => category.id === scope.categoryId))
    return null;
  if (scope.mode === "CATEGORY")
    return {
      mode: "CATEGORY",
      categoryId: scope.categoryId,
      subcategoryIds: [],
    };
  const childIds = new Set(children.map((category) => category.id));
  const subcategoryIds = [...new Set(scope.subcategoryIds)].filter((id) =>
    childIds.has(id),
  );
  return subcategoryIds.length
    ? { mode: "SUBCATEGORIES", categoryId: scope.categoryId, subcategoryIds }
    : { mode: "CATEGORY", categoryId: scope.categoryId, subcategoryIds: [] };
}

export function BudgetCategoryScopeField({
  childCategories,
  childrenState,
  labels,
  onScopeChange,
  roots,
  rootsState,
  scope,
}: {
  readonly childCategories: readonly BudgetCategoryOption[];
  readonly childrenState: BudgetCategoryLoadState;
  readonly labels: BudgetCategoryScopeLabels;
  readonly onScopeChange: (scope: BudgetCategoryScope | null) => void;
  readonly roots: readonly BudgetCategoryOption[];
  readonly rootsState: BudgetCategoryLoadState;
  readonly scope: BudgetCategoryScope | null;
}) {
  const rootOptions = roots.map(
    (category): SelectOption => ({
      value: category.id,
      label: category.name,
      icon: <CategoryIcon category={category} />,
    }),
  );
  const hasChildren =
    childrenState.status === "ready" && childCategories.length > 0;

  useEffect(() => {
    if (rootsState.status !== "ready") return;
    const sanitized = sanitizeBudgetCategoryScope(
      scope,
      roots,
      scope?.categoryId ? childCategories : [],
    );
    if (JSON.stringify(sanitized) !== JSON.stringify(scope))
      onScopeChange(sanitized);
  }, [childCategories, onScopeChange, roots, rootsState.status, scope]);

  useEffect(() => {
    if (
      scope &&
      childrenState.status === "ready" &&
      !childCategories.length &&
      scope.mode !== "CATEGORY"
    ) {
      onScopeChange({
        mode: "CATEGORY",
        categoryId: scope.categoryId,
        subcategoryIds: [],
      });
    }
  }, [childCategories.length, childrenState.status, onScopeChange, scope]);

  return (
    <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
      <div className="min-w-0">
        <label className="mb-1.5 block text-[13px] font-medium text-[#263550]">
          {labels.category}
        </label>
        {rootsState.status === "loading" ? (
          <FieldLoading label={labels.loadingCategories} />
        ) : rootsState.status === "error" ? (
          <FieldError label={labels.categoryLoadError} />
        ) : (
          <PaceSearchSelect
            ariaLabel={labels.category}
            emptyLabel={labels.noSubcategoriesAvailable}
            onValueChange={(categoryId) => {
              onScopeChange({
                mode: "CATEGORY",
                categoryId,
                subcategoryIds: [],
              });
            }}
            options={rootOptions}
            placeholder={labels.selectCategory}
            searchPlaceholder={labels.selectCategory}
            triggerClassName="h-10 rounded-[8px] px-3 text-[13px] font-normal"
            value={scope?.categoryId ?? ""}
          />
        )}
      </div>

      {scope ? (
        <div className="min-w-0">
          {childrenState.status === "loading" ? (
            <>
              <label className="mb-1.5 block text-[13px] font-medium text-[#263550]">
                {labels.subcategories}{" "}
                <span className="font-normal text-[#71809a]">
                  {labels.optional}
                </span>
              </label>
              <FieldLoading label={labels.loadingCategories} />
            </>
          ) : childrenState.status === "error" ? (
            <FieldError label={labels.categoryLoadError} />
          ) : hasChildren ? (
            <div className="min-w-0">
              <label className="mb-1.5 block text-[13px] font-medium text-[#263550]">
                {labels.subcategories}{" "}
                <span className="font-normal text-[#71809a]">
                  {labels.optional}
                </span>
              </label>
              <SubcategorySelect
                categories={childCategories}
                labels={labels}
                onChange={(subcategoryIds) =>
                  onScopeChange(
                    subcategoryIds.length
                      ? {
                          mode: "SUBCATEGORIES",
                          categoryId: scope.categoryId,
                          subcategoryIds,
                        }
                      : {
                          mode: "CATEGORY",
                          categoryId: scope.categoryId,
                          subcategoryIds: [],
                        },
                  )
                }
                selectedIds={
                  scope.mode === "SUBCATEGORIES" ? scope.subcategoryIds : []
                }
              />
              <p className="mt-1.5 text-[12px] leading-4 text-[#71809a]">
                {labels.subcategoriesHint}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CategoryIcon({
  category,
}: {
  readonly category: BudgetCategoryOption;
}) {
  return (
    <TransactionIcon
      categoryKey={category.systemKey}
      categoryName={category.name}
      decorative
      size="sm"
      transactionKind={category.kind}
    />
  );
}

function FieldLoading({ label }: { readonly label: string }) {
  return (
    <div
      aria-busy="true"
      className="flex h-10 items-center rounded-[8px] border border-[#dce4ef] bg-[#f8faff] px-3">
      <span className="h-3 w-28 animate-pulse rounded bg-[#e7edf6] motion-reduce:animate-none" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function FieldError({ label }: { readonly label: string }) {
  return (
    <p className="text-[12px] leading-5 text-[#c23445]" role="alert">
      {label}
    </p>
  );
}

function SubcategorySelect({
  categories,
  labels,
  onChange,
  selectedIds,
}: {
  readonly categories: readonly BudgetCategoryOption[];
  readonly labels: BudgetCategoryScopeLabels;
  readonly onChange: (ids: readonly string[]) => void;
  readonly selectedIds: readonly string[];
}) {
  const options = categories.map(
    (category): MultiSelectOption => ({
      value: category.id,
      label: category.name,
      icon: <CategoryIcon category={category} />,
    }),
  );
  return (
    <div className="min-w-0">
      <PaceMultiSelect
        ariaLabel={labels.subcategories}
        emptyLabel={labels.noSubcategoriesAvailable}
        onValueChange={onChange}
        options={options}
        placeholder={labels.selectSubcategories}
        searchPlaceholder={labels.selectSubcategories}
        value={selectedIds}
      />
    </div>
  );
}
