import type { CSSProperties } from "react";
import type { Column } from "@tanstack/react-table";
import type { ProcessView } from "@/lib/types";
import { VIEW_KEY, type ViewMode } from "./types";

export function loadViewMode(): ViewMode {
  if (typeof localStorage === "undefined") return "table";
  return localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "table";
}

// Format a duration (ms) as a compact uptime string. Shows hours only when
// present, always zero-padded minutes/seconds: "1h 02m 03s" / "02m 03s" / "03s".
// Mirrors the server-uptime formatting in App.tsx so both displays agree.
export function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}h ${mm}m ${ss}s` : `${mm}m ${ss}s`;
}

// Sticky-column styling backed by TanStack's column-pinning API. The table
// pins `name` left and `actions` right (see `columnPinning` in the table's
// initialState), so both stay visible during horizontal scroll. Geometry
// (position / left / right / z-index) is computed via the pinning API, so
// multiple columns per side would stack with correct offsets; the opaque
// background, edge border, and hover/selected tints stay as Tailwind classes
// so a pinned cell tracks its row's highlight (otherwise it would stay flat
// while the row lights up on hover). Returns empty attrs for non-pinned cols.
export function pinnedColAttrs(
  column: Column<ProcessView>,
  head: boolean,
): { className?: string; style?: CSSProperties } {
  const side = column.getIsPinned();
  if (!side) return {};
  const edge =
    side === "left" ? "border-r border-border" : "border-l border-border";
  const hover = head
    ? ""
    : "group-hover:bg-[color-mix(in_srgb,var(--background),var(--color-black)_2%)] " +
      "group-data-[state=selected]:bg-[color-mix(in_srgb,var(--background),var(--color-black)_4%)] " +
      "dark:group-hover:bg-[color-mix(in_srgb,var(--background),var(--color-white)_2%)] " +
      "dark:group-data-[state=selected]:bg-[color-mix(in_srgb,var(--background),var(--color-white)_4%)]";
  return {
    style: {
      position: "sticky",
      left: side === "left" ? `${column.getStart("left")}px` : undefined,
      right: side === "right" ? `${column.getAfter("right")}px` : undefined,
      zIndex: head ? 2 : 1,
    },
    className: `bg-background ${edge} ${hover}`.trim() || undefined,
  };
}

// Whether a process can currently be stopped (running/spawning). Anything else
// (stopped/exited/error) renders a Run/Restart affordance instead. Centralizes
// the check that the row buttons, the context menu, requestStop/requestDelete,
// and the delete dialog all need so they can't drift apart.
export function canStopProcess(p: ProcessView): boolean {
  return p.stoppedAt == null && p.status !== "exited" && p.status !== "error";
}
