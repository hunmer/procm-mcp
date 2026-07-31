"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import type React from "react";
import { cn } from "@/registry/default/lib/utils";

// A thin wrapper around Base UI's Tabs primitive, styled to match the rest of
// the dashboard's coss-style components. Exports mirror the parts used by the
// p-tabs-* particles.

export const Tabs = TabsPrimitive.Root;

const tabsListVariants = cva("flex items-center gap-1", {
  variants: {
    variant: {
      // Default: a pill-style container holding segmented tab triggers.
      default: "bg-muted/72 rounded-lg p-0.5",
      // Underline: no container background; the active indicator is a bottom
      // border line. Place <TabsList> inside a `border-b` wrapper.
      underline: "h-auto w-full justify-start gap-0 rounded-none p-0",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & {
  variant?: VariantProps<typeof tabsListVariants>["variant"];
}): React.ReactElement {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

const tabsTabVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "text-muted-foreground hover:text-foreground data-[active]:bg-background data-[active]:text-foreground px-3 py-1.5",
        underline:
          "text-muted-foreground border-b-2 border-transparent px-4 py-2 rounded-none hover:text-foreground data-[active]:text-foreground data-[active]:border-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function TabsTab({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.Tab.Props & {
  variant?: VariantProps<typeof tabsTabVariants>["variant"];
}): React.ReactElement {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(tabsTabVariants({ variant }), className)}
      {...props}
    />
  );
}

export function TabsPanel({
  className,
  ...props
}: TabsPrimitive.Panel.Props): React.ReactElement {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

// Sliding highlight that tracks the active tab. Sits behind the triggers
// (the segmented list is `relative` + `-z-10` here). Base UI exposes the
// active tab's geometry via the --active-tab-* CSS variables and removes the
// element via [hidden] until measured, so it's safe to always render it.
export function TabsIndicator({
  className,
  ...props
}: TabsPrimitive.Indicator.Props): React.ReactElement {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      render={<span />}
      className={cn(
        "absolute inset-y-0.5 -z-10 left-[var(--active-tab-left)] w-[var(--active-tab-width)] rounded-md bg-background shadow-sm transition-[left,width] duration-200 ease-in-out data-[orientation=vertical]:inset-x-0 data-[orientation=vertical]:top-[var(--active-tab-top)] data-[orientation=vertical]:bottom-[var(--active-tab-bottom)] data-[orientation=vertical]:h-auto data-[orientation=vertical]:w-full",
        className,
      )}
      {...props}
    />
  );
}

export { TabsPrimitive };
