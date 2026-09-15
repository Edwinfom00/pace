"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  HiOutlineCheck,
  HiOutlineEllipsisHorizontal,
  HiOutlineHome,
  HiOutlineUser,
  HiOutlineUserGroup,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import type { WorkspaceType } from "@/modules/workspaces/domain";

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

const workspaceTypeOptions = [
  { value: "PERSONAL", icon: HiOutlineUser, titleKey: "workspace.create.type.personal.title", descriptionKey: "workspace.create.type.personal.description" },
  { value: "COUPLE", icon: HiOutlineUserGroup, titleKey: "workspace.create.type.couple.title", descriptionKey: "workspace.create.type.couple.description" },
  { value: "FAMILY", icon: HiOutlineHome, titleKey: "workspace.create.type.family.title", descriptionKey: "workspace.create.type.family.description" },
  { value: "CUSTOM", icon: HiOutlineEllipsisHorizontal, titleKey: "workspace.create.type.custom.title", descriptionKey: "workspace.create.type.custom.description" },
] as const satisfies ReadonlyArray<{
  value: WorkspaceType;
  icon: typeof HiOutlineUser;
  titleKey: "workspace.create.type.personal.title" | "workspace.create.type.couple.title" | "workspace.create.type.family.title" | "workspace.create.type.custom.title";
  descriptionKey: "workspace.create.type.personal.description" | "workspace.create.type.couple.description" | "workspace.create.type.family.description" | "workspace.create.type.custom.description";
}>;

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
  const [type, setType] = useState<WorkspaceType>("PERSONAL");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const trimmedName = name.trim();
  const previewName = trimmedName || labels["workspace.create.untitled"];

  function handleOpenChange(nextOpen: boolean) {
    if (isCreating) return;

    onOpenChange(nextOpen);
    if (!nextOpen) {
      setName("");
      setType("PERSONAL");
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
        body: JSON.stringify({ name: trimmedName, type }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await response.json().catch(() => ({})) as CreatedWorkspaceResponse | CreateWorkspaceErrorResponse;

      if (!response.ok || !("workspace" in data)) {
        setError("error" in data && typeof data.error === "string" ? data.error : labels["workspace.create.error"]);
        return;
      }

      setName("");
      setType("PERSONAL");
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
    <ResponsiveDialog onOpenChange={handleOpenChange} open={open}>
      <ResponsiveDialogContent
        className="gap-0 overflow-hidden rounded-[14px] p-0 text-[#344054] sm:max-w-[32rem]"
        drawerClassName="max-h-[calc(100svh-1rem)] rounded-t-[16px]"
      >
        <form className="flex max-h-[calc(100svh-1rem)] flex-col lg:block lg:max-h-none" onSubmit={handleSubmit}>
          <ResponsiveDialogHeader className="px-5 pt-6 pb-5 lg:px-6">
            <ResponsiveDialogTitle className="text-[18px] font-semibold tracking-[-0.015em] text-[#101828]">
              {labels["workspace.create.title"]}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="leading-5 text-[#667085]">
              {labels["workspace.create.description"]}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="min-h-0 overflow-y-auto px-5 pb-5 lg:overflow-visible lg:px-6 lg:pb-6">
            <fieldset>
              <legend className="text-sm font-medium text-[#344054]">{labels["workspace.create.typeLabel"]}</legend>
              <div aria-label={labels["workspace.create.typeLabel"]} className="mt-2.5 grid grid-cols-2 gap-2" role="radiogroup">
                {workspaceTypeOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = type === option.value;

                  return (
                    <button
                      aria-checked={isSelected}
                      className="relative flex min-h-[82px] cursor-pointer items-start gap-2.5 rounded-[9px] border border-[#e4e7ec] bg-white px-3 py-3 text-left outline-none transition-colors hover:border-[#cbd5e6] hover:bg-[#fafbff] focus-visible:border-[#5282ee] focus-visible:ring-3 focus-visible:ring-[#5282ee]/15 aria-checked:border-[#5282ee] aria-checked:bg-[#f5f8ff]"
                      key={option.value}
                      onClick={() => setType(option.value)}
                      role="radio"
                      type="button"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[#eef3ff] text-[#2457c5]">
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0 pr-3">
                        <span className="block text-sm font-semibold leading-5 text-[#344054]">{labels[option.titleKey]}</span>
                        <span className="mt-0.5 block text-xs leading-4 text-[#667085]">{labels[option.descriptionKey]}</span>
                      </span>
                      {isSelected ? (
                        <span className="absolute top-2.5 right-2.5 flex size-4 items-center justify-center rounded-full bg-[#2457c5] text-white">
                          <HiOutlineCheck aria-hidden="true" className="size-3" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-5 flex items-center gap-3 rounded-[10px] bg-[#f6f8ff] px-3 py-3">
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

          <ResponsiveDialogFooter className="mx-0 mb-0 rounded-none border-[#eaecf0] bg-[#fcfcfd] px-5 py-4 lg:px-6">
            <ResponsiveDialogClose>
              <Button className="border-[#d0d5dd] bg-white text-[#344054] hover:bg-[#f9fafb]" disabled={isCreating} type="button" variant="outline">
                {labels["workspace.create.cancel"]}
              </Button>
            </ResponsiveDialogClose>
            <Button className="bg-[#2457c5] text-white hover:bg-[#1d4aae]" disabled={isCreating} type="submit">
              {isCreating ? labels["workspace.create.submitting"] : labels["workspace.create.submit"]}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
