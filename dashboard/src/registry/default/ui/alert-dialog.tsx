"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { useRender } from "@base-ui/react/use-render";
import { mergeProps } from "@base-ui/react/merge-props";
import type React from "react";
import { cn } from "@/registry/default/lib/utils";
import {
  DialogBackdrop,
  DialogViewport,
  DialogPortal,
} from "@/registry/default/ui/dialog";

// AlertDialog shares the dialog's visual shell but uses the alert-dialog
// primitive (role="alertdialog") for accessibility. The Popup/Header/Footer/
// Title/Description wrappers are intentionally re-exported here under the
// AlertDialog* names so call sites match the p-alert-dialog-* particles.

export const AlertDialog = AlertDialogPrimitive.Root;

export function AlertDialogTrigger({
  className,
  ...props
}: AlertDialogPrimitive.Trigger.Props): React.ReactElement {
  return (
    <AlertDialogPrimitive.Trigger
      data-slot="alert-dialog-trigger"
      className={cn("", className)}
      {...props}
    />
  );
}

export const AlertDialogClose = AlertDialogPrimitive.Close;

export function AlertDialogPopup({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Popup>): React.ReactElement {
  return (
    <DialogPortal>
      <DialogBackdrop />
      <DialogViewport>
        <AlertDialogPrimitive.Popup
          data-slot="alert-dialog-popup"
          className={cn(
            "relative row-start-2 flex max-h-full min-h-0 w-full min-w-0 max-w-lg origin-center flex-col rounded-2xl border bg-popover not-dark:bg-clip-padding text-popover-foreground opacity-[calc(1-var(--nested-dialogs))] shadow-lg/5 outline-none transition-[scale,opacity,translate] duration-200 ease-in-out will-change-transform data-ending-style:opacity-0 data-starting-style:opacity-0 sm:scale-[calc(1-0.1*var(--nested-dialogs))] sm:data-ending-style:scale-98 sm:data-starting-style:scale-98",
            className,
          )}
          {...props}
        >
          {children}
        </AlertDialogPrimitive.Popup>
      </DialogViewport>
    </DialogPortal>
  );
}

export function AlertDialogHeader({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn("flex flex-col gap-2 p-6", className),
    "data-slot": "alert-dialog-header",
  };
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function AlertDialogFooter({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  variant?: "default" | "bare";
}): React.ReactElement {
  const defaultProps = {
    className: cn(
      "flex flex-col-reverse gap-2 px-6 sm:flex-row sm:justify-end",
      variant === "default" && "border-t bg-muted/72 py-4",
      variant === "bare" && "pt-3 pb-6",
      className,
    ),
    "data-slot": "alert-dialog-footer",
  };
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>): React.ReactElement {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>): React.ReactElement {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}
