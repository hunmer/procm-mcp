"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import type React from "react";
import { cn } from "@/registry/default/lib/utils";

// A thin wrapper around Base UI's Select primitive, styled to match the rest
// of the dashboard's coss-style components. Exports mirror the parts used by
// the p-select-* particles.

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectGroupLabel = SelectPrimitive.GroupLabel;

export function SelectTrigger({
  className,
  size = "default",
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "default" | "sm";
}): React.ReactElement {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "border-input bg-input/30 hover:bg-input/50 flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm whitespace-nowrap outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[popup-open]:border-ring data-[popup-open]:ring-ring/50 data-[popup-open]:ring-[3px] [&>span]:min-w-0",
        size === "sm" && "h-8 px-2.5 py-0 text-xs",
        className,
      )}
      {...props}
    />
  );
}

export function SelectValue({
  className,
  ...props
}: SelectPrimitive.Value.Props): React.ReactElement {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("truncate", className)}
      {...props}
    />
  );
}

export function SelectIcon({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <SelectPrimitive.Icon
      data-slot="select-icon"
      className={cn("text-muted-foreground size-4 shrink-0", className)}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.Icon>
  );
}

export const SelectPortal = SelectPrimitive.Portal;

export const SelectPositioner = SelectPrimitive.Positioner;

export function SelectBackdrop({
  className,
  ...props
}: SelectPrimitive.Backdrop.Props): React.ReactElement {
  return (
    <SelectPrimitive.Backdrop
      data-slot="select-backdrop"
      className={cn("fixed inset-0 z-50 bg-black/32", className)}
      {...props}
    />
  );
}

// Base UI requires Select.Popup to live inside a Select.Positioner. To keep
// call sites simple, SelectPopup wraps the popup in a Positioner automatically
// (and through a Portal so it escapes any overflow-hidden ancestors).
export function SelectPopup({
  className,
  ...props
}: SelectPrimitive.Popup.Props): React.ReactElement {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align="start"
        sideOffset={4}
        data-slot="select-positioner"
      >
        <SelectPrimitive.Popup
          data-slot="select-popup"
          className={cn(
            "bg-popover text-popover-foreground data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 relative z-50 max-h-(--available-height) min-w-[var(--trigger-width)] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border p-1 shadow-md transition-[transform,scale,opacity] duration-100",
            className,
          )}
          {...props}
        />
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  ...props
}: SelectPrimitive.Item.Props): React.ReactElement {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function SelectItemText({
  className,
  ...props
}: SelectPrimitive.ItemText.Props): React.ReactElement {
  return (
    <SelectPrimitive.ItemText
      data-slot="select-item-text"
      className={cn("truncate", className)}
      {...props}
    />
  );
}

export function SelectItemIndicator({
  className,
  ...props
}: SelectPrimitive.ItemIndicator.Props): React.ReactElement {
  return (
    <SelectPrimitive.ItemIndicator
      data-slot="select-item-indicator"
      className={cn("text-foreground absolute right-2 flex size-4 items-center justify-center", className)}
      {...props}
    >
      <CheckIcon className="size-4" />
    </SelectPrimitive.ItemIndicator>
  );
}
