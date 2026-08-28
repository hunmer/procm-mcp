"use client";

import type React from "react";
import { cn } from "@/registry/default/lib/utils";

// A simple empty-state composition (no Base UI primitive needed — it's purely
// presentational). Mirrors the @coss/empty API used by the p-empty-* particles:
// Empty > EmptyHeader > (EmptyMedia + EmptyTitle + EmptyDescription), with an
// optional EmptyContent for actions.

export function Empty({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-h-[160px] flex-col items-center justify-center gap-3 p-6 text-center",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyHeader({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex flex-col items-center gap-2", className)}
      {...props}
    />
  );
}

export function EmptyMedia({
  className,
  variant = "icon",
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "icon" | "image";
}): React.ReactElement {
  return (
    <div
      data-slot="empty-media"
      data-variant={variant}
      className={cn(
        "flex size-10 items-center justify-center rounded-full",
        variant === "icon" && "bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyTitle({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="empty-title"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  );
}

export function EmptyDescription({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="empty-description"
      className={cn("text-muted-foreground text-xs", className)}
      {...props}
    />
  );
}

export function EmptyContent({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="empty-content"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
}
