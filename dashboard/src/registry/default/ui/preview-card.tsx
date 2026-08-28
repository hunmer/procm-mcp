"use client";

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import type React from "react";
import { cn } from "@/registry/default/lib/utils";

// Wrappers around Base UI's PreviewCard namespace (hover/focus-triggered rich
// preview), styled to match the rest of the dashboard. The popup auto-wraps
// itself in a Portal + Positioner (Base UI requires Popup inside a Positioner),
// so call sites just write PreviewCard > PreviewCardTrigger + PreviewCardPopup.

export const PreviewCard = PreviewCardPrimitive.Root;

export function PreviewCardTrigger({
  className,
  ...props
}: PreviewCardPrimitive.Trigger.Props): React.ReactElement {
  return (
    <PreviewCardPrimitive.Trigger
      data-slot="preview-card-trigger"
      className={cn("", className)}
      {...props}
    />
  );
}

// Auto-wrap the popup in Portal + Positioner so callers don't have to. The
// positioner anchors to the trigger element. `side`/`align`/`sideOffset` may be
// passed through to tune placement.
export function PreviewCardPopup({
  className,
  ...props
}: PreviewCardPrimitive.Popup.Props): React.ReactElement {
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner data-slot="preview-card-positioner">
        <PreviewCardPrimitive.Popup
          data-slot="preview-card-popup"
          className={cn(
            "bg-popover text-popover-foreground data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.96] relative z-50 max-w-sm origin-(--transform-origin) rounded-lg border p-3 shadow-md transition-[transform,scale,opacity] duration-100",
            className,
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}
