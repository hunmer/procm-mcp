import type { ComponentProps } from "react";
import type { Badge } from "@/registry/default/ui/badge";
import type { FontSize, LevelFilter } from "./types";

export const HISTORY_COUNT = 100;
export const GREP_COUNT = 500;

// Per-log view settings (toggles + font size), persisted to localStorage
// (best-effort) as one JSON object so the choices survive reloads, matching
// the useTheme.ts pattern.
const VIEW_SETTINGS_KEY = "procm-log-view-settings";
// Legacy key that only held the JSON-tree toggle; read once for migration.
const SHOW_JSON_KEY = "procm-log-show-json";

export interface LogViewSettings {
  showTime: boolean;
  showLineNumbers: boolean;
  autoScroll: boolean;
  showJson: boolean;
  colorizeBackground: boolean;
  fontSize: FontSize;
}

const FONT_SIZES: readonly FontSize[] = ["xs", "sm", "md"];

const DEFAULT_VIEW_SETTINGS: LogViewSettings = {
  showTime: true,
  showLineNumbers: false,
  autoScroll: true,
  showJson: true,
  colorizeBackground: true,
  fontSize: "xs",
};

export function loadViewSettings(): LogViewSettings {
  if (typeof localStorage === "undefined") return DEFAULT_VIEW_SETTINGS;
  try {
    const raw = localStorage.getItem(VIEW_SETTINGS_KEY);
    if (raw === null) {
      const legacy = localStorage.getItem(SHOW_JSON_KEY);
      return legacy === null
        ? DEFAULT_VIEW_SETTINGS
        : { ...DEFAULT_VIEW_SETTINGS, showJson: legacy === "1" };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_VIEW_SETTINGS;
    }
    const saved = parsed as Partial<LogViewSettings>;
    return {
      ...DEFAULT_VIEW_SETTINGS,
      ...saved,
      fontSize: FONT_SIZES.includes(saved.fontSize as FontSize)
        ? (saved.fontSize as FontSize)
        : DEFAULT_VIEW_SETTINGS.fontSize,
    };
  } catch {
    return DEFAULT_VIEW_SETTINGS;
  }
}

export function persistViewSettings(v: LogViewSettings): void {
  try {
    localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(v));
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
}

// Structured-level filters shown as toggleable badges (coss p-badge-17
// status-dot pattern). Checking several levels shows their entries combined;
// none checked shows every line, including legacy plain output without a
// level. variant is applied while checked, outline otherwise; dotClass is the
// level's status dot color, matching the line-level tints in TerminalLog.
export const LEVEL_FILTERS: {
  label: string;
  level: LevelFilter;
  variant: ComponentProps<typeof Badge>["variant"];
  dotClass: string;
}[] = [
  { label: "debug", level: "debug", variant: "secondary", dotClass: "bg-zinc-500" },
  { label: "info", level: "info", variant: "info", dotClass: "bg-sky-500" },
  { label: "warn", level: "warn", variant: "warning", dotClass: "bg-amber-500" },
  { label: "error", level: "error", variant: "error", dotClass: "bg-red-500" },
];
