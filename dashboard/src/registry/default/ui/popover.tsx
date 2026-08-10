"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type React from "react";
import { cn } from "@/registry/default/lib/utils";

// Wrappers around Base UI's Popover namespace (click-triggered floating panel
// that stays open while the user interacts with its contents — unlike Menu, it
// does not auto-close on item click). The popup auto-wraps itself in a Portal +
// Positioner (Base UI requires Popup inside a Positioner), so call sites just
// write Popover > PopoverTrigger + PopoverPopup > …content.

export const Popover = PopoverPrimitive.Root;

export function PopoverTrigger({
  className,
  ...props
}: PopoverPrimitive.Trigger.Props): React.ReactElement {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      className={cn("", className)}
      {...props}
    />
  );
}

// Auto-wrap the popup in Portal + Positioner so callers don't have to. The
// positioner anchors to the trigger element.
export function PopoverPopup({
  className,
  ...props
}: PopoverPrimitive.Popup.Props): React.ReactElement {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner data-slot="popover-positioner">
        <PopoverPrimitive.Popup
          data-slot="popover-popup"
          className={cn(
            "bg-popover text-popover-foreground data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 relative z-50 min-w-[200px] origin-(--transform-origin) rounded-lg border p-2 shadow-md transition-[transform,scale,opacity] duration-100",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export const PopoverClose = PopoverPrimitive.Close;
