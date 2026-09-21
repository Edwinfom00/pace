"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  HiOutlineCheck,
  HiOutlineEllipsisHorizontal,
  HiOutlineHome,
  HiOutlinePlus,
  HiOutlineUser,
  HiOutlineUserGroup,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import type { WorkspaceType } from "@/modules/workspaces/domain";
import { workspaceTypeMessageKeys } from "@/i18n/dashboard-messages";

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
        className="gap-0 overflow-hidden rounded-[16px] p-0 text-[#344054] sm:max-w-120"
        drawerClassName="max-h-[calc(100svh-1rem)] rounded-t-[16px]"
      >
        <form className="flex max-h-[calc(100svh-1rem)] flex-col lg:block lg:max-h-none" onSubmit={handleSubmit}>
          <ResponsiveDialogHeader className="bg-white px-5 pt-6 pb-4 lg:px-6">
            <div className="flex items-center gap-3">
              <WorkspaceAvatar className="size-10 rounded-full" name={previewName} />
              <div className="min-w-0">
                <ResponsiveDialogTitle className="text-[18px] font-medium tracking-[-0.02em] text-[#191d27]">
                  {labels["workspace.create.title"]}
                </ResponsiveDialogTitle>
                <p aria-live="polite" className="mt-0.5 truncate text-xs text-[#9aa0ac]">
                  {previewName} <span aria-hidden="true" className="px-1 text-[#c2c6ce]">·</span> {labels[workspaceTypeMessageKeys[type]]}
                </p>
              </div>
            </div>
            <ResponsiveDialogDescription className="mt-3 leading-5 text-[#737987]">
              {labels["workspace.create.description"]}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="min-h-0 overflow-y-auto px-5 pt-1 pb-5 lg:overflow-visible lg:px-6 lg:pb-6">
            <label className="block text-sm font-medium text-[#333944]" htmlFor="workspace-name">
              {labels["workspace.create.nameLabel"]}
            </label>
            <Input
              aria-describedby={error ? "workspace-name-error" : undefined}
              aria-invalid={Boolean(error)}
              autoComplete="organization"
              autoFocus
              className="mt-2 h-10 rounded-[8px] border-[#dfe1e6] bg-white px-3 text-sm text-[#191d27] shadow-none placeholder:text-[#9aa0ac] focus-visible:border-[#5282ee] focus-visible:ring-[#5282ee]/20 aria-invalid:border-[#d92d20] aria-invalid:ring-[#d92d20]/15"
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

            <fieldset>
              <legend className="mt-5 text-sm font-medium text-[#333944]">{labels["workspace.create.typeLabel"]}</legend>
              <div className="mt-2 grid gap-1">
                {workspaceTypeOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = type === option.value;

                  return (
                    <label
                      className={`relative flex min-h-13.5 cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-2 text-left outline-none transition-colors duration-200 hover:bg-[#f7f7f8] focus-within:bg-[#f7f7f8] focus-within:ring-2 focus-within:ring-[#5282ee]/20 ${isSelected ? "bg-[#f7f7f8]" : "bg-white"}`}
                      key={option.value}
                    >
                      <input
                        checked={isSelected}
                        className="sr-only"
                        name="workspace-type"
                        onChange={() => setType(option.value)}
                        type="radio"
                        value={option.value}
                      />
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${isSelected ? "bg-[#2457c5] text-white" : "bg-[#eef3ff] text-[#2457c5]"}`}>
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-5 text-[#20242d]">{labels[option.titleKey]}</span>
                        <span className="block text-xs leading-4 text-[#969ca7]">{labels[option.descriptionKey]}</span>
                      </span>
                      {isSelected ? (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#2457c5] text-white">
                          <HiOutlineCheck aria-hidden="true" className="size-3" />
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <ResponsiveDialogFooter className="mx-0 mb-0 !flex-col rounded-none border-[#e1e2e6] bg-[#f7f7f8] px-5 py-3 lg:px-6">
            <Button className="h-10 w-full rounded-[8px] border-[#e1e3e8] bg-white px-3 text-[#171b24] shadow-[0_2px_3px_rgb(31_38_55/0.08)] hover:bg-white" disabled={isCreating} type="submit" variant="outline">
              <span className="flex-1 text-center">{isCreating ? labels["workspace.create.submitting"] : labels["workspace.create.submit"]}</span>
              {!isCreating ? <HiOutlinePlus aria-hidden="true" className="size-4 text-[#3d4657]" /> : null}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
