import { formatAssistantMoney } from "@/modules/pace-assistant/domain/formatters";

import {
  formatAssistantMessage,
  type AssistantMessageKey,
  type AssistantMessages,
} from "../ui/assistant-messages";

export type AssistantActionStatus =
  | "DRAFT"
  | "WAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED";

export type AssistantActionDetail = {
  readonly action: {
    readonly id: string;
    readonly type: string;
    readonly status: AssistantActionStatus;
    readonly draft: Record<string, unknown>;
    readonly result?: Record<string, unknown> | null;
    readonly failureMessage?: string | null;
  };
  readonly transactionContext?: {
    readonly accounts: readonly {
      readonly id: string;
      readonly name: string;
    }[];
    readonly categories: readonly {
      readonly id: string;
      readonly name: string;
    }[];
  };
};

export type AssistantActionField = {
  readonly label: string;
  readonly value: string;
};

export type AssistantActionView = {
  readonly title: string;
  readonly completedTitle: string;
  readonly approveLabel: string;
  readonly amount: string | null;
  readonly route: string | null;
  readonly fields: readonly AssistantActionField[];
  readonly effects: readonly string[];
  readonly incomplete: boolean;
  readonly verifiedAt: string | null;
  readonly failureMessage: string | null;
  readonly link: { readonly href: string; readonly label: string } | null;
};

type PresentContext = {
  readonly messages: AssistantMessages;
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceSlug: string;
};

const TRANSACTION_KINDS = {
  TRANSFER: {
    title: "action.title.transfer",
    done: "action.done.transfer",
    approve: "action.approveTransfer",
  },
  EXPENSE: {
    title: "action.title.expense",
    done: "action.done.expense",
    approve: "action.approveExpense",
  },
  INCOME: {
    title: "action.title.income",
    done: "action.done.income",
    approve: "action.approveIncome",
  },
} as const satisfies Record<string, Record<string, AssistantMessageKey>>;

export function presentAssistantAction(
  detail: AssistantActionDetail,
  context: PresentContext,
): AssistantActionView {
  const { action } = detail;
  const { messages } = context;
  const draft = action.draft;
  const fields: AssistantActionField[] = [];
  const push = (key: AssistantMessageKey, value: string | null) => {
    if (value) fields.push({ label: messages[key], value });
  };
  const accountName = (id: unknown) =>
    nameFor(detail.transactionContext?.accounts, id);
  const categoryName = (id: unknown) =>
    nameFor(detail.transactionContext?.categories, id);

  let title = messages["action.title.generic"];
  let completedTitle = messages["action.done.generic"];
  let approveLabel = messages["action.approve"];
  let amount: string | null = null;
  let route: string | null = null;
  let effects: readonly string[] = [];

  const summary = record(draft.approvalSummary);
  const kind =
    action.type === "TRANSACTION_CREATE" && isTransactionKind(draft.kind)
      ? draft.kind
      : null;

  if (kind) {
    const copy = TRANSACTION_KINDS[kind];
    title = messages[copy.title];
    completedTitle = messages[copy.done];
    approveLabel = messages[copy.approve];
    amount = money(draft.amountMinor, draft.currency, context.locale);
    if (kind === "TRANSFER") {
      const from = accountName(draft.accountId);
      const to = accountName(draft.transferAccountId);
      push("action.field.from", from);
      push("action.field.to", to);
      route = from && to ? `${from} → ${to}` : null;
    } else {
      push("action.field.account", accountName(draft.accountId));
      push("action.field.category", categoryName(draft.categoryId));
      push("action.field.details", text(draft.merchantName));
    }
    push("action.field.date", date(draft.occurredAt, context));
  } else if ("changeType" in draft) {
    title = messages["action.title.transactionChange"];
    const changes = record(draft.changes) ?? {};
    const current = record(draft.current) ?? {};
    amount = money(
      changes.amountMinor ?? current.amountMinor,
      draft.currency,
      context.locale,
    );
    push("action.field.account", accountName(changes.accountId));
    push("action.field.to", accountName(changes.transferAccountId));
    push("action.field.category", categoryName(changes.categoryId));
    push("action.field.details", text(changes.merchantName));
    push("action.field.date", calendarDate(changes.occurredOn, context.locale));
    push("action.field.reason", text(draft.reason));
  } else if (summary) {
    title = text(summary.title) ?? titleForType(action.type, messages);
    push("action.field.name", text(summary.name));
    push("action.field.amount", text(summary.amount));
    push("action.field.details", text(summary.transaction));
    push("action.field.reason", text(summary.issue));
    push("action.field.details", text(summary.change));
    for (const line of strings(summary.changes))
      push("action.field.details", line);
    for (const section of Array.isArray(summary.sections)
      ? summary.sections
      : []) {
      const lines = strings(record(section)?.lines);
      if (lines.length === 0) continue;
      fields.push({
        label: text(record(section)?.label) ?? messages["action.field.details"],
        value: lines.join(" · "),
      });
    }
    effects = strings(summary.effects);
  } else {
    title = titleForType(action.type, messages);
    const current = record(draft.current);
    push("action.field.name", text(draft.name) ?? text(current?.name));
    push(
      "action.field.amount",
      text(draft.amountText) ?? text(draft.targetAmountText),
    );
    push("action.field.date", calendarDate(draft.targetDate, context.locale));
  }

  const result = record(action.result);

  return {
    title,
    completedTitle,
    approveLabel,
    amount,
    route,
    fields,
    effects,
    incomplete: strings(draft.missingFields).length > 0,
    verifiedAt: text(result?.verifiedAt),
    failureMessage: text(action.failureMessage),
    link: result ? linkFor(result, context) : null,
  };
}

export function assistantReviewPrompt(
  messages: AssistantMessages,
  actionId: string,
): string {
  return formatAssistantMessage(messages, "action.reviewPrompt", {
    id: actionId,
  });
}

function titleForType(type: string, messages: AssistantMessages): string {
  if (type.startsWith("ACCOUNT_")) return messages["action.title.account"];
  if (type.startsWith("RECURRING_")) return messages["action.title.recurring"];
  if (type === "INBOX_RESOLVE") return messages["action.title.inbox"];
  if (type.startsWith("TRANSACTION_"))
    return messages["action.title.transactionChange"];
  if (/^(BUDGET|SAVINGS_GOAL|RULE)_/.test(type))
    return messages["action.title.plan"];
  return messages["action.title.generic"];
}

function linkFor(
  result: Record<string, unknown>,
  { messages, workspaceSlug }: PresentContext,
) {
  const base = `/w/${workspaceSlug}`;
  const id = (key: string) => text(result[key]);
  const segment = (value: string) => encodeURIComponent(value);
  if (id("transactionId"))
    return {
      href: `${base}/transactions/${segment(id("transactionId")!)}`,
      label: messages["action.link.transaction"],
    };
  if (id("accountId"))
    return {
      href: `${base}/accounts/${segment(id("accountId")!)}`,
      label: messages["action.link.account"],
    };
  if (id("recurringId"))
    return {
      href: `${base}/recurring/${segment(id("recurringId")!)}`,
      label: messages["action.link.recurring"],
    };
  if (id("budgetId"))
    return {
      href: `${base}/plans/budgets/${segment(id("budgetId")!)}`,
      label: messages["action.link.budget"],
    };
  if (id("goalId"))
    return {
      href: `${base}/plans/goals/${segment(id("goalId")!)}`,
      label: messages["action.link.goal"],
    };
  if (id("planId")) {
    return result.planType === "BUDGET"
      ? {
          href: `${base}/plans/budgets/${segment(id("planId")!)}`,
          label: messages["action.link.budget"],
        }
      : {
          href: `${base}/plans/goals/${segment(id("planId")!)}`,
          label: messages["action.link.goal"],
        };
  }
  if (id("ruleId"))
    return {
      href: `${base}/plans/rules`,
      label: messages["action.link.rules"],
    };
  return null;
}

function isTransactionKind(
  value: unknown,
): value is keyof typeof TRANSACTION_KINDS {
  return value === "TRANSFER" || value === "EXPENSE" || value === "INCOME";
}

function nameFor(
  items: readonly { readonly id: string; readonly name: string }[] | undefined,
  id: unknown,
): string | null {
  return typeof id === "string"
    ? (items?.find((item) => item.id === id)?.name ?? null)
    : null;
}

function money(
  minorUnits: unknown,
  currency: unknown,
  locale: string,
): string | null {
  if (typeof minorUnits !== "string" || !/^-?\d+$/.test(minorUnits))
    return null;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  return formatAssistantMoney({ minorUnits, currency }, locale);
}

function date(
  value: unknown,
  { locale, timeZone }: PresentContext,
): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

function calendarDate(value: unknown, locale: string): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value))
    return null;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
