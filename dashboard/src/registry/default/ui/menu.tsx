"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { mergeProps } from "@base-ui/react/merge-props";
import type React from "react";
import { cn } from "@/registry/default/lib/utils";

// Wrappers around Base UI's Menu namespace (click-triggered dropdown menu),
// styled to match the rest of the dashboard. The popup auto-wraps itself in a
// Portal + Positioner (Base UI requires Popup inside a Positioner), so call
// sites just write Menu > MenuTrigger + MenuPopup > MenuItem.

export const Menu = MenuPrimitive.Root;

export function MenuTrigger({
  className,
  ...props
}: MenuPrimitive.Trigger.Props): React.ReactElement {
  return (
    <MenuPrimitive.Trigger
      data-slot="menu-trigger"
      className={cn("", className)}
      {...props}
    />
  );
}

// Auto-wrap the popup in Portal + Positioner so callers don't have to. The
// positioner anchors to the trigger element.
export function MenuPopup({
  className,
  ...props
}: MenuPrimitive.Popup.Props): React.ReactElement {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner data-slot="menu-positioner">
        <MenuPrimitive.Popup
          data-slot="menu-popup"
          className={cn(
            "bg-popover text-popover-foreground data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 relative z-50 min-w-[160px] origin-(--transform-origin) overflow-hidden rounded-lg border p-1 shadow-md transition-[transform,scale,opacity] duration-100",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function MenuItem({
  className,
  variant,
  ...props
}: MenuPrimitive.Item.Props & {
  variant?: "default" | "destructive";
}): React.ReactElement {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
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

export function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>): React.ReactElement {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}
