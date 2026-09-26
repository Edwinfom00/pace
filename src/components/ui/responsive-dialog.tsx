"use client";

import * as React from "react";
import { cn } from "cn";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";

const DRAWER_BREAKPOINT = 1024;

const ResponsiveDialogContext = React.createContext(false);

function useDrawerAtThisViewport() {
  const [isDrawer, setIsDrawer] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${DRAWER_BREAKPOINT - 1}px)`);
    const updateViewport = () => setIsDrawer(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  return isDrawer;
}

function useResponsiveDialog() {
  return React.useContext(ResponsiveDialogContext);
}

type ResponsiveDialogProps = {
  children: React.ReactNode;
  defaultOpen?: boolean;
  mobilePresentation?: "drawer" | "dialog";
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
};

function ResponsiveDialog({
  children,
  defaultOpen,
  mobilePresentation = "drawer",
  onOpenChange,
  open,
}: ResponsiveDialogProps) {
  const isDrawerViewport = useDrawerAtThisViewport();
  const isDrawer = isDrawerViewport && mobilePresentation === "drawer";

  return (
    <ResponsiveDialogContext.Provider value={isDrawer}>
      {isDrawer ? (
        <Drawer defaultOpen={defaultOpen} onOpenChange={onOpenChange} open={open}>
          {children}
        </Drawer>
      ) : (
        <Dialog defaultOpen={defaultOpen} onOpenChange={onOpenChange} open={open}>
          {children}
        </Dialog>
      )}
    </ResponsiveDialogContext.Provider>
  );
}

function ResponsiveDialogContent({
  children,
  className,
  drawerClassName,
  showCloseButton = true,
}: {
  children: React.ReactNode;
  className?: string;
  drawerClassName?: string;
  showCloseButton?: boolean;
}) {
  const isDrawer = useResponsiveDialog();

  if (isDrawer) {
    return <DrawerContent className={cn(className, drawerClassName)}>{children}</DrawerContent>;
  }

  return <DialogContent className={className} showCloseButton={showCloseButton}>{children}</DialogContent>;
}

function ResponsiveDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex shrink-0 flex-col gap-2", className)} data-slot="responsive-dialog-header" {...props} />;
}

function ResponsiveDialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  const isDrawer = useResponsiveDialog();
  const titleClassName = cn("font-heading text-base leading-none font-medium", className);

  return isDrawer
    ? <DrawerTitle className={titleClassName} {...props} />
    : <DialogTitle className={titleClassName} {...props} />;
}

function ResponsiveDialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  const isDrawer = useResponsiveDialog();
  const descriptionClassName = cn("text-sm text-muted-foreground", className);

  return isDrawer
    ? <DrawerDescription className={descriptionClassName} {...props} />
    : <DialogDescription className={descriptionClassName} {...props} />;
}

function ResponsiveDialogClose({ children }: { children: React.ReactNode }) {
  const isDrawer = useResponsiveDialog();

  return isDrawer
    ? <DrawerClose asChild>{children}</DrawerClose>
    : <DialogClose asChild>{children}</DialogClose>;
}

function ResponsiveDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  const isDrawer = useResponsiveDialog();

  return (
    <div
      className={cn(
        "flex shrink-0 gap-2 border-t",
        isDrawer ? "flex-col-reverse" : "flex-row justify-end",
        className,
      )}
      data-slot="responsive-dialog-footer"
      {...props}
    />
  );
}

export {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
};
