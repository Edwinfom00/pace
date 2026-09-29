"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import { RecurringStatusBadge } from "@/modules/recurring/ui/components/recurring-status-badge";

import type { InboxDetailLabels } from "../inbox-detail-labels";

type Action = "CONFIRM" | "IGNORE";

function createIdempotencyKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `inbox-recurring-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function failureCode(payload: unknown): string | undefined {
  return typeof payload === "object" && payload !== null && "code" in payload && typeof payload.code === "string"
    ? payload.code
    : undefined;
}

export function InboxRecurringResolutionActions({
  capabilities,
  expectedInboxUpdatedAt,
  inboxItemId,
  labels,
  locale,
  recurring,
  title,
  workspaceId,
}: {
  readonly capabilities: { readonly actionOwner: "RECURRING"; readonly recurringId: string; readonly canConfirm: boolean; readonly canIgnore: boolean };
  readonly expectedInboxUpdatedAt: string;
  readonly inboxItemId: string;
  readonly labels: InboxDetailLabels["recurringResolution"];
  readonly locale: string;
  readonly recurring: { readonly id: string; readonly displayName: string | null; readonly status: "CANDIDATE" | "CONFIRMED" | "IGNORED"; readonly lifecycle: "ACTIVE" | "PAUSED"; readonly typicalAmountMinor: string; readonly currency: string; readonly cadenceDays: number };
  readonly title: string;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  if (!capabilities.canConfirm && !capabilities.canIgnore) return null;

  const copy = action === "CONFIRM" ? labels.confirm : action === "IGNORE" ? labels.ignore : null;
  const amount = formatOverviewMoney(recurring.typicalAmountMinor, recurring.currency, locale);
  const cadence = labels.cadenceEveryDays.replace("{days}", String(recurring.cadenceDays));

  function open(nextAction: Action) {
    setAction(nextAction);
    idempotencyKey.current = null;
    setReason("");
    setError(null);
    setConflict(false);
  }

  function close() {
    if (pending) return;
    setAction(null);
    setError(null);
    setConflict(false);
  }

  function refreshLatest() {
    if (pending) return;
    close();
    router.refresh();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || pending) return;

    setPending(true);
    setError(null);
    setConflict(false);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/inbox/${encodeURIComponent(inboxItemId)}/recurring`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            expectedInboxUpdatedAt,
            idempotencyKey: idempotencyKey.current ?? (idempotencyKey.current = createIdempotencyKey()),
            ...(action === "IGNORE" && reason.trim() ? { reason: reason.trim() } : {}),
          }),
        },
      );
      if (response.ok) {
        close();
        router.refresh();
        return;
      }

      const code = failureCode(await response.json().catch(() => null));
      if (["INBOX_ITEM_STALE", "CONCURRENT_MODIFICATION", "INBOX_REASON_ALREADY_RESOLVED"].includes(code ?? "")) {
        setError(labels.conflict);
        setConflict(true);
      } else if (["INBOX_ACTION_NOT_ALLOWED", "INBOX_ITEM_NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN"].includes(code ?? "")) {
        setError(labels.notAvailable);
      } else {
        setError(copy?.failed ?? labels.notAvailable);
      }
    } catch {
      setError(copy?.failed ?? labels.notAvailable);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <RecurringStatusBadge lifecycle={recurring.lifecycle} labels={labels} status={recurring.status} />
        <span className="text-[13px] font-semibold tabular-nums text-[#26334c]">{amount}</span>
        <span className="text-[12px] text-[#728099]">{cadence}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {capabilities.canConfirm ? <Button disabled={pending} onClick={() => open("CONFIRM")} size="sm" type="button">{labels.confirm.title}</Button> : null}
        {capabilities.canIgnore ? <Button disabled={pending} onClick={() => open("IGNORE")} size="sm" type="button" variant="outline">{labels.ignore.title}</Button> : null}
      </div>
      <ResponsiveDialog onOpenChange={(isOpen) => { if (!isOpen) close(); }} open={action !== null}>
        <ResponsiveDialogContent className="max-w-md gap-0 rounded-[14px] border-[#e3e8ef] p-0" drawerClassName="max-h-[88dvh] rounded-t-[16px]">
          {action && copy ? (
            <form onSubmit={submit}>
              <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                <ResponsiveDialogHeader>
                  <ResponsiveDialogTitle className="text-[18px] font-semibold tracking-[-0.02em] text-[#17243e]">{copy.title}</ResponsiveDialogTitle>
                  <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#65748b]">{copy.description}</ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                <div className="mt-5 rounded-[10px] bg-[#f6f8fb] px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13px] font-semibold text-[#1d2941]">{recurring.displayName ?? title}</p>
                    <RecurringStatusBadge lifecycle={recurring.lifecycle} labels={labels} status={recurring.status} />
                  </div>
                  <p className="mt-1 text-[12px] text-[#728099]">{amount} · {cadence}</p>
                </div>
                {action === "IGNORE" ? (
                  <label className="mt-4 block text-[12px] font-medium text-[#53627b]">
                    {labels.ignore.reason}
                    <Textarea className="mt-1.5 min-h-20 resize-y border-[#dce3ec] text-[13px]" disabled={pending} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={labels.ignore.reasonPlaceholder} value={reason} />
                  </label>
                ) : null}
                {error ? <p className="mt-4 text-[12px] leading-5 text-[#b42318]" role="alert">{error}</p> : null}
                <p aria-live="polite" className="sr-only">{pending ? copy.pending : ""}</p>
              </div>
              <ResponsiveDialogFooter className="mt-5 border-t border-[#edf0f4] px-5 py-4 sm:px-6">
                {conflict ? <Button disabled={pending} onClick={refreshLatest} type="button">{labels.reloadLatest}</Button> : <Button disabled={pending} onClick={close} type="button" variant="outline">{labels.cancel}</Button>}
                <Button disabled={pending || conflict} type="submit">{pending ? copy.pending : copy.submit}</Button>
              </ResponsiveDialogFooter>
            </form>
          ) : null}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
