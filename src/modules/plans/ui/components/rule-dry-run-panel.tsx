"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { FiCheck, FiInfo, FiRefreshCw, FiX } from "react-icons/fi";

import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import type { RuleCondition, RuleConditionExplanation } from "@/modules/plans/rules/domain";
import { DEFAULT_RULE_DRY_RUN_LIMIT } from "@/modules/plans/rules/rule-contract";
import type { RuleDraftDryRunResult, RuleDraftDryRunTransaction } from "@/modules/plans/rules/rule-service";
import { toRuleConditionView, type RuleReferenceNames } from "@/modules/plans/rules/rules-overview";
import { cn } from "@/lib/utils";

import { conditionSummary, fillLabel, formatRuleDate, formatRuleTime, ruleLabel } from "../rules-format";
import type { RulesUiLabels } from "../rules-ui-labels";
import { signedTransactionAmount } from "./rule-detail-panel";

export type RuleDryRunState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly result: RuleDraftDryRunResult };

type DryRunTab = "MATCHING" | "NOT_MATCHING";

function explanationCondition(explanation: RuleConditionExplanation): RuleCondition {
  if (explanation.field === "COUNTERPARTY" || explanation.field === "NOTE")
    return {
      field: explanation.field,
      operator: explanation.operator,
      value: typeof explanation.expected === "string" ? explanation.expected : null,
    } as RuleCondition;
  return {
    field: explanation.field,
    operator: explanation.operator,
    values: Array.isArray(explanation.expected) ? explanation.expected : [],
  } as RuleCondition;
}

function actualValue(explanation: RuleConditionExplanation, labels: RulesUiLabels, names: RuleReferenceNames): string {
  const actual = explanation.actual;
  if (actual === null) return labels.emptyValue;
  switch (explanation.field) {
    case "TRANSACTION_KIND":
      return ruleLabel(labels, `kind${actual}`);
    case "ENTRY_ORIGIN":
      return ruleLabel(labels, `origin${actual}`);
    case "ACCOUNT":
      return names.accounts.get(actual) ?? labels.unavailableReference;
    case "CATEGORY":
      return names.categories.get(actual)?.name ?? labels.unavailableReference;
    default:
      return actual;
  }
}

export function RuleDryRunPanel({
  enabled,
  labels,
  locale,
  names,
  onRetry,
  state,
  timeZone,
}: {
  readonly enabled: boolean;
  readonly labels: RulesUiLabels;
  readonly locale: string;
  readonly names: RuleReferenceNames;
  readonly onRetry: () => void;
  readonly state: RuleDryRunState;
  readonly timeZone: string;
}) {
  const id = useId();
  const [tab, setTab] = useState<DryRunTab>("MATCHING");
  const result = state.status === "ready" ? state.result : null;
  const matching = result?.transactions.filter((transaction) => transaction.match.matched) ?? [];
  const notMatching = result?.transactions.filter((transaction) => !transaction.match.matched) ?? [];
  const tabs: readonly { readonly key: DryRunTab; readonly label: string; readonly items: readonly RuleDraftDryRunTransaction[] }[] = [
    { key: "MATCHING", label: fillLabel(labels.dryRunMatching, { count: matching.length }), items: matching },
    { key: "NOT_MATCHING", label: fillLabel(labels.dryRunNotMatching, { count: notMatching.length }), items: notMatching },
  ];
  const active = tabs.find((item) => item.key === tab)!;
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: DryRunTab =
      event.key === "Home" ? "MATCHING" : event.key === "End" ? "NOT_MATCHING" : tab === "MATCHING" ? "NOT_MATCHING" : "MATCHING";
    setTab(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  };

  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0" data-rule-dry-run={state.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[15px] font-semibold tracking-[-0.01em] text-[#101a35]" id={`${id}-title`}>
            {labels.dryRunTitle}
          </h4>
          <p className="mt-0.5 text-[12px] leading-5 text-[#71809a]">
            {fillLabel(labels.dryRunSubtitle, { count: result?.evaluatedCount ?? DEFAULT_RULE_DRY_RUN_LIMIT })}
          </p>
        </div>
        <button
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-[#d8e0eb] px-2.5 text-[12px] font-medium text-[#263550] hover:border-[#9eb4d3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769e8] disabled:opacity-60"
          disabled={state.status === "loading"}
          onClick={onRetry}
          type="button"
        >
          <FiRefreshCw aria-hidden className={cn("size-3.5", state.status === "loading" && "animate-spin motion-reduce:animate-none")} />
          {labels.dryRunRetry}
        </button>
      </div>

      <div aria-live="polite" className="mt-3">
        {state.status === "loading" || state.status === "idle" ? (
          <div className="space-y-2" data-dry-run-loading>
            <p className="sr-only">{labels.dryRunRunning}</p>
            {[0, 1, 2].map((index) => (
              <div className="h-14 animate-pulse rounded-[10px] bg-[#f1f4f8] motion-reduce:animate-none" key={index} />
            ))}
          </div>
        ) : state.status === "error" ? (
          <p className="rounded-[10px] bg-[#fdecee] px-3 py-3 text-[12px] text-[#a12a3a]" role="alert">
            {labels.dryRunError}
          </p>
        ) : result && result.evaluatedCount === 0 ? (
          <p className="rounded-[10px] bg-[#f8fafc] px-3 py-6 text-center text-[12px] text-[#71809a]">
            {labels.dryRunNoTransactions}
          </p>
        ) : (
          <>
            <div aria-label={labels.dryRunTitle} className="grid grid-cols-2 border-b border-[#e5eaf1]" role="tablist">
              {tabs.map((item) => {
                const selected = item.key === tab;
                return (
                  <button
                    aria-controls={`${id}-panel`}
                    aria-selected={selected}
                    className={cn(
                      "-mb-px min-h-10 border-b-2 px-2 text-[13px] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#1769e8]",
                      selected ? "border-[#1769e8] text-[#1769e8]" : "border-transparent text-[#53627b] hover:text-[#18243b]",
                    )}
                    id={`${id}-tab-${item.key}`}
                    key={item.key}
                    onClick={() => setTab(item.key)}
                    onKeyDown={onKeyDown}
                    role="tab"
                    tabIndex={selected ? 0 : -1}
                    type="button"
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div aria-labelledby={`${id}-tab-${tab}`} id={`${id}-panel`} role="tabpanel" tabIndex={0}>
              {active.items.length ? (
                <ul className="divide-y divide-[#edf0f4]">
                  {active.items.map((transaction) => (
                    <DryRunRow
                      key={transaction.transactionId}
                      labels={labels}
                      locale={locale}
                      names={names}
                      timeZone={timeZone}
                      transaction={transaction}
                    />
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-6 text-center text-[12px] text-[#71809a]">
                  {tab === "MATCHING" ? labels.dryRunEmptyMatching : labels.dryRunEmptyNotMatching}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <p className="mt-3 flex gap-2 rounded-[10px] bg-[#edf4ff] p-3 text-[12px] leading-5 text-[#40577d]">
        <FiInfo aria-hidden className="mt-0.5 size-4 shrink-0 text-[#1769e8]" />
        <span>
          {labels.dryRunNotice}
          {enabled ? null : <span className="mt-1 block">{labels.dryRunDisabledNotice}</span>}
        </span>
      </p>
    </section>
  );
}

function DryRunRow({
  labels,
  locale,
  names,
  timeZone,
  transaction,
}: {
  readonly labels: RulesUiLabels;
  readonly locale: string;
  readonly names: RuleReferenceNames;
  readonly timeZone: string;
  readonly transaction: RuleDraftDryRunTransaction;
}) {
  const matched = transaction.match.matched;
  const outcome = !matched
    ? { tone: "bg-[#f1f4f8] text-[#53627b]", text: labels.dryRunNoMatch, key: "NO_MATCH" }
    : transaction.wouldApply
      ? { tone: "bg-[#e8f7ef] text-[#14845c]", text: labels.dryRunWouldApply, key: "WOULD_APPLY" }
      : transaction.shadowedBy
        ? { tone: "bg-[#f1ecff] text-[#6a4cc4]", text: fillLabel(labels.dryRunShadowed, { name: transaction.shadowedBy.name }), key: "SHADOWED" }
        : { tone: "bg-[#fff4e0] text-[#9a5b00]", text: labels.dryRunSkipped, key: "SKIPPED" };
  const reason = matched && !transaction.wouldApply && !transaction.shadowedBy ? transaction.applicability.reason : null;
  return (
    <li className="py-3" data-dry-run-outcome={outcome.key} data-dry-run-transaction={transaction.transactionId}>
      <div className="flex items-center gap-3">
        <TransactionIcon merchantName={transaction.label} size="sm" transactionKind={transaction.kind} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-[#18243b]">
            {transaction.label ?? labels.unknownTransaction}
          </span>
          <span className="block truncate text-[11px] text-[#71809a]">
            {formatRuleDate(transaction.occurredAt, locale, timeZone)} · {formatRuleTime(transaction.occurredAt, locale, timeZone)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              "text-[12px] font-semibold tabular-nums",
              transaction.kind === "EXPENSE" ? "text-[#e14958]" : "text-[#18243b]",
            )}
          >
            {signedTransactionAmount(transaction, locale)}
          </span>
          <span className={cn("max-w-40 truncate rounded-[6px] px-2 py-0.5 text-[11px] font-semibold", outcome.tone)}>
            {outcome.text}
          </span>
        </span>
      </div>
      {reason ? <p className="mt-1 pl-11 text-[11px] text-[#9a5b00]">{ruleLabel(labels, `reason${reason}`)}</p> : null}
      <details className="group mt-1 pl-11">
        <summary className="cursor-pointer rounded-lg text-[11px] font-medium text-[#1769e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769e8]">
          {matched ? labels.whyMatched : labels.whyNotMatched}
        </summary>
        <ul className="mt-1.5 space-y-1">
          {transaction.match.conditions.map((explanation) => (
            <li className="flex items-start gap-1.5 text-[11px] leading-4" data-condition-matched={explanation.matched} key={explanation.index}>
              {explanation.matched ? (
                <FiCheck aria-hidden className="mt-0.5 size-3 shrink-0 text-[#14845c]" />
              ) : (
                <FiX aria-hidden className="mt-0.5 size-3 shrink-0 text-[#c23445]" />
              )}
              <span className="min-w-0">
                <span className="sr-only">{explanation.matched ? labels.conditionMet : labels.conditionNotMet}: </span>
                <span className="text-[#263550]">
                  {conditionSummary(labels, toRuleConditionView(explanationCondition(explanation), names))}
                </span>
                <span className="block text-[#71809a]">
                  {fillLabel(labels.transactionValue, { value: actualValue(explanation, labels, names) })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}
