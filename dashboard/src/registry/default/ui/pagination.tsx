"use client";

import type React from "react";
import { cn } from "@/registry/default/lib/utils";

// Minimal pagination building blocks. The process list only needs previous/
// next navigation, so this is intentionally lightweight (no numbered pages),
// matching the p-table-4 particle's footer pattern.

export function Pagination({
  className,
  ...props
}: React.ComponentProps<"nav">): React.ReactElement {
  return (
    <nav
      data-slot="pagination"
      role="navigation"
      aria-label="Pagination"
      className={cn("text-muted-foreground flex items-center gap-1.5 text-sm", className)}
      {...props}
    />
  );
}

export function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">): React.ReactElement {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex items-center gap-1.5", className)}
      {...props}
    />
  );
}

export function PaginationItem({
  className,
  ...props
}: React.ComponentProps<"li">): React.ReactElement {
  return (
    <li data-slot="pagination-item" className={cn("", className)} {...props} />
  );
}

export function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<"button">): React.ReactElement {
  return (
    <button
      type="button"
      data-slot="pagination-previous"
      aria-label="Previous page"
      className={cn("", className)}
      {...props}
    />
  );
}

export function PaginationNext({
  className,
  ...props
}: React.ComponentProps<"button">): React.ReactElement {
  return (
    <button
      type="button"
      data-slot="pagination-next"
      aria-label="Next page"
      className={cn("", className)}
      {...props}
    />
  );
}
