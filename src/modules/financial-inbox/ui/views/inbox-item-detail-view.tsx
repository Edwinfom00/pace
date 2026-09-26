import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  FileText,
  History,
  type LucideIcon,
  Repeat2,
  Tag,
  UserRound,
} from "lucide-react";

import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import type { InboxItemDetail } from "@/modules/financial-inbox/inbox-item-detail";
import type { TransactionCategoryOptionsState } from "@/modules/transactions/domain/transaction-category-options";
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

const surfaceClassName =
  "rounded-[12px] border border-[#e4e8ef] bg-white px-4 py-4 shadow-[0_1px_2px_rgb(16_24_40/2%)] sm:px-5";

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

  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <nav
        aria-label={labels.breadcrumb}
        className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <Link
          className="inline-flex shrink-0 items-center gap-1.5 font-medium text-[#637491] transition-colors hover:text-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563eb]"
          href={backHref}>
          <ArrowLeft aria-hidden className="size-4" />
          {labels.back}
        </Link>
        <ChevronRight
          aria-hidden
          className="size-3.5 shrink-0 text-[#a0abbb]"
        />
        <span className="truncate text-[#71809a]">{labels.breadcrumb}</span>
      </nav>

      <section
        aria-labelledby="inbox-item-detail-title"
        className="mt-6 border-b border-[#edf0f4] pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
            <TransactionIcon
              categoryKey={detail.transaction.category?.key}
              merchantLogoKey={detail.transaction.merchant.merchantLogoKey}
              merchantName={detail.transaction.merchant.name}
              size="lg"
              transactionKind={detail.transaction.kind}
            />
            <div className="min-w-0 pt-0.5">
              <h1
                className="wrap-break-word text-[26px] font-semibold leading-8 tracking-[-0.04em] text-[#101a35] sm:text-[30px]"
                id="inbox-item-detail-title">
                {detail.transaction.merchant.name}
              </h1>
              <p className="mt-1 text-[13px] text-[#71809a]">
                <time dateTime={detail.transaction.occurredAt}>
                  {formatDetailDate(
                    detail.transaction.occurredAt,
                    locale,
                    timeZone,
                  )}
                </time>
                <span aria-hidden="true"> · </span>
                {formatDetailTime(
                  detail.transaction.occurredAt,
                  locale,
                  timeZone,
                )}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {confirmedCategory ? (
                  <CategoryBadge label={confirmedCategory} />
                ) : null}
                {detail.transaction.account ? (
                  <MutedBadge label={detail.transaction.account.displayName} />
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <StatusBadge
              label={statusLabel(detail.status, labels)}
              status={detail.status}
            />
            <span
              className={`whitespace-nowrap text-[22px] font-semibold tabular-nums tracking-[-0.035em] ${transactionAmountTone(detail.transaction.kind) === "positive" ? "text-[#078652]" : "text-[#17243e]"}`}>
              {formatTransactionAmount(
                detail.transaction.amount,
                detail.transaction.kind,
                locale,
              )}
            </span>
          </div>
        </div>
      </section>

      <div className="mt-6 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(290px,320px)] xl:gap-x-7 xl:gap-y-4">
        <AttentionSurface detail={detail} labels={labels} />
        <ClassificationSurface
          categoryLabel={confirmedCategory}
          detail={detail}
          labels={labels}
        />
        <SuggestionSurface
          categoryOptions={categoryOptions}
          detail={detail}
          labels={labels}
          locale={locale}
        />
        <TransactionInformationSurface
          categoryLabel={confirmedCategory}
          detail={detail}
          labels={labels}
          locale={locale}
          timeZone={timeZone}
        />
        <SimilarTransactionsSurface
          detail={detail}
          labels={labels}
          locale={locale}
          timeZone={timeZone}
          workspaceSlug={workspaceSlug}
        />
        <ContextSurface
          detail={detail}
          labels={labels}
          workspaceSlug={workspaceSlug}
        />
        <NotesSurface detail={detail} labels={labels} />
        <ActivitySurface
          detail={detail}
          labels={labels}
          locale={locale}
          timeZone={timeZone}
        />
      </div>
    </main>
  );
}

function AttentionSurface({
  detail,
  labels,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
}) {
  if (detail.attentionReasons.length === 0) return null;

  return (
    <section
      aria-labelledby="inbox-attention-heading"
      className={`${surfaceClassName} order-1 xl:col-start-2 xl:row-start-1`}>
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-[8px] bg-[#fff4e8] text-[#b8672f]">
          <CircleAlert aria-hidden className="size-4" />
        </span>
        <h2
          className="text-[16px] font-semibold tracking-[-0.02em] text-[#18243d]"
          id="inbox-attention-heading">
          {labels.whyAttention}
        </h2>
      </div>
      <ul className="mt-3 divide-y divide-[#eef1f5]">
        {detail.attentionReasons.map((reason) => (
          <li className="py-3 first:pt-0 last:pb-0" key={reason}>
            <p className="text-[13px] font-medium text-[#30405c]">
              {labels.reason[reason].title}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-[#71809a]">
              {labels.reason[reason].description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClassificationSurface({
  detail,
  labels,
  categoryLabel,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
  readonly categoryLabel: string | null;
}) {
  const content =
    detail.currentClassification.state === "CONFIRMED" ? (
      <>
        <p className="text-[13px] font-medium text-[#33425e]">
          {labels.classification.confirmed}
        </p>
        <div className="mt-2">
          <CategoryBadge label={categoryLabel!} />
        </div>
      </>
    ) : detail.currentClassification.state === "UNCERTAIN" ? (
      <>
        <p className="text-[14px] font-medium text-[#33425e]">
          {labels.classification.uncertain}
        </p>
        <p className="mt-1 text-[13px] leading-5 text-[#71809a]">
          {labels.classification.uncertainDescription}
        </p>
      </>
    ) : (
      <>
        <p className="text-[14px] font-medium text-[#33425e]">
          {labels.classification.uncategorized}
        </p>
        <p className="mt-1 text-[13px] leading-5 text-[#71809a]">
          {labels.classification.uncategorizedDescription}
        </p>
      </>
    );
  return (
    <section
      aria-labelledby="inbox-classification-heading"
      className={`${surfaceClassName} order-2 xl:col-start-1 xl:row-start-1`}>
      <h2
        className="text-[17px] font-semibold tracking-tight text-[#15213a]"
        id="inbox-classification-heading">
        {labels.currentClassification}
      </h2>
      <div className="mt-3">{content}</div>
    </section>
  );
}

function SuggestionSurface({
  categoryOptions,
  detail,
  labels,
  locale,
}: {
  readonly categoryOptions: TransactionCategoryOptionsState;
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
  readonly locale: string;
}) {
  const categoryKind = detail.transaction.kind === "EXPENSE" || detail.transaction.kind === "INCOME"
    ? detail.transaction.kind
    : null;
  const showResolutionSurface = !detail.capabilities.isResolved
    && detail.currentClassification.state !== "CONFIRMED"
    && (detail.suggestion !== null || detail.capabilities.canChooseCategory);
  if (!showResolutionSurface) return null;

  const suggestionLabel = detail.suggestion
    ? labels.systemCategory(detail.suggestion.category)
    : null;
  const currentCategory = detail.currentClassification.category
    ? {
        id: detail.currentClassification.category.id,
        label: labels.systemCategory(detail.currentClassification.category),
      }
    : null;
  return (
    <section
      aria-labelledby="inbox-suggestion-heading"
      className={`${surfaceClassName} order-3 xl:col-start-1 xl:row-start-2`}>
      <div className="flex items-center justify-between gap-3">
        <h2
          className="text-[17px] font-semibold tracking-tight text-[#15213a]"
          id="inbox-suggestion-heading">
          {labels.suggestion}
        </h2>
        {detail.suggestion ? (
          <span className="inline-flex shrink-0 rounded-[7px] bg-[#eef4ff] px-2 py-1 text-[11px] font-medium text-[#2767dc]">
            {labels.confidence[detail.suggestion.confidence]}
          </span>
        ) : null}
      </div>
      {suggestionLabel ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CategoryBadge label={suggestionLabel} />
        </div>
      ) : null}
      <p className="mt-3 text-[13px] leading-5 text-[#71809a]">
        {detail.suggestion
          ? labels.suggestionDescription
          : labels.classification.uncategorizedDescription}
      </p>
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
        suggestion={detail.suggestion && suggestionLabel
          ? {
              id: detail.suggestion.category.id,
              label: suggestionLabel,
              updatedAt: detail.suggestion.updatedAt,
            }
          : null}
        transactionAmount={formatTransactionAmount(
          detail.transaction.amount,
          detail.transaction.kind,
          locale,
        )}
        transactionLabel={detail.transaction.merchant.name}
        workspaceId={detail.workspaceId}
      />
    </section>
  );
}

function TransactionInformationSurface({
  detail,
  labels,
  categoryLabel,
  locale,
  timeZone,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
  readonly categoryLabel: string | null;
  readonly locale: string;
  readonly timeZone: string;
}) {
  const transaction = detail.transaction;
  return (
    <section
      aria-labelledby="inbox-information-heading"
      className={`${surfaceClassName} order-4 xl:col-start-1 xl:row-start-3`}>
      <h2
        className="border-b border-[#edf0f4] pb-3 text-[17px] font-semibold tracking-tight text-[#15213a]"
        id="inbox-information-heading">
        {labels.transactionInformation}
      </h2>
      <dl className="divide-y divide-[#f0f2f5]">
        {transaction.merchantName ? (
          <DetailRow icon={UserRound} label={labels.field.merchant}>
            {transaction.merchantName}
          </DetailRow>
        ) : null}
        {categoryLabel ? (
          <DetailRow icon={Tag} label={labels.field.category}>
            <CategoryBadge label={categoryLabel} />
          </DetailRow>
        ) : null}
        {transaction.account ? (
          <DetailRow icon={CreditCard} label={labels.field.account}>
            {transaction.account.displayName}
          </DetailRow>
        ) : null}
        <DetailRow icon={CalendarDays} label={labels.field.date}>
          <time dateTime={transaction.occurredAt}>
            {formatDetailDate(transaction.occurredAt, locale, timeZone)}
          </time>
        </DetailRow>
        <DetailRow icon={Clock3} label={labels.field.time}>
          {formatDetailTime(transaction.occurredAt, locale, timeZone)}
        </DetailRow>
        <DetailRow icon={Tag} label={labels.field.type}>
          {transaction.kind === "OPENING_BALANCE" ? labels.technical : labels.transactionKind[transaction.kind]}
        </DetailRow>
        <DetailRow icon={CircleAlert} label={labels.field.status}>
          {labels.transactionStatus[transaction.status]}
        </DetailRow>
        <DetailRow icon={CreditCard} label={labels.field.amount}>
          <span className="font-semibold tabular-nums">
            {formatTransactionAmount(
              transaction.amount,
              transaction.kind,
              locale,
            )}
          </span>
        </DetailRow>
        <DetailRow icon={FileText} label={labels.field.transactionId}>
          <span className="break-all font-mono text-[11px] text-[#71809a]">
            {transaction.technicalId}
          </span>
        </DetailRow>
      </dl>
    </section>
  );
}

function SimilarTransactionsSurface({
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
  return (
    <section
      aria-labelledby="inbox-similar-heading"
      className={`${surfaceClassName} order-5 xl:col-start-1 xl:row-start-4`}>
      <h2
        className="text-[17px] font-semibold tracking-tight text-[#15213a]"
        id="inbox-similar-heading">
        {labels.similarTransactions}
      </h2>
      {detail.similarTransactions.length ? (
        <ul className="mt-2 divide-y divide-[#edf0f4]">
          {detail.similarTransactions.map((transaction) => (
            <li key={transaction.id}>
              <Link
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] py-3 transition-colors hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                href={`/w/${workspaceSlug}/transactions/${transaction.id}`}>
                <TransactionIcon
                  categoryKey={transaction.category?.key}
                  merchantLogoKey={transaction.merchant.merchantLogoKey}
                  merchantName={transaction.merchant.name}
                  size="sm"
                  transactionKind={transaction.kind}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[#34405a]">
                    {transaction.merchant.name}
                  </span>
                  <time
                    className="mt-0.5 block text-[11px] text-[#7b889e]"
                    dateTime={transaction.occurredAt}>
                    {formatDetailDate(transaction.occurredAt, locale, timeZone)}
                  </time>
                </span>
                <span className="text-right">
                  <span
                    className={`block whitespace-nowrap text-[12px] font-semibold tabular-nums ${transactionAmountTone(transaction.kind) === "positive" ? "text-[#078652]" : "text-[#26334c]"}`}>
                    {formatTransactionAmount(
                      transaction.amount,
                      transaction.kind,
                      locale,
                    )}
                  </span>
                  {transaction.category ? (
                    <span className="mt-0.5 block max-w-26 truncate text-[11px] text-[#7b889e]">
                      {labels.systemCategory({
                        name: transaction.category.label,
                        systemKey: transaction.category.key,
                      })}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] leading-5 text-[#71809a]">
          {labels.similarEmpty}
        </p>
      )}
    </section>
  );
}

function ContextSurface({
  detail,
  labels,
  workspaceSlug,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
  readonly workspaceSlug: string;
}) {
  const { context } = detail;
  if (!context.account && !context.source && !context.recurring) return null;
  return (
    <section
      aria-labelledby="inbox-context-heading"
      className={`${surfaceClassName} order-6 xl:col-start-2 xl:row-start-2`}>
      <h2
        className="text-[16px] font-semibold tracking-[-0.02em] text-[#18243d]"
        id="inbox-context-heading">
        {labels.context}
      </h2>
      <dl className="mt-2 divide-y divide-[#eef1f5]">
        {context.account ? (
          <CompactContext label={labels.account}>
            {context.account.name}
          </CompactContext>
        ) : null}
        {context.source ? (
          <CompactContext label={labels.source}>
            {labels.sourceValue[context.source]}
          </CompactContext>
        ) : null}
        {context.recurring ? (
          <CompactContext label={labels.recurring}>
            <Link
              className="inline-flex items-center gap-1 text-[#336fd9] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              href={`/w/${workspaceSlug}/recurring/${context.recurring.id}`}>
              <Repeat2 aria-hidden className="size-3.5" />
              {context.recurring.displayName ?? labels.recurring}
            </Link>
          </CompactContext>
        ) : null}
      </dl>
    </section>
  );
}

function NotesSurface({
  detail,
  labels,
}: {
  readonly detail: InboxItemDetail;
  readonly labels: InboxDetailLabels;
}) {
  return (
    <section
      aria-labelledby="inbox-notes-heading"
      className={`${surfaceClassName} order-7 xl:col-start-2 xl:row-start-3`}>
      <div className="flex items-center gap-2">
        <FileText aria-hidden className="size-4 text-[#71809a]" />
        <h2
          className="text-[16px] font-semibold tracking-[-0.02em] text-[#18243d]"
          id="inbox-notes-heading">
          {labels.notes}
        </h2>
      </div>
      <p className="mt-3 whitespace-pre-wrap wrap-break-word text-[13px] leading-5 text-[#66758e]">
        {detail.transaction.note ?? labels.notesEmpty}
      </p>
    </section>
  );
}

function ActivitySurface({
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
    <section
      aria-labelledby="inbox-activity-heading"
      className={`${surfaceClassName} order-8 xl:col-start-2 xl:row-start-4`}>
      <div className="flex items-center gap-2">
        <History aria-hidden className="size-4 text-[#71809a]" />
        <h2
          className="text-[16px] font-semibold tracking-[-0.02em] text-[#18243d]"
          id="inbox-activity-heading">
          {labels.activity}
        </h2>
      </div>
      <ol className="mt-3 space-y-3">
        {detail.activity.map((activity) => (
          <li className="border-l border-[#dce5f0] pl-3" key={activity.id}>
            <p className="text-[13px] font-medium text-[#34405a]">
              {labels.activityEvent[activity.event]}
            </p>
            <time
              className="mt-0.5 block text-[11px] text-[#7b889e]"
              dateTime={activity.occurredAt}>
              {formatDetailTimestamp(activity.occurredAt, locale, timeZone)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(8rem,0.76fr)_minmax(0,1.24fr)] gap-3 py-3 text-[13px]">
      <dt className="flex items-center gap-2 text-[#71809a]">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {label}
      </dt>
      <dd className="min-w-0 wrap-break-word text-right font-medium text-[#34405a]">
        {children}
      </dd>
    </div>
  );
}

function CompactContext({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <dt className="text-[11px] font-medium text-[#8a96aa]">{label}</dt>
      <dd className="mt-0.5 wrap-break-word text-[13px] font-medium text-[#40506a]">
        {children}
      </dd>
    </div>
  );
}

function CategoryBadge({ label }: { readonly label: string }) {
  return (
    <span className="inline-flex max-w-full truncate rounded-[7px] bg-[#f2f4f7] px-2.5 py-1 text-[11px] font-medium text-[#596780]">
      {label}
    </span>
  );
}

function MutedBadge({ label }: { readonly label: string }) {
  return (
    <span className="inline-flex max-w-full truncate rounded-[7px] bg-[#f7f9fb] px-2.5 py-1 text-[11px] font-medium text-[#687790]">
      {label}
    </span>
  );
}

function StatusBadge({
  label,
  status,
}: {
  readonly label: string;
  readonly status: InboxItemDetail["status"];
}) {
  const className =
    status === "OPEN"
      ? "bg-[#fff4e8] text-[#b8672f]"
      : status === "RESOLVED"
        ? "bg-[#eaf8f1] text-[#11845d]"
        : "bg-[#f1f3f6] text-[#66758e]";
  return (
    <span
      className={`inline-flex rounded-[7px] px-2.5 py-1 text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}

function statusLabel(
  status: InboxItemDetail["status"],
  labels: InboxDetailLabels,
): string {
  return status === "OPEN"
    ? labels.status.open
    : status === "RESOLVED"
      ? labels.status.resolved
      : labels.status.dismissed;
}
