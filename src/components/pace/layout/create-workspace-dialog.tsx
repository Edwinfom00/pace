"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import type { PaceSidebarLabels } from "./sidebar-types";
import { WorkspaceAvatar } from "./workspace-avatar";

type CreatedWorkspaceResponse = {
  workspace: {
    slug: string;
  };
};

type CreateWorkspaceErrorResponse = {
  error?: string;
};

export function CreateWorkspaceDialog({
  labels,
  onOpenChange,
  open,
}: {
  labels: PaceSidebarLabels;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const trimmedName = name.trim();
  const previewName = trimmedName || labels["workspace.create.untitled"];

  function handleOpenChange(nextOpen: boolean) {
    if (isCreating) return;

    onOpenChange(nextOpen);
    if (!nextOpen) {
      setName("");
      setError("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trimmedName) {
      setError(labels["workspace.create.nameRequired"]);
      return;
    }

    setError("");
    setIsCreating(true);

    try {
      const response = await fetch("/api/workspaces", {
        body: JSON.stringify({ name: trimmedName, type: "CUSTOM" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await response.json().catch(() => ({})) as CreatedWorkspaceResponse | CreateWorkspaceErrorResponse;

      if (!response.ok || !("workspace" in data)) {
        setError("error" in data && typeof data.error === "string" ? data.error : labels["workspace.create.error"]);
        return;
      }

      setName("");
      setError("");
      onOpenChange(false);
      router.push(`/w/${data.workspace.slug}/overview`);
    } catch {
      setError(labels["workspace.create.error"]);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        className="gap-0 overflow-hidden rounded-[14px] p-0 text-[#344054] sm:max-w-[26rem]"
        onEscapeKeyDown={(event) => {
          if (isCreating) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isCreating) event.preventDefault();
        }}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader className="gap-2 px-6 pt-6 pb-5">
            <DialogTitle className="text-[18px] font-semibold tracking-[-0.015em] text-[#101828]">
              {labels["workspace.create.title"]}
            </DialogTitle>
            <DialogDescription className="leading-5 text-[#667085]">
              {labels["workspace.create.description"]}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-6">
            <div className="flex items-center gap-3 rounded-[10px] bg-[#f6f8ff] px-3 py-3">
              <WorkspaceAvatar className="size-12 rounded-[10px]" name={previewName} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#667085]">{labels["workspace.create.preview"]}</p>
                <p aria-live="polite" className="truncate text-sm font-semibold text-[#344054]">
                  {previewName}
                </p>
              </div>
            </div>

            <label className="mt-5 block text-sm font-medium text-[#344054]" htmlFor="workspace-name">
              {labels["workspace.create.nameLabel"]}
            </label>
            <Input
              aria-describedby={error ? "workspace-name-error" : undefined}
              aria-invalid={Boolean(error)}
              autoComplete="organization"
              autoFocus
              className="mt-2 h-10 rounded-[8px] border-[#d0d5dd] bg-white px-3 text-sm text-[#101828] shadow-none placeholder:text-[#667085] focus-visible:border-[#5282ee] focus-visible:ring-[#5282ee]/20 aria-invalid:border-[#d92d20] aria-invalid:ring-[#d92d20]/15"
              id="workspace-name"
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError("");
              }}
              placeholder={labels["workspace.create.namePlaceholder"]}
              value={name}
            />
            {error ? (
              <p aria-live="polite" className="mt-2 text-sm text-[#b42318]" id="workspace-name-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="mx-0 mb-0 gap-2 rounded-none border-[#eaecf0] bg-[#fcfcfd] px-6 py-4 sm:justify-end">
            <DialogClose asChild>
              <Button className="border-[#d0d5dd] bg-white text-[#344054] hover:bg-[#f9fafb]" disabled={isCreating} type="button" variant="outline">
                {labels["workspace.create.cancel"]}
              </Button>
            </DialogClose>
            <Button className="bg-[#2457c5] text-white hover:bg-[#1d4aae]" disabled={isCreating} type="submit">
              {isCreating ? labels["workspace.create.submitting"] : labels["workspace.create.submit"]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
