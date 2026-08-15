import type { SystemProcess } from "@/lib/types";

// A display row for the System table: one process, or several merged because
// they share the same name AND parent (e.g. a browser's helper swarm). Shared
// fields come from the first member; the full `members` list powers the ×N
// badge and the info panel's per-member list — within a group only pid and
// command line differ, so those are the two per-member fields shown.
export interface ProcessRow {
  // `${name}|${ppid}` — unique per row (the trailing numeric ppid keeps it
  // injective even if a name contains "|") and stable across refreshes, so
  // selection/pending-kill survive regrouping.
  key: string;
  members: SystemProcess[];
  name: string;
  // Representative member (lowest pid) — drives sorting and row identity.
  pid: number;
  ppid: number;
  cmd: string | null;
  exe: string | null;
  // Deduped union of the members' listening ports.
  ports?: number[];
}

// Bundled per-row action callbacks. Passed as a single object to the table
// view and the shared context menu so call sites stay terse.
export interface RowActions {
  onSelect: (row: ProcessRow) => void;
  onView: (row: ProcessRow) => void;
  onReveal: (row: ProcessRow) => void;
  onKill: (row: ProcessRow) => void;
}

// localStorage keys for the persisted preferences (mirrors the useTheme /
// view-mode best-effort pattern; storage may be unavailable in private mode).
export const LIVE_KEY = "procm.sysLive";
export const INTERVAL_KEY = "procm.sysInterval";
export const PORTS_ONLY_KEY = "procm.sysPortsOnly";

// Live-refresh polling intervals offered in the toolbar select (ms).
export const INTERVAL_OPTIONS = [1000, 2000, 3000, 5000] as const;
