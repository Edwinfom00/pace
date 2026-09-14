"use client";

import { useEffect, useMemo, useState } from "react";

import { useEveAgent, type EveDynamicToolPart } from "eve/react";

import { getTranslations, type MessageKey, type SupportedLanguage } from "@/i18n/messages";

type TransactionDraft = {
  kind: "EXPENSE" | "INCOME" | "TRANSFER";
  amountText: string | null;
  occurredAt: string | null;
  accountId: string | null;
  transferAccountId: string | null;
  categoryId: string | null;
  missingFields: readonly ("amount" | "date" | "account" | "destinationAccount" | "category")[];
};

type PlanDraft =
  | {
      planType: "BUDGET";
      operation: "CREATE" | "UPDATE";
      scope: "OVERALL" | "CATEGORY" | null;
      categoryId: string | null;
      amountText: string | null;
      startsOn: string | null;
      endsOn: string | null;
      missingFields: readonly string[];
    }
  | {
      planType: "SAVINGS_GOAL";
      operation: "CREATE" | "UPDATE";
      name: string | null;
      targetAmountText: string | null;
      currentSavedText: string | null;
      targetDate: string | null;
      missingFields: readonly string[];
    };

type TransactionAction = {
  id: string;
  type: "TRANSACTION_CREATE";
  status: "DRAFT" | "WAITING_APPROVAL" | "APPROVED" | "REJECTED" | "EXECUTING" | "COMPLETED" | "FAILED";
  draft: TransactionDraft;
};

type PlanAction = {
  id: string;
  type: "BUDGET_CREATE" | "BUDGET_UPDATE" | "SAVINGS_GOAL_CREATE" | "SAVINGS_GOAL_UPDATE";
  status: "DRAFT" | "WAITING_APPROVAL" | "APPROVED" | "REJECTED" | "EXECUTING" | "COMPLETED" | "FAILED";
  draft: PlanDraft;
};

type Action = TransactionAction | PlanAction;

type TransactionContext = {
  accounts: readonly { id: string; name: string; currency: string }[];
  categories: readonly { id: string; name: string; kind: "EXPENSE" | "INCOME" }[];
};

type ActionDetail = { action: Action; transactionContext?: TransactionContext };

export function AskPace({
  language,
  workspaceId,
}: {
  language: SupportedLanguage;
  workspaceId: string | null;
}) {
  const t = getTranslations(language);
  const [message, setMessage] = useState("");
  const agent = useEveAgent({
    headers: (): Readonly<Record<string, string>> =>
      workspaceId ? { "x-pace-workspace-id": workspaceId } : {},
  });
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const actions = useMemo(() => collectActions(agent.data.messages), [agent.data.messages]);

  if (!workspaceId) {
    return (
      <section className="pace-panel pace-empty" aria-label={t("askPace.title")}>
        <h1>{t("askPace.title")}</h1>
        <p>{t("askPace.noWorkspace")}</p>
      </section>
    );
  }

  return (
    <main className="pace-shell">
      <section className="pace-panel" aria-label={t("askPace.title")}>
        <header className="pace-header">
          <div className="pace-mark" aria-hidden="true">{t("brand.short")}</div>
          <div>
            <p className="pace-eyebrow">{t("brand.name")}</p>
            <h1>{t("askPace.title")}</h1>
            <p>{t("askPace.subtitle")}</p>
          </div>
        </header>

        <div className="pace-thread" aria-live="polite">
          {agent.data.messages.map((chatMessage) => (
            <article className={`pace-message pace-message-${chatMessage.role}`} key={chatMessage.id}>
              <p className="pace-message-label">
                {chatMessage.role === "user" ? t("askPace.you") : t("askPace.assistant")}
              </p>
              {chatMessage.parts.map((part, index) =>
                part.type === "text" ? <p key={index}>{part.text}</p> : null,
              )}
            </article>
          ))}
          {busy ? <p className="pace-thinking">{t("askPace.thinking")}</p> : null}
          {agent.status === "error" ? <p className="pace-error">{t("askPace.error")}</p> : null}
        </div>

        <div className="pace-actions">
          {[...actions.entries()].map(([actionId, approvalRequestId]) => (
            <ActionCard
              actionId={actionId}
              approvalRequestId={approvalRequestId}
              key={actionId}
              language={language}
              onRequestReview={() => void agent.send(t("askPace.reviewMessage", { actionId }))}
              onApprove={(requestId) => agent.respond([{ requestId, optionId: "approve" }])}
              onReject={async (requestId) => {
                const response = await fetch(
                  `/api/workspaces/${workspaceId}/agent-actions/${actionId}/reject`,
                  { method: "POST" },
                );
                if (!response.ok) throw new Error("reject_failed");
                await agent.respond([{ requestId, optionId: "cancel" }]);
              }}
              workspaceId={workspaceId}
            />
          ))}
        </div>

        <form
          className="pace-composer"
          onSubmit={(event) => {
            event.preventDefault();
            const nextMessage = message.trim();
            if (!nextMessage || agent.status === "resuming") return;
            setMessage("");
            void agent.send(nextMessage, busy ? { turnPolicy: "steer" } : undefined);
          }}
        >
          <input
            aria-label={t("askPace.placeholder")}
            disabled={agent.status === "resuming"}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("askPace.placeholder")}
            value={message}
          />
          <button disabled={!message.trim() || agent.status === "resuming"} type="submit">
            {t("askPace.send")}
          </button>
        </form>
      </section>
    </main>
  );
}

function ActionCard({
  actionId,
  approvalRequestId,
  language,
  onApprove,
  onReject,
  onRequestReview,
  workspaceId,
}: {
  actionId: string;
  approvalRequestId: string | undefined;
  language: SupportedLanguage;
  onApprove: (requestId: string) => Promise<unknown>;
  onReject: (requestId: string) => Promise<unknown>;
  onRequestReview: () => void;
  workspaceId: string;
}) {
  const t = getTranslations(language);
  const [detail, setDetail] = useState<ActionDetail | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(`/api/workspaces/${workspaceId}/agent-actions/${actionId}`)
      .then(async (response) => (response.ok ? (response.json() as Promise<ActionDetail>) : null))
      .then((next) => {
        if (active && next) setDetail(next);
      });
    return () => {
      active = false;
    };
  }, [actionId, approvalRequestId, workspaceId]);

  if (!detail) return null;
  const { action } = detail;
  if (action.type !== "TRANSACTION_CREATE") {
    return (
      <PlanActionCard
        action={action}
        approvalRequestId={approvalRequestId}
        language={language}
        onApprove={onApprove}
        onReject={onReject}
        onRequestReview={onRequestReview}
      />
    );
  }
  const transactionContext = detail.transactionContext;
  if (!transactionContext) return null;
  const statusKey = `askPace.status.${action.status}` as MessageKey;
  const categories = transactionContext.categories.filter((category) => category.kind === action.draft.kind);
  const missing = action.draft.missingFields
    .map((field) => t(`askPace.${field === "destinationAccount" ? "destination" : field}` as MessageKey))
    .join(", ");

  const save = async (form: HTMLFormElement) => {
    setSaving(true);
    try {
      const fields = new FormData(form);
      const response = await fetch(`/api/workspaces/${workspaceId}/agent-actions/${actionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountText: String(fields.get("amountText") ?? "") || null,
          occurredAtText: String(fields.get("occurredAtText") ?? "") || null,
          accountId: String(fields.get("accountId") ?? "") || null,
          transferAccountId: String(fields.get("transferAccountId") ?? "") || null,
          categoryId: String(fields.get("categoryId") ?? "") || null,
        }),
      });
      if (!response.ok) throw new Error("save_failed");
      const payload = (await response.json()) as { action: Action };
      setDetail((current) => (current ? { ...current, action: payload.action } : current));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="pace-card">
      <div className="pace-card-heading">
        <div>
          <p className="pace-eyebrow">
            {approvalRequestId ? t("askPace.approval") : t("askPace.draft")}
          </p>
          <h2>{t(statusKey)}</h2>
        </div>
        <span className="pace-status">{t(statusKey)}</span>
      </div>
      {action.status === "DRAFT" ? (
        <form
          className="pace-draft-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save(event.currentTarget);
          }}
        >
          <label>
            <span>{t("askPace.amount")}</span>
            <input defaultValue={action.draft.amountText ?? ""} name="amountText" />
          </label>
          <label>
            <span>{t("askPace.date")}</span>
            <input defaultValue={action.draft.occurredAt?.slice(0, 10) ?? ""} name="occurredAtText" type="date" />
          </label>
          <label>
            <span>{t("askPace.account")}</span>
            <select defaultValue={action.draft.accountId ?? ""} name="accountId">
              <option value="">{t("common.select")}</option>
              {transactionContext.accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          {action.draft.kind === "TRANSFER" ? (
            <label>
              <span>{t("askPace.destination")}</span>
              <select defaultValue={action.draft.transferAccountId ?? ""} name="transferAccountId">
                <option value="">{t("common.select")}</option>
                {transactionContext.accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              <span>{t("askPace.category")}</span>
              <select defaultValue={action.draft.categoryId ?? ""} name="categoryId">
                <option value="">{t("common.select")}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
          )}
          {missing ? <p className="pace-missing">{t("askPace.missing", { fields: missing })}</p> : null}
          <div className="pace-card-buttons">
            <button disabled={saving} type="submit">{t("askPace.save")}</button>
            <button onClick={onRequestReview} type="button">{t("askPace.review")}</button>
          </div>
        </form>
      ) : approvalRequestId && action.status === "WAITING_APPROVAL" ? (
        <div className="pace-card-buttons">
          <button onClick={() => void onApprove(approvalRequestId)} type="button">
            {t("askPace.approve")}
          </button>
          <button className="pace-secondary-button" onClick={() => void onReject(approvalRequestId)} type="button">
            {t("askPace.reject")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function PlanActionCard({
  action,
  approvalRequestId,
  language,
  onApprove,
  onReject,
  onRequestReview,
}: {
  action: PlanAction;
  approvalRequestId: string | undefined;
  language: SupportedLanguage;
  onApprove: (requestId: string) => Promise<unknown>;
  onReject: (requestId: string) => Promise<unknown>;
  onRequestReview: () => void;
}) {
  const t = getTranslations(language);
  const statusKey = `askPace.status.${action.status}` as MessageKey;
  const draft = action.draft;
  const missing = draft.missingFields
    .map((field) => t(`plans.field.${field}` as MessageKey))
    .join(", ");
  const title = draft.planType === "BUDGET" ? t("plans.budget") : t("plans.savingsGoal");
  return (
    <section aria-label={title} data-m5-plan-action>
      <header>
        <div>
          <p>{approvalRequestId ? t("askPace.approval") : t("plans.draft")}</p>
          <h2>{title}</h2>
        </div>
        <span>{t(statusKey)}</span>
      </header>
      {draft.planType === "BUDGET" ? (
        <dl>
          <div><dt>{t("plans.scope")}</dt><dd>{draft.scope === "OVERALL" ? t("plans.overall") : t("plans.category")}</dd></div>
          <div><dt>{t("askPace.amount")}</dt><dd>{draft.amountText ?? "—"}</dd></div>
          <div><dt>{t("plans.period")}</dt><dd>{draft.startsOn?.slice(0, 10) ?? "—"}</dd></div>
        </dl>
      ) : (
        <dl>
          <div><dt>{t("plans.savingsGoal")}</dt><dd>{draft.name ?? "—"}</dd></div>
          <div><dt>{t("plans.target")}</dt><dd>{draft.targetAmountText ?? "—"}</dd></div>
          <div><dt>{t("plans.saved")}</dt><dd>{draft.currentSavedText ?? "0"}</dd></div>
          {draft.targetDate ? <div><dt>{t("plans.targetDate")}</dt><dd>{draft.targetDate.slice(0, 10)}</dd></div> : null}
        </dl>
      )}
      {action.status === "DRAFT" ? (
        <div>
          {missing ? <p>{t("plans.missing", { fields: missing })}</p> : null}
          <button onClick={onRequestReview} type="button">{t("askPace.review")}</button>
        </div>
      ) : approvalRequestId && action.status === "WAITING_APPROVAL" ? (
        <div>
          <button onClick={() => void onApprove(approvalRequestId)} type="button">{t("askPace.approve")}</button>
          <button onClick={() => void onReject(approvalRequestId)} type="button">
            {t("askPace.reject")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function collectActions(messages: readonly { parts: readonly unknown[] }[]): Map<string, string | undefined> {
  const actions = new Map<string, string | undefined>();
  for (const message of messages) {
    for (const unknownPart of message.parts) {
      const part = unknownPart as EveDynamicToolPart;
      if (part.type !== "dynamic-tool") continue;
      const actionId = actionIdFromToolPart(part);
      if (!actionId) continue;
      if (part.state === "approval-requested") {
        actions.set(actionId, part.approval.id);
      } else if (!actions.has(actionId)) {
        actions.set(actionId, undefined);
      }
    }
  }
  return actions;
}

function actionIdFromToolPart(part: EveDynamicToolPart): string | null {
  const candidate =
    part.state === "output-available"
      ? part.output
      : "input" in part
        ? part.input
        : undefined;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const actionId = (candidate as Record<string, unknown>).actionId;
  return typeof actionId === "string" ? actionId : null;
}
