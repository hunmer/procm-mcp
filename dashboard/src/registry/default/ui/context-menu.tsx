"use client";

import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { mergeProps } from "@base-ui/react/merge-props";
import type React from "react";
import { cn } from "@/registry/default/lib/utils";

// Wrappers around Base UI's ContextMenu namespace, styled to match the rest of
// the dashboard. The popup auto-wraps itself in a Portal + Positioner (Base UI
// requires Popup inside a Positioner), so call sites just write
// ContextMenu > ContextMenuTrigger + ContextMenuPopup > ContextMenuItem.

export const ContextMenu = ContextMenuPrimitive.Root;

export function ContextMenuTrigger({
  className,
  ...props
}: ContextMenuPrimitive.Trigger.Props): React.ReactElement {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      className={cn("", className)}
      {...props}
    />
  );
}

// Auto-wrap the popup in Portal + Positioner so callers don't have to. The
// positioner anchors to where the user right-clicked.
export function ContextMenuPopup({
  className,
  ...props
}: ContextMenuPrimitive.Popup.Props): React.ReactElement {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner data-slot="context-menu-positioner">
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-popup"
          className={cn(
            "bg-popover text-popover-foreground data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 relative z-50 min-w-[160px] origin-(--transform-origin) overflow-hidden rounded-lg border p-1 shadow-md transition-[transform,scale,opacity] duration-100",
            className,
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  variant,
  ...props
}: ContextMenuPrimitive.Item.Props & {
  variant?: "default" | "destructive";
}): React.ReactElement {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        variant === "destructive" &&
          "text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive",
        className,
      )}
      {...mergeProps(props, {})}
    />
  );
}

export function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>): React.ReactElement {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

export function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        "text-muted-foreground ml-auto inline-flex items-center text-xs tracking-widest",
        className,
      )}
      {...props}
    />
  );
}
