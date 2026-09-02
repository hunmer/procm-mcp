import type { ProcessStatus, ProcessView } from "@/lib/types";
interface ProcessListProps {
  processes: ProcessView[];
  // True until the first snapshot (REST or WS) lands — skeleton cards instead
  // of the empty state, so a loading list can't be mistaken for "no processes".
  loading?: boolean;
  selectedId: string | null;
  // Per-process unread log counts, keyed by process id.
  unread: Record<string, number>;
  // Toggle the favorite field on a process.
  onToggleFavorite: (p: ProcessView) => void;
  onSelectLogs: (p: ProcessView) => void;
  onView: (p: ProcessView) => void;
  onToast: (message: string, isError?: boolean) => void;
  // Open a group's folder in the OS file manager (group label is a path).
  onOpenFolder: (path: string) => void;
}

export type { ProcessListProps };

export type StatusFilter = "all" | ProcessStatus | "expired";

// How the processes inside each group are ordered. "none" keeps the
// backend's push order; "startedAt" sorts newest-first; "name" sorts
// case-insensitively by process name. Pinned rows float to the top in
// every mode.
export type SortMode = "none" | "startedAt" | "name";

// Which layout renders the process list: "grouped" stacks collapsible card
// groups vertically (default); "board" renders one fixed-width column per
// group with dense rows — no collapsing, ordering driven by the sort select.
export type ViewMode = "grouped" | "board";

export interface ProcessGroup {
  label: string;
  processes: ProcessView[];
  imageIcon?: string;
}

export const VIEW_OPTIONS: { value: ViewMode; labelKey: string }[] = [
  { value: "grouped", labelKey: "processes.viewGrouped" },
  { value: "board", labelKey: "processes.viewBoard" },
];

export const SORT_OPTIONS: { value: SortMode; labelKey: string }[] = [
  { value: "none", labelKey: "processes.sortNone" },
  { value: "startedAt", labelKey: "processes.sortStartedAt" },
  { value: "name", labelKey: "processes.sortName" },
];

// Color dot shown before each status option. Mirrors StatusBadge semantics.
export const STATUS_DOT: Record<StatusFilter, string> = {
  all: "bg-muted-foreground/50",
  running: "bg-success",
  spawning: "bg-warning",
  exited: "bg-muted-foreground",
  error: "bg-destructive",
  expired: "bg-muted-foreground/30",
};

export const STATUS_OPTIONS: { value: StatusFilter; labelKey: string }[] = [
  { value: "all", labelKey: "processes.filterAll" },
  { value: "running", labelKey: "processes.filterRunning" },
  { value: "spawning", labelKey: "processes.filterSpawning" },
  { value: "exited", labelKey: "processes.filterExited" },
  { value: "error", labelKey: "processes.filterError" },
  { value: "expired", labelKey: "processes.filterExpired" },
];

// Bundled per-row action callbacks. Passed as a single object to the views
// and the shared context menu so call sites stay terse.
export interface RowActions {
  onSelectLogs: (p: ProcessView) => void;
  onView: (p: ProcessView) => void;
  onToggleFavorite: (p: ProcessView) => void;
  onRestart: (id: string) => void;
  onRequestStop: (p: ProcessView) => void;
  onRequestDelete: (p: ProcessView) => void;
  onCopyId: (p: ProcessView) => void;
  onCopyCommand: (p: ProcessView) => void;
}
