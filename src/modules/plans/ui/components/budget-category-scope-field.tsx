"use client";

import { useEffect, useId, useState } from "react";
import { Command, CommandItem, CommandList } from "cmdk";
import { Popover } from "radix-ui";
import { FiCheck, FiChevronDown, FiX } from "react-icons/fi";

import {
  PaceSearchSelect,
  type SelectOption,
} from "@/components/pace/forms/pace-search-select";
import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import type { LedgerCategoryKind } from "@/modules/ledger/domain";
import { cn } from "@/lib/utils";

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
    | "scope"
    | "entireCategory"
    | "selectedSubcategories"
    | "subcategories"
    | "selectCategory"
    | "selectSubcategories"
    | "noSubcategoriesAvailable"
    | "loadingCategories"
    | "removeSubcategory",
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
  children,
  childrenState,
  labels,
  onScopeChange,
  roots,
  rootsState,
  scope,
}: {
  readonly children: readonly BudgetCategoryOption[];
  readonly childrenState: BudgetCategoryLoadState;
  readonly labels: BudgetCategoryScopeLabels;
  readonly onScopeChange: (scope: BudgetCategoryScope | null) => void;
  readonly roots: readonly BudgetCategoryOption[];
  readonly rootsState: BudgetCategoryLoadState;
  readonly scope: BudgetCategoryScope | null;
}) {
  const scopeLabelId = useId();
  const rootOptions = roots.map(
    (category): SelectOption => ({
      value: category.id,
      label: category.name,
      icon: <CategoryIcon category={category} />,
    }),
  );
  const hasChildren = childrenState.status === "ready" && children.length > 0;
  const [showSubcategoryPicker, setShowSubcategoryPicker] = useState(false);

  useEffect(
    () => setShowSubcategoryPicker(scope?.mode === "SUBCATEGORIES"),
    [scope?.categoryId, scope?.mode],
  );

  useEffect(() => {
    if (rootsState.status !== "ready") return;
    const sanitized = sanitizeBudgetCategoryScope(
      scope,
      roots,
      scope?.categoryId ? children : [],
    );
    if (JSON.stringify(sanitized) !== JSON.stringify(scope))
      onScopeChange(sanitized);
  }, [children, onScopeChange, roots, rootsState.status, scope]);

  useEffect(() => {
    if (
      scope &&
      childrenState.status === "ready" &&
      !children.length &&
      scope.mode !== "CATEGORY"
    ) {
      onScopeChange({
        mode: "CATEGORY",
        categoryId: scope.categoryId,
        subcategoryIds: [],
      });
    }
  }, [children.length, childrenState.status, onScopeChange, scope]);

  return (
    <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0">
        <label className="mb-1.5 block text-[13px] font-medium text-[#263550]">
          {labels.category}
        </label>
        {rootsState.status === "loading" ? (
          <FieldLoading label={labels.loadingCategories} />
        ) : (
          <PaceSearchSelect
            ariaLabel={labels.category}
            emptyLabel={labels.noSubcategoriesAvailable}
            onValueChange={(categoryId) =>
              onScopeChange({
                mode: "CATEGORY",
                categoryId,
                subcategoryIds: [],
              })
            }
            options={rootOptions}
            placeholder={labels.selectCategory}
            searchPlaceholder={labels.selectCategory}
            triggerClassName="h-10 rounded-[8px] px-3 text-[13px] font-normal"
            value={scope?.categoryId ?? ""}
          />
        )}
      </div>

      {scope ? (
        <div className="min-w-0 sm:pt-6">
          {childrenState.status === "loading" ? (
            <FieldLoading label={labels.loadingCategories} />
          ) : hasChildren ? (
            <fieldset aria-labelledby={scopeLabelId} className="min-w-0">
              <legend className="mb-1.5 block text-[13px] font-medium text-[#263550]" id={scopeLabelId}>
                {labels.scope}
              </legend>
              <div className="grid h-10 grid-cols-2 overflow-hidden rounded-[8px] border border-[#dce4ef] text-[12px]">
                <ScopeButton
                  checked={!showSubcategoryPicker}
                  label={labels.entireCategory}
                  onClick={() => {
                    setShowSubcategoryPicker(false);
                    onScopeChange({
                      mode: "CATEGORY",
                      categoryId: scope.categoryId,
                      subcategoryIds: [],
                    });
                  }}
                />
                <ScopeButton
                  checked={showSubcategoryPicker}
                  label={labels.selectedSubcategories}
                  onClick={() => setShowSubcategoryPicker(true)}
                />
              </div>
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {scope && showSubcategoryPicker && hasChildren ? (
        <div className="min-w-0 sm:col-span-2">
          <p className="mb-1.5 text-[13px] font-medium text-[#263550]">
            {labels.subcategories}
          </p>
          <SubcategorySelect
            children={children}
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

function ScopeButton({
  checked,
  label,
  onClick,
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        "flex min-w-0 items-center justify-center gap-1.5 px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2867e8]",
        checked
          ? "bg-[#e8f1ff] font-medium text-[#2867e8]"
          : "border-l border-[#dce4ef] text-[#61708a]",
      )}
      onClick={onClick}
      role="radio"
      type="button">
      <span
        aria-hidden
        className={cn(
          "size-3 rounded-full border",
          checked
            ? "border-[#2867e8] bg-[#2867e8] shadow-[inset_0_0_0_3px_white]"
            : "border-[#9aa9bd]",
        )}
      />{" "}
      <span className="truncate">{label}</span>
    </button>
  );
}

function SubcategorySelect({
  children,
  labels,
  onChange,
  selectedIds,
}: {
  readonly children: readonly BudgetCategoryOption[];
  readonly labels: BudgetCategoryScopeLabels;
  readonly onChange: (ids: readonly string[]) => void;
  readonly selectedIds: readonly string[];
}) {
  const selected = children.filter((child) => selectedIds.includes(child.id));
  const listboxId = useId();
  return (
    <div className="min-w-0">
      {selected.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((child) => (
            <span
              className="inline-flex max-w-full items-center gap-1 rounded-[6px] border border-[#dce4ef] bg-[#f6f8fb] py-1 pr-1 pl-2 text-[12px] text-[#40516d]"
              key={child.id}>
              <span className="truncate">{child.name}</span>
              <button
                aria-label={`${labels.removeSubcategory}: ${child.name}`}
                className="grid size-4 shrink-0 place-items-center rounded text-[#71809a] hover:bg-[#e7edf5] focus-visible:outline-2 focus-visible:outline-[#2867e8]"
                onClick={() =>
                  onChange(selectedIds.filter((id) => id !== child.id))
                }
                type="button">
                <FiX aria-hidden className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            aria-controls={listboxId}
            aria-haspopup="listbox"
            className="flex h-10 w-full items-center justify-between rounded-[8px] border border-[#dce4ef] bg-white px-3 text-left text-[13px] text-[#71809a] outline-none hover:border-[#bac9df] focus-visible:border-[#2867e8] focus-visible:ring-2 focus-visible:ring-[#2867e8]/15"
            type="button">
            <span>{labels.selectSubcategories}</span>
            <FiChevronDown aria-hidden className="size-4" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            className="z-50 mt-1 w-(--radix-popover-trigger-width) rounded-[8px] border border-[#dce4ef] bg-white p-1 shadow-[0_12px_28px_rgb(15_23_42/12%)]"
            sideOffset={5}>
            <Command>
              <CommandList id={listboxId} role="listbox">
                {children.map((child) => {
                  const checked = selectedIds.includes(child.id);
                  return (
                    <CommandItem
                      aria-selected={checked}
                      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-[13px] text-[#263550] data-[selected=true]:bg-[#edf3ff]"
                      key={child.id}
                      onSelect={() =>
                        onChange(
                          checked
                            ? selectedIds.filter((id) => id !== child.id)
                            : [...selectedIds, child.id],
                        )
                      }
                      value={child.name}>
                      <CategoryIcon category={child} />
                      <span className="min-w-0 flex-1 truncate">
                        {child.name}
                      </span>
                      {checked ? (
                        <FiCheck
                          aria-hidden
                          className="size-4 text-[#2867e8]"
                        />
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandList>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
