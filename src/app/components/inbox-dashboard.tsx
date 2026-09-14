"use client";

import { useState } from "react";

import { FinanceNavigation } from "@/app/components/finance-navigation";
import type { InboxAction } from "@/modules/financial-inbox/domain";
import type { FinancialInboxView } from "@/modules/financial-inbox/financial-inbox-service";
import { getTranslations, type MessageKey, type SupportedLanguage } from "@/i18n/messages";

type Category = { id: string; name: string; kind: "EXPENSE" | "INCOME" };

export function InboxDashboard({
  categories,
  initialItems,
  language,
  locale,
  workspaceId,
}: {
  categories: readonly Category[];
  initialItems: readonly FinancialInboxView[];
  language: SupportedLanguage;
  locale: string;
  workspaceId: string | null;
}) {
  const t = getTranslations(language);
  const [items, setItems] = useState<readonly FinancialInboxView[]>(initialItems);
  const [categoryIds, setCategoryIds] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const openItems = items.filter((item) => item.status === "OPEN");
  const resolvedItems = items.filter((item) => item.status !== "OPEN");

  const resolve = async (item: FinancialInboxView, action: InboxAction) => {
    if (!workspaceId) return;
    setError(false);
    setSavingId(item.id);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/inbox/${item.id}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, categoryId: categoryIds[item.id] || undefined }),
      });
      if (!response.ok) throw new Error("resolve_failed");
      const payload = (await response.json()) as { item: { status: FinancialInboxView["status"] } };
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id ? { ...candidate, status: payload.item.status } : candidate,
        ),
      );
    } catch {
      setError(true);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="finance-shell">
      <FinanceNavigation active="inbox" language={language} />
      <section className="finance-content" aria-label={t("inbox.title")}>
        <header className="finance-page-header">
          <div>
            <p className="finance-kicker">{t("brand.name")}</p>
            <h1>{t("inbox.title")}</h1>
            <p>{t("inbox.subtitle")}</p>
          </div>
          <span className="finance-count">{openItems.length}</span>
        </header>
        {error ? <p className="finance-error">{t("inbox.error")}</p> : null}
        {items.length === 0 ? <p className="finance-empty">{t("inbox.empty")}</p> : null}
        {openItems.length > 0 ? (
          <section className="finance-section" aria-label={t("inbox.open")}>
            <h2>{t("inbox.open")}</h2>
            <div className="finance-list">
              {openItems.map((item) => (
                <InboxCard
                  categories={categories}
                  categoryId={categoryIds[item.id] ?? item.classification?.suggestedCategoryId ?? ""}
                  item={item}
                  key={item.id}
                  locale={locale}
                  saving={savingId === item.id}
                  setCategoryId={(categoryId) =>
                    setCategoryIds((current) => ({ ...current, [item.id]: categoryId }))
                  }
                  t={t}
                  onResolve={resolve}
                />
              ))}
            </div>
          </section>
        ) : null}
        {resolvedItems.length > 0 ? (
          <section className="finance-section" aria-label={t("inbox.resolved")}>
            <h2>{t("inbox.resolved")}</h2>
            <div className="finance-list">
              {resolvedItems.map((item) => (
                <InboxCard
                  categories={categories}
                  categoryId={item.classification?.appliedCategoryId ?? ""}
                  item={item}
                  key={item.id}
                  locale={locale}
                  saving={false}
                  setCategoryId={() => undefined}
                  t={t}
                  onResolve={() => Promise.resolve()}
                />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function InboxCard({
  categories,
  categoryId,
  item,
  locale,
  saving,
  setCategoryId,
  t,
  onResolve,
}: {
  categories: readonly Category[];
  categoryId: string;
  item: FinancialInboxView;
  locale: string;
  saving: boolean;
  setCategoryId: (categoryId: string) => void;
  t: ReturnType<typeof getTranslations>;
  onResolve: (item: FinancialInboxView, action: InboxAction) => Promise<void>;
}) {
  const reasonKey = `inbox.reason.${item.reason}` as MessageKey;
  const sourceKey = item.classification
    ? (`classification.source.${item.classification.source}` as MessageKey)
    : null;
  const needsCategory = item.actions.includes("CLASSIFY_TRANSACTION") || item.actions.includes("CREATE_RULE");
  const eligibleCategories = categories.filter((category) => category.kind === item.transaction.kind);
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(item.transaction.occurredAt),
  );
  const amount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: item.transaction.currency,
    maximumFractionDigits: 0,
  }).format(Number(item.transaction.amountMinor));

  return (
    <article className="finance-item">
      <div className="finance-item-main">
        <div className="finance-item-icon" aria-hidden="true">{item.transaction.merchantName?.slice(0, 1) ?? "?"}</div>
        <div>
          <h3>{item.transaction.merchantName ?? t("common.unknownMerchant")}</h3>
          <p>{date}</p>
        </div>
      </div>
      <strong className="finance-amount">{amount}</strong>
      <div className="finance-item-reason">
        <span className="finance-chip">{t(reasonKey)}</span>
        {sourceKey ? <span>{t("inbox.source")}: {t(sourceKey)}</span> : null}
        {item.classification ? <span>{t("inbox.confidence")}: {Math.round(item.classification.confidence * 100)}%</span> : null}
      </div>
      {item.status === "OPEN" ? (
        <div className="finance-item-actions">
          {needsCategory ? (
            <label className="finance-category-control">
              <span>{t("inbox.category")}</span>
              <select onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
                <option value="">{t("inbox.chooseCategory")}</option>
                {eligibleCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          {item.actions.map((action) => (
            <button
              className={action === "DISMISS" || action === "IGNORE_RECURRING" ? "finance-secondary-button" : ""}
              disabled={saving || ((action === "CLASSIFY_TRANSACTION" || action === "CREATE_RULE") && !categoryId)}
              key={action}
              onClick={() => void onResolve(item, action)}
              type="button"
            >
              {t(actionLabel(action))}
            </button>
          ))}
        </div>
      ) : <span className="finance-resolved">{t("inbox.saved")}</span>}
    </article>
  );
}

function actionLabel(action: InboxAction): MessageKey {
  const labels: Record<InboxAction, MessageKey> = {
    CLASSIFY_TRANSACTION: "inbox.resolve",
    CREATE_RULE: "inbox.createRule",
    REVIEW_TRANSFER: "inbox.reviewTransfer",
    CONFIRM_RECURRING: "inbox.confirmRecurring",
    IGNORE_RECURRING: "inbox.ignoreRecurring",
    DISMISS: "inbox.dismiss",
  };
  return labels[action];
}
