import type { ComponentProps } from "react";
import type { Badge } from "@/registry/default/ui/badge";
import type { LevelFilter } from "./types";

export const HISTORY_COUNT = 100;
export const GREP_COUNT = 500;

// Whether structured JSON payloads are rendered as an interactive tree.
// Persisted to localStorage (best-effort) matching the useTheme.ts pattern.
const SHOW_JSON_KEY = "procm-log-show-json";

export function loadShowJson(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const v = localStorage.getItem(SHOW_JSON_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function persistShowJson(v: boolean): void {
  try {
    localStorage.setItem(SHOW_JSON_KEY, v ? "1" : "0");
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
}

// Structured-level filters shown as checkable badges. Checking several
// levels shows their entries combined; none checked shows every line,
// including legacy plain output without a level. variant is applied while
// checked, outline otherwise.
export const LEVEL_FILTERS: {
  label: string;
  level: LevelFilter;
  variant: ComponentProps<typeof Badge>["variant"];
}[] = [
  { label: "debug", level: "debug", variant: "secondary" },
  { label: "info", level: "info", variant: "info" },
  { label: "warn", level: "warn", variant: "warning" },
  { label: "error", level: "error", variant: "error" },
];
