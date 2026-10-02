"use client";

import { useState, type ReactNode } from "react";
import { FiMoreHorizontal } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import type { RuleListItem } from "@/modules/plans/rules/rules-overview";

import type { RulesUiLabels } from "../rules-ui-labels";

type RuleMutation = "ENABLE" | "DISABLE" | "ARCHIVE";

export function ruleToggleMutation(rule: Pick<RuleListItem, "status" | "capabilities">): "ENABLE" | "DISABLE" | null {
  if (!rule.capabilities.canToggle) return null;
  if (rule.status === "ACTIVE") return "DISABLE";
  if (rule.status === "PAUSED") return "ENABLE";
  return null;
}

export function RuleManagementActions({
  editAction,
  labels,
  onChanged,
  rule,
  workspaceId,
}: {
  readonly editAction?: ReactNode;
  readonly labels: RulesUiLabels;
  readonly onChanged: () => void;
  readonly rule: RuleListItem;
  readonly workspaceId: string;
}) {
  const [pending, setPending] = useState<RuleMutation | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const toggle = ruleToggleMutation(rule);

  const request = async (action: RuleMutation) => {
    if (pending) return;
    setPending(action);
    setError(null);
    setConflict(false);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/plans/rules/${encodeURIComponent(rule.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            expectedUpdatedAt: rule.updatedAt,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        else setError(labels.actionError);
        return;
      }
      setArchiveOpen(false);
      onChanged();
    } catch {
      setError(labels.actionError);
    } finally {
      setPending(null);
    }
  };

  if (!toggle && !rule.capabilities.canArchive && !editAction) return null;

  const feedback = (
    <>
      {conflict ? (
        <p className="w-full text-right text-[12px] text-[#c23445]" role="alert">
          {labels.changed}{" "}
          <button className="underline" onClick={onChanged} type="button">
            {labels.reload}
          </button>
        </p>
      ) : null}
      {error ? (
        <p className="w-full text-right text-[12px] text-[#c23445]" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {rule.capabilities.canArchive ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={labels.more}
              className="grid size-9 place-items-center rounded-[9px] border border-[#e5e9f0] text-[#53627b] transition-colors hover:border-[#c9d4e3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2867e8]"
              disabled={pending !== null}
              type="button"
            >
              <FiMoreHorizontal aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem onSelect={() => setArchiveOpen(true)} variant="destructive">
              {labels.archive}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {editAction}
      {toggle ? (
        <Button
          className="h-9 min-w-24 rounded-[9px]"
          disabled={pending !== null}
          onClick={() => void request(toggle)}
          type="button"
          variant={toggle === "DISABLE" ? "default" : "outline"}
        >
          {pending === toggle
            ? toggle === "DISABLE"
              ? labels.disabling
              : labels.enabling
            : toggle === "DISABLE"
              ? labels.disable
              : labels.enable}
        </Button>
      ) : null}
      {archiveOpen ? null : feedback}
      <ResponsiveDialog
        mobilePresentation="dialog"
        onOpenChange={(open) => {
          if (pending) return;
          setArchiveOpen(open);
          if (!open) {
            setError(null);
            setConflict(false);
          }
        }}
        open={archiveOpen}
      >
        <ResponsiveDialogContent
          className="w-[calc(100%-2rem)] max-w-md rounded-[12px] border border-[#dfe6ef] bg-white p-5"
          showCloseButton={pending === null}
        >
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{labels.archiveTitle}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{labels.archiveDescription}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="mt-3 flex flex-col gap-1">{feedback}</div>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              className="min-w-20 rounded-md"
              disabled={pending !== null}
              onClick={() => setArchiveOpen(false)}
              type="button"
              variant="outline"
            >
              {labels.cancel}
            </Button>
            <Button
              className="min-w-20 rounded-md"
              disabled={pending !== null}
              onClick={() => void request("ARCHIVE")}
              type="button"
              variant="destructive"
            >
              {pending === "ARCHIVE" ? labels.archiving : labels.archive}
            </Button>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
