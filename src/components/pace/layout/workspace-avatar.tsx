import type { ComponentProps } from "react";

import { createAvatar } from "@dicebear/core";
import { create } from "@dicebear/initials";
import { cn } from "cn";

export function workspaceInitial(name: string) {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() || "W";
}

function workspaceAvatarSource(name: string) {
  return createAvatar(
    { create },
    {
      backgroundColor: ["e8efff"],
      chars: 1,
      fontWeight: 700,
      radius: 24,
      seed: workspaceInitial(name),
      textColor: ["2457c5"],
    },
  ).toDataUri();
}

type WorkspaceAvatarProps = Omit<ComponentProps<"img">, "alt" | "src"> & {
  name: string;
};

export function WorkspaceAvatar({ className, name, ...props }: WorkspaceAvatarProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("shrink-0 object-cover", className)}
      src={workspaceAvatarSource(name)}
      {...props}
    />
  );
}
