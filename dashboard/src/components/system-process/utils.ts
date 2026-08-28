import type { CSSProperties } from "react";
import type { Column, SortingState } from "@tanstack/react-table";
import type { SystemProcess } from "@/lib/types";
import type { ProcessRow } from "./types";

// ---- tiny localStorage helpers (best-effort; mirror useTheme.ts pattern) ----

export function readBool(key: string, fallback: boolean): boolean {
  if (typeof localStorage === "undefined") return fallback;
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === "1";
}
export function writeBool(key: string, value: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
}
export function readNum(key: string, fallback: number): number {
  if (typeof localStorage === "undefined") return fallback;
  const v = localStorage.getItem(key);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
export function writeNum(key: string, value: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

// Resolve the best on-disk executable path for a process: prefer the OS-provided
// `exe`, otherwise parse the executable token out of the command line (it leads
// the args, optionally quoted). Returns null when neither yields a path — used
// to disable "Open process location" and to render the field as empty.
function exePathOf(p: SystemProcess): string | null {
  if (p.exe) return p.exe;
  if (!p.cmd) return null;
  // Match either a leading quoted path ("...") or the first whitespace token.
  const m = p.cmd.match(/^"([^"]+)"|^(\S+)/);
  return m ? m[1] || m[2] || null : null;
}

// Resolve the best on-disk executable path for a row: the first member whose
// `exe` or leading command-line token yields a path (merged rows may mix
// members with and without a resolvable path).
export function exePathOfRow(row: ProcessRow): string | null {
  for (const m of row.members) {
    const path = exePathOf(m);
    if (path) return path;
  }
  return null;
}

// Group a snapshot into display rows. Members are kept pid-ascending so the
// representative is stable, and insertion order preserves the snapshot's
// ordering for the (unsorted) default view.
export function groupProcesses(processes: SystemProcess[]): ProcessRow[] {
  const groups = new Map<string, SystemProcess[]>();
  for (const p of processes) {
    const key = `${p.name}|${p.ppid}`;
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }
  const rows: ProcessRow[] = [];
  for (const [key, members] of groups) {
    members.sort((a, b) => a.pid - b.pid);
    const first = members[0];
    const ports = new Set<number>();
    for (const m of members) for (const port of m.ports ?? []) ports.add(port);
    rows.push({
      key,
      members,
      name: first.name,
      pid: first.pid,
      ppid: first.ppid,
      cmd: first.cmd,
      exe: members.find((m) => m.exe)?.exe ?? null,
      ports: [...ports].sort((a, b) => a - b),
    });
  }
  return rows;
}

// Wrap a single process (e.g. a port-lookup hit) as a one-member row so the
// shared info panel/dialog renders it without special cases.
export function rowOfProcess(p: SystemProcess): ProcessRow {
  return {
    key: `${p.name}|${p.ppid}`,
    members: [p],
    name: p.name,
    pid: p.pid,
    ppid: p.ppid,
    cmd: p.cmd,
    exe: p.exe,
    ports: p.ports,
  };
}

// Keep the UI compatible with snapshots produced by older backends and with
// JSON values that may arrive as strings. A normalized `ports` array is the
// single source used by both the badge renderer and the port-first comparator.
export function normalizeSystemProcess(process: SystemProcess): SystemProcess {
  const raw = process as SystemProcess & { port?: unknown };
  const values = Array.isArray(raw.ports)
    ? raw.ports
    : raw.port == null
      ? []
      : [raw.port];
  const ports = [...new Set(
    values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 65535),
  )].sort((a, b) => a - b);
  return { ...process, ports: ports.length > 0 ? ports : undefined };
}

// The raw comparable value for a sortable column. Numbers compare numerically
// (pid/ppid); text compares case-insensitively.
function sortValue(p: ProcessRow, id: string): number | string {
  switch (id) {
    case "pid":
      return p.pid;
    case "ppid":
      return p.ppid;
    case "ports":
      return p.ports?.[0] ?? 0;
    case "name":
      return p.name.toLowerCase();
    case "path":
      return (p.exe ?? "").toLowerCase();
    case "command":
      return (p.cmd ?? "").toLowerCase();
    default:
      return "";
  }
}

// Authoritative row comparator for the System table. Ordering, in priority:
//   1. Rows listening on a port ALWAYS come first (servers stay pinned to
//      the top regardless of the active column sort).
//   2. The user's selected column(s), in sorting-state order (asc/desc).
//   3. Name ascending (case-insensitive, natural numeric order) as a stable
//      tiebreaker — also the whole order when no column is selected.
export function compareProcessRows(
  a: ProcessRow,
  b: ProcessRow,
  sorting: SortingState,
): number {
  const aHasPorts = (a.ports?.length ?? 0) > 0;
  const bHasPorts = (b.ports?.length ?? 0) > 0;
  if (aHasPorts !== bHasPorts) return aHasPorts ? -1 : 1;

  for (const s of sorting) {
    const av = sortValue(a, s.id);
    const bv = sortValue(b, s.id);
    let cmp: number;
    if (typeof av === "number" && typeof bv === "number") {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv));
    }
    if (cmp !== 0) return s.desc ? -cmp : cmp;
  }

  return a.name.localeCompare(b.name, undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

// Optional per-column width classes, declared on the columnDef's meta and
// applied to both the header and every cell of that column (merged with the
// sticky-pin classes at the render sites). Currently used to give the
// wrapping name column a fixed width.
export function colWidthClass(column: Column<ProcessRow>): string | undefined {
  return (column.columnDef.meta as { className?: string } | undefined)
    ?.className;
}

// Generic sticky-column styling (the Processes table's pinnedColAttrs is typed
// for ProcessView; this is the ProcessRow equivalent). Pins `name` left and
// `actions` right per the table's columnPinning initialState.
export function pinnedColAttrs(
  column: Column<ProcessRow>,
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
