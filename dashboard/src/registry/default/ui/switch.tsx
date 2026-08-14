"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import type React from "react";
import { cn } from "@/registry/default/lib/utils";

// A binary on/off toggle. Built on Base UI's Switch (role="switch"), so it
// exposes `checked` / `defaultChecked` / `onCheckedChange` and is keyboard
// accessible. The track is the Root; the knob is the Thumb, which slides via
// the data-checked state attribute.
export function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props): React.ReactElement {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent bg-input shadow-xs/5 outline-none transition-colors ring-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background data-disabled:cursor-not-allowed data-disabled:opacity-64 data-checked:bg-primary",
        className,
      )}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb
        className="pointer-events-none size-3.5 rounded-full bg-background shadow-sm ring-0 transition-transform data-checked:translate-x-4"
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
}

export { SwitchPrimitive };
