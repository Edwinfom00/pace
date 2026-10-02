"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiArrowLeft, FiArrowRight, FiInbox, FiPlus, FiTag, FiTrash2, FiX, FiZap } from "react-icons/fi";

import { PaceSearchSelect, type SelectOption } from "@/components/pace/forms/pace-search-select";
import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { RULE_ACTION_TYPES, type RuleActionType } from "@/modules/plans/rules/domain";
import { MAX_RULE_CONDITIONS, MAX_RULE_PRIORITY, MIN_RULE_PRIORITY } from "@/modules/plans/rules/rule-contract";
import {
  applyTriggerPreset,
  conditionDraftFor,
  conditionDraftIssue,
  createEmptyRuleDraft,
  isEmptinessOperator,
  isRuleDefinitionReady,
  isRuleStepValid,
  RULE_BUILDER_STEPS,
  RULE_TRIGGER_PRESETS,
  ruleCreatePayload,
  ruleDraftFingerprint,
  ruleDraftFromRule,
  ruleUpdatePayload,
  triggerPresetFor,
  validateRuleDraft,
  type RuleBuilderStep,
  type RuleConditionDraft,
  type RuleDraft,
} from "@/modules/plans/rules/rule-draft";
import type { RuleDraftDryRunResult } from "@/modules/plans/rules/rule-service";
import type { RuleBuilderReferences, RuleListItem, RuleReferenceNames } from "@/modules/plans/rules/rules-overview";
import { cn } from "@/lib/utils";

import { fillLabel, ruleCategoryOptionLabel, ruleLabel } from "../rules-format";
import type { RulesUiLabels } from "../rules-ui-labels";
import {
  RULE_TRIGGER_ICONS,
  RuleIconTile,
  RuleInfoCallout,
  RulePreviewPanel,
  RuleSectionTitle,
  RuleSegmented,
  RuleToggleRow,
} from "./rule-builder-visuals";
import { RuleBuilderStepper } from "./rule-builder-stepper";
import { RULE_INPUT, RuleConditionEditor, RuleFieldError, ruleValueOptions } from "./rule-condition-editor";
import { RuleDryRunPanel, type RuleDryRunState } from "./rule-dry-run-panel";

export type RuleBuilderMode = { readonly kind: "create" } | { readonly kind: "edit"; readonly rule: RuleListItem };

type SaveError = "STALE" | "INVALID" | "FAILED" | null;
type DryRunRecord = { readonly fingerprint: string | null; readonly state: RuleDryRunState };

const PRIMARY =
  "h-9 gap-1.5 rounded-[8px] bg-[#2867e8] px-3.5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1]";
const SECONDARY = "h-9 gap-1.5 rounded-[8px] border-[#dce4ef] px-3.5 text-[13px] text-[#263550]";
const FIELD_LABEL = "mb-1.5 block text-[13px] font-medium text-[#263550]";
const DRY_RUN_DEBOUNCE_MS = 300;

export function ruleReferenceNames(references: Pick<RuleBuilderReferences, "accounts" | "categories">): RuleReferenceNames {
  return {
    categories: new Map(references.categories.map((category) => [category.id, { name: category.name, key: category.key }])),
    accounts: new Map(references.accounts.map((account) => [account.id, account.name])),
  };
}

export function suggestRuleName(draft: RuleDraft, labels: RulesUiLabels, references: RuleBuilderReferences): string {
  const trigger = draft.trigger;
  let subject: string;
  if (isEmptinessOperator(trigger.operator)) {
    const preset = triggerPresetFor(trigger);
    subject =
      preset && preset.operator === trigger.operator
        ? ruleLabel(labels, `preset${preset.id}`)
        : `${ruleLabel(labels, `field${trigger.field}`)} ${ruleLabel(labels, `op${trigger.operator}`)}`;
  } else if (trigger.field === "COUNTERPARTY" || trigger.field === "NOTE") {
    const text = trigger.text.trim().replaceAll(/\s+/g, " ");
    subject = text.charAt(0).toLocaleUpperCase() + text.slice(1);
  } else {
    const options = new Map(ruleValueOptions(trigger.field, labels, references).map((option) => [option.value, option.label]));
    const names = trigger.values.map((value) => options.get(value) ?? labels.unavailableReference);
    subject = names.length > 2 ? `${names.slice(0, 2).join(", ")}…` : names.join(", ");
  }
  const category = references.categories.find((item) => item.id === draft.action.categoryId);
  const target = draft.action.type === "ROUTE_FOR_REVIEW" ? labels.needsReview : (category?.name ?? labels.unavailableReference);
  return `${subject} → ${target}`.slice(0, 160);
}

export function RuleBuilderDialog({
  labels,
  locale,
  mode,
  onOpenChange,
  onSaved,
  onStale,
  open,
  references,
  timeZone,
  workspaceId,
}: {
  readonly labels: RulesUiLabels;
  readonly locale: string;
  readonly mode: RuleBuilderMode;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: (ruleId: string) => void;
  readonly onStale: () => void;
  readonly open: boolean;
  readonly references: RuleBuilderReferences;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<RuleDraft>(() =>
    mode.kind === "edit" ? ruleDraftFromRule(mode.rule) : createEmptyRuleDraft(references.suggestedPriority),
  );
  const [step, setStep] = useState<RuleBuilderStep>("TRIGGER");
  const [attempted, setAttempted] = useState<ReadonlySet<RuleBuilderStep>>(new Set());
  const [visited, setVisited] = useState<ReadonlySet<RuleBuilderStep>>(new Set(["TRIGGER"]));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveError>(null);
  const [dryRun, setDryRun] = useState<DryRunRecord>({ fingerprint: null, state: { status: "idle" } });
  const idempotency = useRef<{ readonly fingerprint: string; readonly key: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const names = useMemo(() => ruleReferenceNames(references), [references]);
  const issues = validateRuleDraft(draft);
  const stepIndex = RULE_BUILDER_STEPS.indexOf(step);
  const ready = isRuleDefinitionReady(draft);
  const fingerprint = ready ? ruleDraftFingerprint(draft) : null;
  const editing = mode.kind === "edit";
  const editRuleId = mode.kind === "edit" ? mode.rule.id : null;

  const completed = new Set(RULE_BUILDER_STEPS.filter((item) => visited.has(item) && isRuleStepValid(item, issues)));
  const reachable = new Set<RuleBuilderStep>();
  for (const item of RULE_BUILDER_STEPS) {
    reachable.add(item);
    if (!isRuleStepValid(item, issues) || (!visited.has(item) && item !== step)) break;
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step !== "REVIEW" || !fingerprint || dryRun.fingerprint === fingerprint) return;
    const controller = new AbortController();
    const { definition, priority } = JSON.parse(fingerprint) as { definition: unknown; priority: number | null };
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/plans/rules/dry-run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            definition,
            ...(priority === null ? {} : { priority }),
            ...(editRuleId ? { ruleId: editRuleId } : {}),
          }),
        });
        if (!response.ok) throw new Error("dry run failed");
        const payload = (await response.json()) as { dryRun: RuleDraftDryRunResult };
        setDryRun({ fingerprint, state: { status: "ready", result: payload.dryRun } });
      } catch {
        if (!controller.signal.aborted) setDryRun({ fingerprint, state: { status: "error" } });
      }
    }, DRY_RUN_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [dryRun.fingerprint, editRuleId, fingerprint, step, workspaceId]);

  const dryRunState: RuleDryRunState =
    fingerprint && dryRun.fingerprint === fingerprint ? dryRun.state : { status: "loading" };

  const update = (next: Partial<RuleDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setSaveError(null);
  };
  const updateCondition = (key: string, condition: RuleConditionDraft) =>
    update({ conditions: draft.conditions.map((item) => (item.key === key ? condition : item)) });

  const goTo = (target: RuleBuilderStep) => {
    if (target === "REVIEW" && !draft.nameEdited) update({ name: suggestRuleName(draft, labels, references) });
    setVisited((current) => new Set([...current, target]));
    setStep(target);
  };
  const next = () => {
    if (!isRuleStepValid(step, issues)) {
      setAttempted((current) => new Set([...current, step]));
      return;
    }
    const target = RULE_BUILDER_STEPS[stepIndex + 1];
    if (target) goTo(target);
  };
  const back = () => {
    const target = RULE_BUILDER_STEPS[stepIndex - 1];
    if (target) setStep(target);
  };

  const submit = async () => {
    if (saving) return;
    setAttempted(new Set(RULE_BUILDER_STEPS));
    const invalid = RULE_BUILDER_STEPS.find((item) => !isRuleStepValid(item, issues));
    if (invalid) {
      goTo(invalid);
      return;
    }
    const payloadFingerprint = JSON.stringify({ draft: ruleDraftFingerprint(draft), name: draft.name, enabled: draft.enabled });
    if (idempotency.current?.fingerprint !== payloadFingerprint)
      idempotency.current = { fingerprint: payloadFingerprint, key: crypto.randomUUID() };
    const key = idempotency.current.key;
    const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/plans/rules`;
    let request: { url: string; method: string; body: unknown };
    if (mode.kind === "edit") {
      const body = ruleUpdatePayload(mode.rule, draft, key);
      if (!("name" in body) && !("priority" in body) && !("conditions" in body)) {
        onSaved(mode.rule.id);
        return;
      }
      request = { url: `${base}/${encodeURIComponent(mode.rule.id)}`, method: "PUT", body };
    } else {
      request = { url: base, method: "POST", body: ruleCreatePayload(draft, key) };
    }
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { code?: string } | null;
        if (payload?.code === "RULE_CHANGED" || payload?.code === "RULE_ARCHIVED") setSaveError("STALE");
        else if (response.status === 400 || payload?.code) setSaveError("INVALID");
        else setSaveError("FAILED");
        return;
      }
      const payload = (await response.json()) as { rule: { id: string } };
      idempotency.current = null;
      onSaved(payload.rule.id);
    } catch {
      setSaveError("FAILED");
    } finally {
      setSaving(false);
    }
  };

  const triggerPreset = triggerPresetFor(draft.trigger);
  const showIssues = attempted.has(step);
  const previewName = draft.nameEdited
    ? draft.name
    : conditionDraftIssue(draft.trigger)
      ? ""
      : suggestRuleName(draft, labels, references);

  return (
    <ResponsiveDialog
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen);
      }}
      open={open}
    >
      <ResponsiveDialogContent
        className="flex! max-h-[calc(100dvh-1rem)]! min-h-0 w-[calc(100%-1rem)]! max-w-265! flex-col gap-0 overflow-hidden rounded-[12px] border border-[#dfe6ef] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] lg:h-[min(48rem,calc(100dvh-3rem))] lg:max-h-[calc(100dvh-3rem)]! lg:w-[calc(100%-3rem)]!"
        drawerClassName="w-full max-w-none rounded-none rounded-t-[14px] border-x-0 border-b-0 shadow-[0_-12px_32px_rgb(15_23_42/12%)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)]"
        showCloseButton={false}
      >
        <ResponsiveDialogClose>
          <Button
            aria-label={labels.close}
            className="absolute top-4 right-4 z-10 size-9 rounded-[8px] border border-[#e1e7f0] text-[#61708a] hover:bg-[#f3f6fa]"
            disabled={saving}
            size="icon"
            type="button"
            variant="ghost"
          >
            <FiX aria-hidden className="size-4" />
          </Button>
        </ResponsiveDialogClose>
        <ResponsiveDialogHeader className="gap-1 px-5 pt-5 pr-16 pb-4 sm:px-7 sm:pt-6">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-[10px] bg-[#e7f0ff] text-[#2867e8]">
              <FiZap className="size-5" />
            </span>
            <div className="min-w-0">
              <ResponsiveDialogTitle className="text-[21px] leading-6 font-semibold tracking-tight text-[#101a35]">
                {editing ? labels.editRuleTitle : labels.newRuleTitle}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className="mt-1 text-[13px] leading-5 text-[#71809a]">
                {ruleLabel(labels, `builderSubtitle${step}`)}
              </ResponsiveDialogDescription>
            </div>
          </div>
        </ResponsiveDialogHeader>
        <div className="shrink-0 border-y border-[#e8edf4] bg-[#fbfcfe] px-5 py-2.5 sm:px-7">
          <RuleBuilderStepper
            completed={completed}
            current={step}
            disabled={saving}
            labels={labels}
            onSelect={goTo}
            reachable={reachable}
          />
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:grid lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]"
          data-rule-builder={mode.kind}
          data-step-panel={step}
        >
          <div className="min-w-0 px-5 py-5 sm:px-7">
            <h3 className="sr-only" id={`${id}-step`} ref={headingRef} tabIndex={-1}>
              {fillLabel(labels.stepProgress, { current: stepIndex + 1, total: RULE_BUILDER_STEPS.length })}:{" "}
              {ruleLabel(labels, `step${step}`)}
            </h3>

            {step === "TRIGGER" ? (
              <div className="space-y-6">
                <section>
                  <RuleSectionTitle hint={labels.triggerEvent} id={`${id}-trigger-title`} title={labels.triggerOptionsTitle} />
                  <div aria-labelledby={`${id}-trigger-title`} className="grid gap-2 md:grid-cols-2" role="radiogroup">
                    {RULE_TRIGGER_PRESETS.map((preset) => {
                      const selected = triggerPreset?.id === preset.id;
                      return (
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-[10px] border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[#2867e8]",
                            selected ? "border-[#2867e8] bg-[#f5f9ff]" : "border-[#e3e9f2] bg-white hover:border-[#c9d4e3]",
                          )}
                          data-preset={preset.id}
                          data-selected={selected}
                          key={preset.id}
                        >
                          <RuleIconTile icon={RULE_TRIGGER_ICONS[preset.id]} selected={selected} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-[#14213c]">{ruleLabel(labels, `preset${preset.id}`)}</span>
                            <span className="mt-0.5 block text-[12px] leading-[1.15rem] text-[#71809a]">
                              {ruleLabel(labels, `presetHint${preset.id}`)}
                            </span>
                          </span>
                          <input
                            checked={selected}
                            className="mt-0.5 size-4 shrink-0 accent-[#2867e8]"
                            name={`${id}-trigger`}
                            onChange={() => update({ trigger: applyTriggerPreset(draft.trigger, preset) })}
                            type="radio"
                          />
                        </label>
                      );
                    })}
                  </div>
                </section>
                {triggerPreset ? (
                  <section className="border-t border-[#e8edf4] pt-5" data-trigger-config={triggerPreset.id}>
                    <RuleSectionTitle title={labels.triggerValueTitle} />
                    <RuleConditionEditor
                      allowFieldChange={false}
                      condition={draft.trigger}
                      issue={issues.trigger}
                      labels={labels}
                      legend={ruleLabel(labels, `preset${triggerPreset.id}`)}
                      onChange={(trigger) => update({ trigger })}
                      references={references}
                      showIssue={showIssues}
                    />
                  </section>
                ) : null}
              </div>
            ) : null}

            {step === "CONDITIONS" ? (
              <div className="space-y-4">
                <RuleSectionTitle hint={labels.allConditionsHint} title={labels.conditionsTitle} />
                {draft.conditions.length ? (
                  <ol className="space-y-3">
                    {draft.conditions.map((condition, index) => (
                      <li className="rounded-[10px] border border-[#e3e9f2] bg-white p-3.5" key={condition.key}>
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold text-[#14213c]">
                            {fillLabel(labels.conditionNumber, { index: index + 1 })}
                          </span>
                          <button
                            aria-label={fillLabel(labels.removeCondition, { index: index + 1 })}
                            className="grid size-8 place-items-center rounded-[8px] border border-[#e1e7f0] text-[#61708a] hover:border-[#f0c4ca] hover:bg-[#fdf1f3] hover:text-[#c23445] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2867e8]"
                            onClick={() => update({ conditions: draft.conditions.filter((item) => item.key !== condition.key) })}
                            type="button"
                          >
                            <FiTrash2 aria-hidden className="size-4" />
                          </button>
                        </div>
                        <RuleConditionEditor
                          allowFieldChange
                          condition={condition}
                          issue={issues.conditions[condition.key] ?? null}
                          labels={labels}
                          legend={fillLabel(labels.conditionNumber, { index: index + 1 })}
                          onChange={(changed) => updateCondition(condition.key, changed)}
                          references={references}
                          showIssue={showIssues}
                        />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="rounded-[10px] border border-dashed border-[#d9e1ec] bg-[#fbfcfe] px-4 py-6 text-center text-[13px] text-[#71809a]">
                    {labels.noExtraConditions}
                  </p>
                )}
                <button
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] text-[13px] font-medium text-[#2867e8] hover:text-[#1e55d1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2867e8] disabled:text-[#9aa7bb]"
                  disabled={draft.conditions.length + 1 >= MAX_RULE_CONDITIONS}
                  onClick={() => update({ conditions: [...draft.conditions, conditionDraftFor("TRANSACTION_KIND")] })}
                  type="button"
                >
                  <FiPlus aria-hidden className="size-4" />
                  {labels.addCondition}
                </button>
                <RuleFieldError id={`${id}-limit`} issue={issues.conditionsLimit} labels={labels} />
              </div>
            ) : null}

            {step === "ACTION" ? (
              <div className="space-y-5">
                <section>
                  <RuleSectionTitle title={labels.actionTitle} />
                  <RuleSegmented<RuleActionType>
                    label={labels.actionTypeLabel}
                    labelHidden
                    onChange={(type) => update({ action: { ...draft.action, type } })}
                    options={RULE_ACTION_TYPES.map((type) => ({
                      value: type,
                      label: ruleLabel(labels, `action${type}`),
                      icon: type === "ROUTE_FOR_REVIEW" ? FiInbox : FiTag,
                    }))}
                    size="lg"
                    value={draft.action.type}
                  />
                  <p className="mt-2 text-[12px] leading-5 text-[#71809a]">{ruleLabel(labels, `actionHint${draft.action.type}`)}</p>
                </section>
                {draft.action.type === "ASSIGN_CATEGORY" ? (
                  <CategoryField
                    issue={showIssues ? issues.action : null}
                    labels={labels}
                    onChange={(categoryId) => update({ action: { type: "ASSIGN_CATEGORY", categoryId } })}
                    references={references}
                    value={draft.action.categoryId}
                  />
                ) : null}
              </div>
            ) : null}

            {step === "REVIEW" ? (
              <div className="space-y-6">
                <section>
                  <RuleSectionTitle title={labels.nameSectionTitle} />
                  <ReviewFields draft={draft} issues={issues} labels={labels} onChange={update} showIssues={showIssues} />
                  <div className="mt-4">
                    {editing ? (
                      <RuleInfoCallout>{labels.editEnabledHint}</RuleInfoCallout>
                    ) : (
                      <RuleToggleRow
                        checked={draft.enabled}
                        description={draft.enabled ? labels.enabledOn : labels.enabledOff}
                        onChange={(enabled) => update({ enabled })}
                        title={labels.enableAfterSave}
                      />
                    )}
                  </div>
                </section>
                <div className="border-t border-[#e8edf4] pt-5">
                  <RuleDryRunPanel
                    enabled={draft.enabled}
                    labels={labels}
                    locale={locale}
                    names={names}
                    onRetry={() => setDryRun({ fingerprint: null, state: { status: "loading" } })}
                    state={dryRunState}
                    timeZone={timeZone}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <aside className="border-t border-[#e8edf4] bg-[#fbfcfe] p-4 sm:p-5 lg:border-t-0 lg:border-l">
            <RulePreviewPanel
              draft={draft}
              editingRule={mode.kind === "edit" ? mode.rule : null}
              labels={labels}
              name={previewName}
              names={names}
              references={references}
            />
          </aside>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#e7ecf3] bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-7 sm:py-4">
          <div aria-live="polite" className="mr-auto min-w-0 flex-1 basis-48 text-[12px] leading-5 text-[#c23445]" role="status">
            {saveError === "STALE" ? (
              <span>
                {labels.staleEdit}{" "}
                <button className="font-semibold underline" onClick={onStale} type="button">
                  {labels.reload}
                </button>
              </span>
            ) : saveError === "INVALID" ? (
              labels.saveInvalid
            ) : saveError === "FAILED" ? (
              labels.saveError
            ) : showIssues && !isRuleStepValid(step, issues) ? (
              labels.fixErrors
            ) : null}
          </div>
          {stepIndex > 0 ? (
            <Button className={SECONDARY} disabled={saving} onClick={back} type="button" variant="outline">
              <FiArrowLeft aria-hidden className="size-4" />
              {labels.backStep}
            </Button>
          ) : (
            <Button className={SECONDARY} onClick={() => onOpenChange(false)} type="button" variant="outline">
              {labels.cancel}
            </Button>
          )}
          {step === "REVIEW" ? (
            <Button className={PRIMARY} disabled={saving} onClick={() => void submit()} type="button">
              {saving ? labels.saving : editing ? labels.saveChanges : labels.createRule}
            </Button>
          ) : (
            <Button className={PRIMARY} onClick={next} type="button">
              {labels.continue}
              <FiArrowRight aria-hidden className="size-4" />
            </Button>
          )}
        </footer>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function CategoryField({
  issue,
  labels,
  onChange,
  references,
  value,
}: {
  readonly issue: ReturnType<typeof validateRuleDraft>["action"];
  readonly labels: RulesUiLabels;
  readonly onChange: (categoryId: string) => void;
  readonly references: RuleBuilderReferences;
  readonly value: string;
}) {
  const id = useId();
  const options: SelectOption[] = references.categories.map((category) => ({
    value: category.id,
    label: ruleCategoryOptionLabel(category),
    description: ruleLabel(labels, `kind${category.kind}`),
    searchTerms: [category.name, category.parentName ?? ""],
    icon: (
      <TransactionIcon categoryKey={category.key} categoryName={category.name} decorative size="sm" transactionKind={category.kind} />
    ),
  }));
  if (value && !options.some((option) => option.value === value))
    options.unshift({ value, label: labels.unavailableReference });
  return (
    <section data-category-field>
      <span className={FIELD_LABEL} id={`${id}-label`}>
        {labels.category}
      </span>
      <PaceSearchSelect
        ariaLabel={labels.category}
        describedBy={issue ? `${id}-error` : undefined}
        emptyLabel={labels.noCategoryMatch}
        invalid={Boolean(issue)}
        onValueChange={onChange}
        options={options}
        placeholder={labels.selectCategory}
        searchPlaceholder={labels.categorySearch}
        triggerClassName="h-10 rounded-[8px] px-3 text-[13px] font-normal"
        value={value}
      />
      <RuleFieldError id={`${id}-error`} issue={issue} labels={labels} />
    </section>
  );
}

function ReviewFields({
  draft,
  issues,
  labels,
  onChange,
  showIssues,
}: {
  readonly draft: RuleDraft;
  readonly issues: ReturnType<typeof validateRuleDraft>;
  readonly labels: RulesUiLabels;
  readonly onChange: (next: Partial<RuleDraft>) => void;
  readonly showIssues: boolean;
}) {
  const id = useId();
  const nameIssue = showIssues ? issues.name : null;
  const priorityIssue = showIssues ? issues.priority : null;
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]" data-rule-review>
      <div className="min-w-0">
        <label className={FIELD_LABEL} htmlFor={`${id}-name`}>
          {labels.ruleName}
        </label>
        <input
          aria-describedby={nameIssue ? `${id}-name-error` : `${id}-name-hint`}
          aria-invalid={nameIssue ? true : undefined}
          className={RULE_INPUT}
          id={`${id}-name`}
          maxLength={200}
          onChange={(event) => onChange({ name: event.target.value, nameEdited: true })}
          value={draft.name}
        />
        {nameIssue ? (
          <RuleFieldError id={`${id}-name-error`} issue={nameIssue} labels={labels} />
        ) : (
          <p className="mt-1.5 text-[12px] leading-5 text-[#71809a]" id={`${id}-name-hint`}>
            {labels.ruleNameHint}
          </p>
        )}
      </div>
      <div className="min-w-0">
        <label className={FIELD_LABEL} htmlFor={`${id}-priority`}>
          {labels.priority}
        </label>
        <input
          aria-describedby={priorityIssue ? `${id}-priority-error` : `${id}-priority-hint`}
          aria-invalid={priorityIssue ? true : undefined}
          className={cn(RULE_INPUT, "tabular-nums")}
          id={`${id}-priority`}
          inputMode="numeric"
          max={MAX_RULE_PRIORITY}
          min={MIN_RULE_PRIORITY}
          onChange={(event) => onChange({ priority: event.target.value })}
          step={1}
          type="number"
          value={draft.priority}
        />
        {priorityIssue ? (
          <RuleFieldError id={`${id}-priority-error`} issue={priorityIssue} labels={labels} />
        ) : (
          <p className="mt-1.5 text-[12px] leading-5 text-[#71809a]" id={`${id}-priority-hint`}>
            {labels.priorityHint}
          </p>
        )}
      </div>
    </div>
  );
}
