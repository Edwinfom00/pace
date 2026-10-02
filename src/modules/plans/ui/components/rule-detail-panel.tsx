import type { ReactNode } from "react";

import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import { formatSignedMoney } from "@/modules/forecast/ui/forecast-format";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import type { RuleExecutionView, RuleListItem } from "@/modules/plans/rules/rules-overview";
import { cn } from "@/lib/utils";

import {
  actionLabel,
  actionTarget,
  conditionLabel,
  conditionSummary,
  conditionValue,
  createdByLabel,
  fillLabel,
  formatRuleDate,
  formatRuleTime,
} from "../rules-format";
import type { RulesUiLabels } from "../rules-ui-labels";
import { RuleActionIcon, RuleOutcomePill, RuleStatusPill } from "./rule-visuals";

export function RuleDetailPanel({
  actions,
  className,
  executions,
  labels,
  leading,
  locale,
  rule,
  timeZone,
}: {
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly executions: readonly RuleExecutionView[];
  readonly labels: RulesUiLabels;
  readonly leading?: ReactNode;
  readonly locale: string;
  readonly rule: RuleListItem;
  readonly timeZone: string;
}) {
  const date = (value: string) => formatRuleDate(value, locale, timeZone);
  return (
    <section
      aria-labelledby={`rule-${rule.id}-title`}
      className={cn("rounded-[14px] border border-[#e5eaf1] bg-white p-4 sm:p-5", className)}
      data-rule-detail={rule.id}
    >
      {leading}
      <header className="flex flex-wrap items-start gap-3">
        <RuleActionIcon action={rule.action} muted={rule.status !== "ACTIVE"} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              className="min-w-0 text-[16px] font-semibold tracking-[-0.02em] break-words text-[#101a35]"
              id={`rule-${rule.id}-title`}
            >
              {rule.name}
            </h2>
            <RuleStatusPill labels={labels} status={rule.status} />
          </div>
          <p className="mt-0.5 text-[12px] leading-5 text-[#71809a]">
            {rule.trigger ? conditionSummary(labels, rule.trigger) : labels.triggerEvent}
          </p>
        </div>
        {actions ? <div className="flex w-full items-center justify-end gap-2">{actions}</div> : null}
      </header>

      <h3 className="mt-6 text-[14px] font-semibold text-[#18243b]">{labels.details}</h3>
      <dl className="mt-3 grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-4 gap-y-3 text-[13px]">
        <dt className="text-[#53627b]">{labels.trigger}</dt>
        <dd className="min-w-0 text-[#18243b]">
          <span className="block text-[11px] text-[#71809a]">{labels.triggerEvent}</span>
          {rule.trigger ? <ConditionChip condition={rule.trigger} labels={labels} /> : null}
        </dd>

        <dt className="text-[#53627b]">{labels.conditions}</dt>
        <dd className="min-w-0">
          {rule.conditions.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {rule.conditions.map((condition, index) => (
                <li key={`${condition.field}-${index}`}>
                  <ConditionChip condition={condition} labels={labels} />
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-[#71809a]">{labels.noConditions}</span>
          )}
        </dd>

        <dt className="text-[#53627b]">{labels.action}</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-2 text-[#18243b]">
          <span className="rounded-[6px] bg-[#f2f5f9] px-2 py-1 text-[12px] font-medium">
            {actionLabel(labels, rule.action)}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <RuleActionIcon action={rule.action} size="sm" />
            <span className="truncate">{actionTarget(labels, rule.action)}</span>
          </span>
        </dd>

        <dt className="text-[#53627b]">{labels.priority}</dt>
        <dd className="text-[#18243b] tabular-nums">{rule.priority}</dd>

        <dt className="text-[#53627b]">{labels.created}</dt>
        <dd className="text-[#18243b]">{fillLabel(createdByLabel(labels, rule), { date: date(rule.createdAt) })}</dd>

        <dt className="text-[#53627b]">{labels.lastUpdated}</dt>
        <dd className="text-[#18243b]">{date(rule.updatedAt)}</dd>
      </dl>

      <h3 className="mt-6 border-t border-[#edf0f4] pt-5 text-[14px] font-semibold text-[#18243b]">
        {labels.recentExecutions}
      </h3>
      {executions.length ? (
        <ul className="mt-2 divide-y divide-[#edf0f4]">
          {executions.map((execution) => (
            <ExecutionRow
              execution={execution}
              key={execution.id}
              labels={labels}
              locale={locale}
              timeZone={timeZone}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-[10px] bg-[#f8fafc] px-3 py-5 text-center text-[12px] text-[#71809a]">
          {labels.noExecutions}
        </p>
      )}
    </section>
  );
}

function ConditionChip({
  condition,
  labels,
}: {
  readonly condition: RuleListItem["conditions"][number];
  readonly labels: RulesUiLabels;
}) {
  const value = conditionValue(labels, condition);
  return (
    <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 rounded-[6px] bg-[#f2f5f9] px-2 py-1 text-[12px]">
      <span className="text-[#53627b]">{conditionLabel(labels, condition)}</span>
      {value ? <span className="font-medium break-words text-[#18243b]">{value}</span> : null}
    </span>
  );
}

export function signedTransactionAmount(transaction: NonNullable<RuleExecutionView["transaction"]>, locale: string): string {
  if (transaction.kind === "EXPENSE")
    return formatSignedMoney(transaction.amountMinor, transaction.currency, locale, "-");
  if (transaction.kind === "INCOME" || transaction.kind === "REFUND")
    return formatSignedMoney(transaction.amountMinor, transaction.currency, locale, "+");
  return formatOverviewMoney(transaction.amountMinor, transaction.currency, locale);
}

function ExecutionRow({
  execution,
  labels,
  locale,
  timeZone,
}: {
  readonly execution: RuleExecutionView;
  readonly labels: RulesUiLabels;
  readonly locale: string;
  readonly timeZone: string;
}) {
  const transaction = execution.transaction;
  const name = transaction?.label ?? labels.unknownTransaction;
  const moment = transaction?.occurredAt ?? execution.executedAt;
  return (
    <li className="flex items-center gap-3 py-3" data-execution-id={execution.id}>
      <TransactionIcon merchantName={transaction?.label} size="sm" transactionKind={transaction?.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[#18243b]">{name}</span>
        <span className="block truncate text-[11px] text-[#71809a]">
          {formatRuleDate(moment, locale, timeZone)} · {formatRuleTime(moment, locale, timeZone)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {transaction ? (
          <span
            className={cn(
              "text-[12px] font-semibold tabular-nums",
              transaction.kind === "EXPENSE" ? "text-[#e14958]" : "text-[#18243b]",
            )}
          >
            {signedTransactionAmount(transaction, locale)}
          </span>
        ) : null}
        <RuleOutcomePill execution={execution} labels={labels} />
      </span>
    </li>
  );
}
