"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/registry/default/lib/utils";

// Inline status messaging with semantic color variants. Pure markup (no Base UI
// dependency) — mirrors the coss `Alert` particle pattern. Variant colors
// reuse the same theme tokens as the Badge (info/success/warning/error).

export const alertVariants = cva(
  "relative flex w-full gap-2 rounded-lg border p-3 text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: { variant: "default" },
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        info: "bg-info/8 text-info-foreground border-info/20 dark:bg-info/16",
        success:
          "bg-success/8 text-success-foreground border-success/20 dark:bg-success/16",
        warning:
          "bg-warning/8 text-warning-foreground border-warning/20 dark:bg-warning/16",
        error:
          "bg-destructive/8 text-destructive-foreground border-destructive/20 dark:bg-destructive/16",
      },
    },
  },
);

export type AlertVariant = VariantProps<typeof alertVariants>["variant"];

export function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: AlertVariant;
}): React.ReactElement {
  return (
    <div
      role="alert"
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: React.ComponentProps<"p">): React.ReactElement {
  return (
    <p
      data-slot="alert-title"
      className={cn("font-semibold leading-none", className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}
