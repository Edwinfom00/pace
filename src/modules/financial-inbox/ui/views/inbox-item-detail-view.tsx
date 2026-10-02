import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Hash,
  Info,
  Landmark,
  type LucideIcon,
  Repeat2,
  Search,
  Sparkles,
  Tag,
} from "lucide-react";

import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import { cn } from "@/lib/utils";
import type { InboxReason } from "@/modules/financial-inbox/domain";
import type { InboxItemDetail } from "@/modules/financial-inbox/inbox-item-detail";
import type { TransactionCategoryOptionsState } from "@/modules/transactions/domain/transaction-category-options";
import {
  DEFAULT_TRANSACTION_FILTER_STATE,
  transactionListHref,
} from "@/modules/transactions/domain/transaction-list-url";
import {
  formatTransactionAmount,
  transactionAmountTone,
} from "@/modules/transactions/ui/components/transaction-formatters";
import {
  formatDetailDate,
  formatDetailTime,
  formatDetailTimestamp,
} from "@/modules/transactions/ui/components/transaction-detail-formatters";

import type { InboxDetailLabels } from "../inbox-detail-labels";
import { InboxCategoryResolutionActions } from "../components/inbox-category-resolution-actions";
import { InboxRecurringResolutionActions } from "../components/inbox-recurring-resolution-actions";

const cardClassName = "rounded-[14px] border border-[#e5e9f0] bg-white px-5 py-5 sm:px-6";
const headingClassName = "text-[16px] font-semibold tracking-[-0.02em] text-[#101a35]";

const REASON_ICON: Record<InboxReason, LucideIcon> = {
  UNKNOWN_CATEGORY: Tag,
  POSSIBLE_TRANSFER: ArrowLeftRight,
  POSSIBLE_RECURRING: Repeat2,
  MERCHANT_AMBIGUITY: Search,
  CLASSIFICATION_REVIEW: FileText,
};

export function InboxItemDetailView({
  detail,
  categoryOptions,
  labels,
  locale,
  timeZone,
  workspaceSlug,
  backHref,
}: {
  readonly detail: InboxItemDetail;
  readonly categoryOptions: TransactionCategoryOptionsState;
  readonly labels: InboxDetailLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceSlug: string;
  readonly backHref: string;
}) {
  const confirmedCategory = detail.currentClassification.category
    ? labels.systemCategory(detail.currentClassification.category)
    : null;
  const occurredAt = dateAtLabel(detail.transaction.occurredAt, labels, locale, timeZone);

  return (
    <main className="mx-auto w-full max-w-330 px-4 py-6 sm:px-6 sm:py-7 lg:px-8">
      <div className="flex items-center justify-between gap-4 text-[13px]">
        <nav aria-label={labels.breadcrumb} className="flex min-w-0 items-center gap-2">
          <Link
            className="shrink-0 text-[#71809a] transition-colors hover:text-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563eb]"
            href={backHref}>
            {labels.inbox}
          </Link>
          <ChevronRight aria-hidden className="size-3.5 shrink-0 text-[#a0abbb]" />
          <span aria-current="page" className="truncate font-medium text-[#22314b]">
            {labels.breadcrumb}
          </span>
        </nav>
        <Link
          className="inline-flex shrink-0 items-center gap-1 text-[#53627b] transition-colors hover:text-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563eb]"
          href={backHref}>
          <ChevronLeft aria-hidden className="size-4" />
          {labels.back}
        </Link>
      </div>

      <div className="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(330px,380px)] xl:gap-5">
        <div className="min-w-0 space-y-4">
          <HeroCard
            categoryLabel={confirmedCategory}
            detail={detail}
            labels={labels}
            locale={locale}
            occurredAt={occurredAt}
          />
          <TransactionInformationCard
            detail={detail}
            labels={labels}
            locale={locale}
            occurredAt={occurredAt}
          />
          <ClassificationCard
            categoryLabel={confirmedCategory}
            categoryOptions={categoryOptions}
            detail={detail}
            labels={labels}
            locale={locale}
          />
          <RecurringPatternCard detail={detail} labels={labels} locale={locale} />
          <SimilarTransactionsCard
            detail={detail}
            labels={labels}
            locale={locale}
            timeZone={timeZone}
            workspaceSlug={workspaceSlug}
          />
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-6">
          <AttentionCard detail={detail} labels={labels} />
          <ContextCard detail={detail} labels={labels} workspaceSlug={workspaceSlug} />
          <NotesCard detail={detail} labels={labels} />
          <ActivityCard detail={detail} labels={labels} locale={locale} timeZone={timeZone} />
        </aside>
      </div>
    </main>
  );
}

function HeroCard({
  detail,
  labels,
  locale,
  categoryLabel,
  occurredAt,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
  readonly locale: string;
  readonly categoryLabel: string | null;
  readonly occurredAt: string;
}) {
  const { transaction } = detail;
  const positive = transactionAmountTone(transaction.kind) === "positive";

  return (
    <section aria-labelledby="inbox-item-detail-title" className={cn(cardClassName, "pb-0 sm:pb-0")}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="grid size-20 shrink-0 place-items-center rounded-[18px] border border-[#e5e9f0] bg-white shadow-[0_2px_6px_rgb(16_24_40/6%)]">
          <TransactionIcon
            categoryKey={transaction.category?.key}
            className="size-14 rounded-[14px] border-0 shadow-none [&_img]:size-10"
            merchantLogoKey={transaction.merchant.merchantLogoKey}
            merchantName={transaction.merchant.name}
            size="lg"
            transactionKind={transaction.kind}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1
              className="wrap-break-word text-[24px] font-semibold leading-8 tracking-[-0.035em] text-[#101a35] sm:text-[26px]"
              id="inbox-item-detail-title">
              {transaction.merchant.name}
            </h1>
            <StatusBadge labels={labels} status={detail.status} />
          </div>
          <p className="mt-1 text-[14px] text-[#5f6e87]">
            <time dateTime={transaction.occurredAt}>{occurredAt}</time>
          </p>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {categoryLabel ? <Pill icon={Tag} label={categoryLabel} /> : null}
            {transaction.account ? (
              <Pill icon={CreditCard} label={transaction.account.displayName} outlined />
            ) : null}
          </div>
        </div>
        <p
          className={cn(
            "shrink-0 whitespace-nowrap text-[28px] font-semibold leading-9 tabular-nums tracking-[-0.04em]",
            positive ? "text-[#078652]" : "text-[#101a35]",
          )}>
          {formatTransactionAmount(transaction.amount, transaction.kind, locale)}
        </p>
      </div>
      <ReviewProgress detail={detail} labels={labels} />
    </section>
  );
}

function ReviewProgress({
  detail,
  labels,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
}) {
  const closed = detail.status !== "OPEN";
  const steps: readonly { readonly label: string; readonly state: "done" | "current" | "skipped" | "todo" }[] = [
    { label: labels.step.detected, state: "done" },
    { label: labels.step.suggested, state: detail.suggestion ? "done" : "skipped" },
    { label: labels.step.review, state: closed ? "done" : "current" },
    { label: detail.status === "DISMISSED" ? labels.status.dismissed : labels.step.resolved, state: closed ? "done" : "todo" },
  ];

  return (
    <ol
      aria-label={labels.progress}
      className="mt-6 -mx-5 grid grid-cols-4 gap-2 border-t border-[#edf0f4] bg-[#fbfcfe] px-5 pt-4 pb-4 sm:-mx-6 sm:gap-3 sm:px-6 rounded-b-[14px]">
      {steps.map((step) => (
        <li
          aria-current={step.state === "current" ? "step" : undefined}
          className="min-w-0"
          key={step.label}>
          <span
            className={cn(
              "block h-1.5 rounded-full",
              step.state === "done" && "bg-[#2563eb]",
              step.state === "current" && "bg-[linear-gradient(90deg,#2563eb_0%,#2563eb_45%,#dbe6fb_45%)]",
              step.state === "skipped" && "bg-[repeating-linear-gradient(90deg,#d5dce7_0_6px,transparent_6px_10px)]",
              step.state === "todo" && "bg-[#e5e9f0]",
            )}
          />
          <span
            className={cn(
              "mt-2 flex items-center gap-1 truncate text-[12px]",
              step.state === "done" ? "text-[#22314b]" : step.state === "current" ? "font-medium text-[#2563eb]" : "text-[#8a96a8]",
            )}>
            {step.state === "done" ? <Check aria-hidden className="size-3.5 shrink-0 text-[#2563eb]" /> : null}
            <span className="truncate">{step.label}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function TransactionInformationCard({
  detail,
  labels,
  locale,
  occurredAt,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
  readonly locale: string;
  readonly occurredAt: string;
}) {
  const { transaction } = detail;

  return (
    <section aria-labelledby="inbox-information-heading" className={cardClassName}>
      <h2 className={cn(headingClassName, "border-b border-[#edf0f4] pb-3.5")} id="inbox-information-heading">
        {labels.transactionInformation}
      </h2>
      <dl className="pt-1.5">
        <InfoRow label={labels.field.date}>{occurredAt}</InfoRow>
        <InfoRow label={labels.field.amount}>
          <span className="tabular-nums">
            {formatTransactionAmount(transaction.amount, transaction.kind, locale)}
          </span>
        </InfoRow>
        {transaction.account ? (
          <InfoRow label={labels.field.account}>
            <span className="inline-flex items-center gap-2.5">
              <span className="grid size-6 place-items-center rounded-[6px] bg-[#eef4ff] text-[#2563eb]">
                <CreditCard aria-hidden className="size-3.5" />
              </span>
              {transaction.account.displayName}
            </span>
          </InfoRow>
        ) : null}
        {transaction.merchantName ? (
          <InfoRow label={labels.field.merchant}>{transaction.merchantName}</InfoRow>
        ) : null}
        <InfoRow label={labels.field.type}>
          <KindLabel kind={transaction.kind} labels={labels} />
        </InfoRow>
        <InfoRow label={labels.field.status}>
          <span className="inline-flex rounded-[6px] bg-[#f1f3f6] px-2.5 py-1 text-[12px] text-[#53627b]">
            {labels.transactionStatus[transaction.status]}
          </span>
        </InfoRow>
        {transaction.source ? (
          <InfoRow label={labels.source}>{labels.sourceValue[transaction.source]}</InfoRow>
        ) : null}
        <InfoRow label={labels.field.transactionId}>
          <span className="break-all font-mono text-[12px] text-[#53627b]">{transaction.technicalId}</span>
        </InfoRow>
      </dl>
    </section>
  );
}

function KindLabel({
  kind,
  labels,
}: {
  readonly kind: InboxItemDetail["transaction"]["kind"];
  readonly labels: InboxDetailLabels;
}) {
  if (kind === "OPENING_BALANCE") return <>{labels.technical}</>;
  const tone = {
    EXPENSE: { icon: ArrowDown, className: "text-[#dc3b3b]" },
    INCOME: { icon: ArrowUp, className: "text-[#078652]" },
    REFUND: { icon: ArrowUp, className: "text-[#078652]" },
    TRANSFER: { icon: ArrowLeftRight, className: "text-[#2563eb]" },
  }[kind];
  const Icon = tone.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-medium", tone.className)}>
      <Icon aria-hidden className="size-4" />
      {labels.transactionKind[kind]}
    </span>
  );
}

function ClassificationCard({
  detail,
  labels,
  locale,
  categoryLabel,
  categoryOptions,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
  readonly locale: string;
  readonly categoryLabel: string | null;
  readonly categoryOptions: TransactionCategoryOptionsState;
}) {
  const { state } = detail.currentClassification;
  const title = state === "CONFIRMED"
    ? labels.classification.confirmed
    : state === "UNCERTAIN"
      ? labels.classification.uncertain
      : labels.classification.uncategorized;
  const description = state === "UNCERTAIN"
    ? labels.classification.uncertainDescription
    : labels.classification.uncategorizedDescription;
  const showResolution =
    !detail.capabilities.isResolved &&
    state !== "CONFIRMED" &&
    (detail.suggestion !== null || detail.capabilities.canChooseCategory);

  return (
    <section aria-labelledby="inbox-classification-heading" className={cardClassName}>
      <h2 className={cn(headingClassName, "border-b border-[#edf0f4] pb-3.5")} id="inbox-classification-heading">
        {labels.currentClassification}
      </h2>
      <div className="mt-4 flex items-center gap-4">
        <IconCircle icon={state === "CONFIRMED" ? Check : Tag} tone={state === "CONFIRMED" ? "green" : "neutral"} />
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-[#14203b]">{title}</p>
          {state === "CONFIRMED" && categoryLabel ? (
            <div className="mt-1.5"><Pill icon={Tag} label={categoryLabel} /></div>
          ) : (
            <p className="mt-0.5 text-[13px] leading-5 text-[#5f6e87]">{description}</p>
          )}
        </div>
      </div>
      {showResolution ? (
        <SuggestionPanel categoryOptions={categoryOptions} detail={detail} labels={labels} locale={locale} />
      ) : null}
    </section>
  );
}

function SuggestionPanel({
  detail,
  labels,
  locale,
  categoryOptions,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
  readonly locale: string;
  readonly categoryOptions: TransactionCategoryOptionsState;
}) {
  const { suggestion } = detail;
  const suggestionLabel = suggestion ? labels.systemCategory(suggestion.category) : null;
  const high = suggestion?.confidence === "HIGH";
  const score = suggestion ? Math.round(Math.min(1, Math.max(0, suggestion.score)) * 100) : null;
  const categoryKind =
    detail.transaction.kind === "EXPENSE" || detail.transaction.kind === "INCOME" ? detail.transaction.kind : null;
  const currentCategory = detail.currentClassification.category
    ? {
        id: detail.currentClassification.category.id,
        label: labels.systemCategory(detail.currentClassification.category),
      }
    : null;

  return (
    <div className="mt-5">
      <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-[#14203b]">
        <Sparkles aria-hidden className="size-4 text-[#2563eb]" />
        {labels.suggestion}
      </h3>
      <div
        className={cn(
          "mt-2.5 rounded-[12px] border px-4 py-4 sm:px-5",
          !suggestion && "border-[#e5e9f0] bg-[#fafbfd]",
          suggestion && high && "border-[#cdeedb] bg-[#f3fbf6]",
          suggestion && !high && "border-[#dbe6fb] bg-[#f6f9ff]",
        )}>
        <div className="flex items-start gap-4">
          <IconCircle icon={Tag} tone={suggestion ? (high ? "green" : "blue") : "neutral"} />
          <div className="min-w-0 flex-1">
            {suggestion && suggestionLabel ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-semibold text-[#14203b]">{suggestionLabel}</p>
                  <span
                    className={cn(
                      "rounded-[6px] px-2 py-0.5 text-[12px] font-medium",
                      high ? "bg-[#dcf5e7] text-[#11845d]" : "bg-[#e3ecff] text-[#2563eb]",
                    )}>
                    {labels.confidence[suggestion.confidence]}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-5 text-[#5f6e87]">{labels.suggestionDescription}</p>
                {score !== null ? (
                  <div className="mt-3 flex items-center gap-3">
                    <span
                      aria-hidden
                      className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-white/80 ring-1 ring-black/4">
                      <span
                        className={cn("block h-full rounded-full", high ? "bg-[#22b573]" : "bg-[#2563eb]")}
                        style={{ width: `${score}%` }}
                      />
                    </span>
                    <span className="shrink-0 text-[12px] font-medium tabular-nums text-[#40506c]">
                      {labels.matchScore.replace("{score}", String(score))}
                    </span>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-[13px] leading-5 text-[#5f6e87]">{labels.classification.uncategorizedDescription}</p>
            )}
          </div>
        </div>
        <InboxCategoryResolutionActions
          canAcceptCategorySuggestion={detail.capabilities.canAcceptCategorySuggestion}
          canChooseCategory={detail.capabilities.canChooseCategory}
          categoryKind={categoryKind}
          categoryOptions={categoryOptions}
          currentCategory={currentCategory}
          expectedInboxUpdatedAt={detail.updatedAt}
          expectedTransactionUpdatedAt={detail.transactionUpdatedAt}
          inboxItemId={detail.id}
          key={detail.id}
          labels={labels.categoryResolution}
          suggestion={
            suggestion && suggestionLabel
              ? { id: suggestion.category.id, label: suggestionLabel, updatedAt: suggestion.updatedAt }
              : null
          }
          transactionAmount={formatTransactionAmount(detail.transaction.amount, detail.transaction.kind, locale)}
          transactionLabel={detail.transaction.merchant.name}
          workspaceId={detail.workspaceId}
        />
      </div>
    </div>
  );
}

function RecurringPatternCard({
  detail,
  labels,
  locale,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
  readonly locale: string;
}) {
  const recurring = detail.context.recurring;
  const capabilities = detail.capabilities.recurring;
  if (!recurring || !capabilities || capabilities.recurringId !== recurring.id) return null;

  return (
    <section aria-labelledby="inbox-recurring-pattern-heading" className={cardClassName}>
      <h2 className={cn(headingClassName, "border-b border-[#edf0f4] pb-3.5")} id="inbox-recurring-pattern-heading">
        {labels.recurring}
      </h2>
      <div className="mt-4 flex items-start gap-4">
        <IconCircle icon={Repeat2} tone="blue" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-[#14203b]">
            {recurring.displayName ?? detail.transaction.merchant.name}
          </p>
          <InboxRecurringResolutionActions
            capabilities={capabilities}
            expectedInboxUpdatedAt={detail.updatedAt}
            inboxItemId={detail.id}
            labels={labels.recurringResolution}
            locale={locale}
            recurring={recurring}
            title={detail.transaction.merchant.name}
            workspaceId={detail.workspaceId}
          />
        </div>
      </div>
    </section>
  );
}

function SimilarTransactionsCard({
  detail,
  labels,
  locale,
  timeZone,
  workspaceSlug,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceSlug: string;
}) {
  const viewAllHref = transactionListHref(`/w/${workspaceSlug}/transactions`, {
    ...DEFAULT_TRANSACTION_FILTER_STATE,
    search: detail.transaction.merchantName ?? detail.transaction.merchant.name,
    page: 1,
  });

  return (
    <section aria-labelledby="inbox-similar-heading" className={cardClassName}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={headingClassName} id="inbox-similar-heading">
          {labels.similarTransactions}
        </h2>
        {detail.similarTransactions.length ? (
          <Link
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#2563eb] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            href={viewAllHref}>
            {labels.viewAll}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {detail.similarTransactions.length ? (
        <ul className="mt-2">
          {detail.similarTransactions.map((transaction) => (
            <li className="border-b border-[#f0f2f5] last:border-b-0" key={transaction.id}>
              <Link
                className="-mx-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 rounded-[8px] px-2 py-2.5 transition-colors hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] sm:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_auto_minmax(0,0.8fr)]"
                href={`/w/${workspaceSlug}/transactions/${transaction.id}`}>
                <TransactionIcon
                  categoryKey={transaction.category?.key}
                  merchantLogoKey={transaction.merchant.merchantLogoKey}
                  merchantName={transaction.merchant.name}
                  size="sm"
                  transactionKind={transaction.kind}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[#22314b]">{transaction.merchant.name}</span>
                  <time className="block text-[12px] text-[#71809a] sm:hidden" dateTime={transaction.occurredAt}>
                    {formatDetailDate(transaction.occurredAt, locale, timeZone)}
                  </time>
                </span>
                <time className="hidden text-[13px] text-[#5f6e87] sm:block" dateTime={transaction.occurredAt}>
                  {formatDetailDate(transaction.occurredAt, locale, timeZone)}
                </time>
                <span
                  className={cn(
                    "whitespace-nowrap text-right text-[13px] font-medium tabular-nums",
                    transactionAmountTone(transaction.kind) === "positive" ? "text-[#078652]" : "text-[#22314b]",
                  )}>
                  {formatTransactionAmount(transaction.amount, transaction.kind, locale)}
                </span>
                <span className="hidden min-w-0 justify-end sm:flex">
                  {transaction.category ? (
                    <span className="truncate rounded-[6px] bg-[#f1f3f6] px-2.5 py-1 text-[12px] text-[#53627b]">
                      {labels.systemCategory({ name: transaction.category.label, systemKey: transaction.category.key })}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] leading-5 text-[#71809a]">{labels.similarEmpty}</p>
      )}
    </section>
  );
}

function AttentionCard({
  detail,
  labels,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
}) {
  if (detail.attentionReasons.length === 0) return null;

  return (
    <section aria-labelledby="inbox-attention-heading" className={cardClassName}>
      <div className="flex items-center justify-between gap-3 border-b border-[#edf0f4] pb-3.5">
        <h2 className={headingClassName} id="inbox-attention-heading">
          {labels.whyAttention}
        </h2>
        <Info aria-hidden className="size-4 text-[#71809a]" />
      </div>
      <ul className="mt-4 space-y-4">
        {detail.attentionReasons.map((reason) => (
          <li className="flex gap-3.5" key={reason}>
            <IconCircle icon={REASON_ICON[reason]} tone={reason === "MERCHANT_AMBIGUITY" ? "blue" : "neutral"} />
            <div className="min-w-0 pt-0.5">
              <p className="text-[14px] font-medium text-[#14203b]">{labels.reason[reason].title}</p>
              <p className="mt-0.5 text-[13px] leading-5 text-[#5f6e87]">{labels.reason[reason].description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContextCard({
  detail,
  labels,
  workspaceSlug,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
  readonly workspaceSlug: string;
}) {
  const { context, transaction } = detail;

  return (
    <section aria-labelledby="inbox-context-heading" className={cardClassName}>
      <h2 className={cn(headingClassName, "border-b border-[#edf0f4] pb-3.5")} id="inbox-context-heading">
        {labels.context}
      </h2>
      <dl className="mt-4 space-y-4">
        {context.account ? (
          <ContextItem icon={Landmark} label={labels.account} tone="blue">
            {context.account.name}
          </ContextItem>
        ) : null}
        {context.source ? (
          <ContextItem icon={FileText} label={labels.source}>
            {labels.sourceValue[context.source]}
          </ContextItem>
        ) : null}
        {context.recurring ? (
          <ContextItem icon={Repeat2} label={labels.recurring}>
            <Link
              className="text-[#2563eb] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              href={`/w/${workspaceSlug}/recurring/${context.recurring.id}`}>
              {context.recurring.displayName ?? labels.recurring}
            </Link>
          </ContextItem>
        ) : null}
        <ContextItem icon={Hash} label={labels.field.type}>
          {transaction.kind === "OPENING_BALANCE" ? labels.technical : labels.transactionKind[transaction.kind]}
        </ContextItem>
      </dl>
    </section>
  );
}

function NotesCard({
  detail,
  labels,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
}) {
  const note = detail.transaction.note;
  return (
    <section aria-labelledby="inbox-notes-heading" className={cardClassName}>
      <h2 className={cn(headingClassName, "border-b border-[#edf0f4] pb-3.5")} id="inbox-notes-heading">
        {labels.notes}
      </h2>
      <div className="mt-4 flex gap-3.5">
        <IconCircle icon={FileText} tone="neutral" />
        <p
          className={cn(
            "min-w-0 whitespace-pre-wrap wrap-break-word pt-2.5 text-[13px] leading-5",
            note ? "text-[#22314b]" : "text-[#71809a]",
          )}>
          {note ?? labels.notesEmpty}
        </p>
      </div>
    </section>
  );
}

function ActivityCard({
  detail,
  labels,
  locale,
  timeZone,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
  readonly locale: string;
  readonly timeZone: string;
}) {
  if (!detail.activity.length) return null;
  return (
    <section aria-labelledby="inbox-activity-heading" className={cardClassName}>
      <h2 className={cn(headingClassName, "border-b border-[#edf0f4] pb-3.5")} id="inbox-activity-heading">
        {labels.activity}
      </h2>
      <ol className="mt-4">
        {detail.activity.map((activity, index) => (
          <li className="relative pb-5 pl-8 last:pb-0" key={activity.id}>
            {index < detail.activity.length - 1 ? (
              <span aria-hidden className="absolute top-4 bottom-0 left-1.75 w-px bg-[#e1e6ee]" />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "absolute top-1 left-0 size-3.75 rounded-full border-[3px]",
                index === 0 ? "border-[#dbe6fb] bg-[#2563eb]" : "border-[#eef1f5] bg-[#8a96a8]",
              )}
            />
            <p className="text-[13px] font-medium text-[#14203b]">{labels.activityEvent[activity.event]}</p>
            <time className="mt-0.5 block text-[12px] text-[#71809a]" dateTime={activity.occurredAt}>
              {formatDetailTimestamp(activity.occurredAt, locale, timeZone)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

function InfoRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(110px,190px)_minmax(0,1fr)] items-center gap-4 py-2.5 text-[13px]">
      <dt className="text-[#71809a]">{label}</dt>
      <dd className="min-w-0 wrap-break-word text-[#22314b]">{children}</dd>
    </div>
  );
}

function ContextItem({
  icon,
  label,
  tone = "neutral",
  children,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly tone?: "neutral" | "blue";
  readonly children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <IconCircle icon={icon} tone={tone} />
      <div className="min-w-0">
        <dt className="text-[12px] text-[#71809a]">{label}</dt>
        <dd className="mt-0.5 wrap-break-word text-[14px] font-medium text-[#14203b]">{children}</dd>
      </div>
    </div>
  );
}

function IconCircle({
  icon: Icon,
  tone,
}: {
  readonly icon: LucideIcon;
  readonly tone: "neutral" | "blue" | "green";
}) {
  return (
    <span
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full",
        tone === "neutral" && "bg-[#f3f5f8] text-[#40506c]",
        tone === "blue" && "bg-[#eef4ff] text-[#2563eb]",
        tone === "green" && "bg-[#e3f6ec] text-[#16a06a]",
      )}>
      <Icon aria-hidden className="size-5" strokeWidth={1.75} />
    </span>
  );
}

function Pill({
  label,
  icon: Icon,
  outlined = false,
}: {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly outlined?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[13px]",
        outlined ? "border border-[#e3e8ef] bg-white text-[#22314b]" : "bg-[#f1f3f6] text-[#40506c]",
      )}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function StatusBadge({
  status,
  labels,
}: {
  readonly status: InboxItemDetail["status"];
  readonly labels: InboxDetailLabels;
}) {
  const config = status === "OPEN"
    ? { label: labels.status.open, className: "bg-[#eaf2ff] text-[#2563eb]" }
    : status === "RESOLVED"
      ? { label: labels.status.resolved, className: "bg-[#e9f8f0] text-[#11845d]" }
      : { label: labels.status.dismissed, className: "bg-[#f1f3f6] text-[#66758e]" };
  return (
    <span className={cn("inline-flex rounded-[7px] px-2.5 py-1 text-[13px] font-medium", config.className)}>
      {config.label}
    </span>
  );
}

function dateAtLabel(value: string, labels: InboxDetailLabels, locale: string, timeZone: string): string {
  return labels.dateAt
    .replace("{date}", formatDetailDate(value, locale, timeZone))
    .replace("{time}", formatDetailTime(value, locale, timeZone));
}
